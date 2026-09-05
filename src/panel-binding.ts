/**
 * Tracks which Folder Space panels are bound to a "parent" panel. A bound child
 * panel can mirror the parent panel's folder focus (the "sync focus with parent
 * panel" toggle): when the parent's folder focus moves, the child follows.
 *
 * The manager is intentionally Obsidian-free — it operates on small structural
 * handles (`PanelBindingView`) so it can be unit-tested in Node without a GUI.
 *
 * Binding rules:
 * - A parent panel has at most one bound child (1:1).
 * - Panels can nest to any depth (parent -> child -> grandchild -> ...); the
 *   focus cascade propagates down the whole chain.
 * - Bindings persist through the view state (`parentPanelId`) and are
 *   re-established on layout change via `reconcile()`.
 */
export interface PanelBindingView {
  panelId: string;
  parentPanelId: string | null;
  followParent: boolean;
  isAlive(): boolean;
  getFolderPath(): string | null;
  setFolderPath(path: string | null, options?: FolderPathChangeOptions): void;
  onBindingChanged?(): void;
  containerEl?: HTMLElement;
  leaf?: unknown;
}

export interface FolderPathChangeOptions {
  preserveViewSettings?: boolean;
}

export function generatePanelId(): string {
  try {
    const uuid = (window as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
    if (uuid) {
      return uuid;
    }
  } catch {
    // Ignore and fall back below.
  }
  return `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class PanelBindingManager {
  private readonly panels = new Map<string, PanelBindingView>();
  private readonly parentOf = new Map<string, string>();
  private readonly childOf = new Map<string, string>();

  /**
   * Registers (or refreshes) a panel in the manager. This is non-destructive:
   * existing bindings are kept, so re-registering every Folder Space leaf on
   * every layout change is safe. Use `reconcile()` to prune dead panels and
   * re-link bindings derived from persisted `parentPanelId` values.
   */
  register(view: PanelBindingView): void {
    if (!view || !view.panelId) {
      return;
    }
    this.panels.set(view.panelId, view);
  }

  unregister(panelId: string): void {
    const parentId = this.parentOf.get(panelId);
    if (parentId) {
      this.parentOf.delete(panelId);
      this.childOf.delete(parentId);
      this.panels.get(parentId)?.onBindingChanged?.();
    }

    const childId = this.childOf.get(panelId);
    if (childId) {
      this.childOf.delete(panelId);
      this.parentOf.delete(childId);
      const child = this.panels.get(childId);
      if (child) {
        child.parentPanelId = null;
        child.onBindingChanged?.();
      }
    }

    this.panels.delete(panelId);
  }

  bind(parentId: string, childId: string): void {
    if (!parentId || !childId || parentId === childId) {
      return;
    }

    const parent = this.panels.get(parentId);
    const child = this.panels.get(childId);
    if (!parent || !child) {
      return;
    }

    // Prevent cycles: the new parent must not already be a descendant of the
    // child (i.e. the child is an ancestor of the parent).
    if (this.isAncestor(childId, parentId)) {
      return;
    }

    const previousParentId = this.parentOf.get(childId);
    if (previousParentId && previousParentId !== parentId) {
      this.parentOf.delete(childId);
      this.childOf.delete(previousParentId);
    }

    const previousChildId = this.childOf.get(parentId);
    if (previousChildId && previousChildId !== childId) {
      this.parentOf.delete(previousChildId);
      const previousChild = this.panels.get(previousChildId);
      if (previousChild) {
        previousChild.parentPanelId = null;
        previousChild.onBindingChanged?.();
      }
    }

    this.parentOf.set(childId, parentId);
    this.childOf.set(parentId, childId);
    child.parentPanelId = parentId;
    child.onBindingChanged?.();
    parent.onBindingChanged?.();
  }

  unbind(panelId: string): void {
    const parentId = this.parentOf.get(panelId);
    if (parentId) {
      this.parentOf.delete(panelId);
      this.childOf.delete(parentId);
      this.panels.get(parentId)?.onBindingChanged?.();
    }

    const child = this.panels.get(panelId);
    if (child) {
      child.parentPanelId = null;
      child.onBindingChanged?.();
    }
  }

  getParentOf(panelId: string): PanelBindingView | null {
    const parentId = this.parentOf.get(panelId);
    return parentId ? (this.panels.get(parentId) ?? null) : null;
  }

  getChildOf(parentId: string): PanelBindingView | null {
    const childId = this.childOf.get(parentId);
    return childId ? (this.panels.get(childId) ?? null) : null;
  }

  hasChild(parentId: string): boolean {
    return Boolean(this.childOf.get(parentId));
  }

  /**
   * Pushes the parent panel's folder focus down to its bound child, if any.
   * `explicitPath` is used when the parent's focus moved to a specific folder
   * (e.g. a folder clicked in the parent tree); otherwise the parent's current
   * folder path is used. The child only follows when its `followParent` toggle
   * is ON. The cascade continues one level at a time: the child's own scope
   * change re-triggers `propagateFrom` for its bound child, and so on down the
   * chain.
   */
  propagateFrom(parentId: string, explicitPath?: string | null): void {
    const parent = this.panels.get(parentId);
    const child = this.getChildOf(parentId);
    if (!child || !child.isAlive() || !child.followParent) {
      return;
    }

    const nextPath = explicitPath ?? parent?.getFolderPath() ?? null;
    if (nextPath === child.getFolderPath()) {
      return;
    }
    child.setFolderPath(nextPath, { preserveViewSettings: true });
    parent?.onBindingChanged?.();
  }

  /**
   * Prunes dead panels, re-links bindings derived from persisted
   * `parentPanelId` values, and breaks stale bindings whose parent is gone.
   * Returns whether any binding changed, so callers can decide whether to
   * persist the corrected state.
   */
  reconcile(): boolean {
    let changed = false;

    for (const [panelId, view] of [...this.panels]) {
      if (!view.isAlive()) {
        this.unregister(panelId);
        changed = true;
        continue;
      }

      if (!view.parentPanelId) {
        continue;
      }

      const parent = this.panels.get(view.parentPanelId);
      if (parent && parent.isAlive()) {
        if (this.parentOf.get(panelId) !== view.parentPanelId) {
          this.link(view.parentPanelId, panelId);
          changed = true;
        }
      } else if (this.parentOf.get(panelId)) {
        this.unbind(panelId);
        changed = true;
      }
    }

    for (const [childId, parentId] of [...this.parentOf]) {
      const parent = this.panels.get(parentId);
      if (!parent || !parent.isAlive()) {
        this.unbind(childId);
        changed = true;
      }
    }

    for (const view of this.panels.values()) {
      if (view.isAlive()) {
        view.onBindingChanged?.();
      }
    }

    return changed;
  }

  clear(): void {
    this.panels.clear();
    this.parentOf.clear();
    this.childOf.clear();
  }

  get panelCount(): number {
    return this.panels.size;
  }

  /**
   * Returns whether `maybeAncestorId` appears anywhere in `fromPanelId`'s chain
   * of ancestors (walking `parentOf` upward). Used to reject cyclic bindings.
   */
  private isAncestor(maybeAncestorId: string, fromPanelId: string): boolean {
    let current = fromPanelId;
    for (let depth = 0; depth < 1000; depth += 1) {
      const parentId = this.parentOf.get(current);
      if (!parentId) {
        return false;
      }
      if (parentId === maybeAncestorId) {
        return true;
      }
      current = parentId;
    }
    return false;
  }

  private link(parentId: string, childId: string): void {
    if (!parentId || !childId || parentId === childId) {
      return;
    }
    if (!this.panels.has(parentId) || !this.panels.has(childId)) {
      return;
    }

    const existingParentId = this.parentOf.get(childId);
    if (existingParentId) {
      if (existingParentId === parentId) {
        return;
      }
      this.childOf.delete(existingParentId);
    }

    const existingChildId = this.childOf.get(parentId);
    if (existingChildId && existingChildId !== childId) {
      this.parentOf.delete(existingChildId);
    }

    this.parentOf.set(childId, parentId);
    this.childOf.set(parentId, childId);
  }
}

function applyHighlight(target: unknown, highlight: boolean): void {
  if (!target || typeof target !== "object") return;
  const candidate = target as {
    highlight?(): void;
    unhighlight?(): void;
    containerEl?: HTMLElement;
    addClass?(cls: string): void;
    removeClass?(cls: string): void;
  };
  if (highlight) {
    if (typeof candidate.highlight === "function") {
      candidate.highlight();
    } else if (candidate.containerEl && typeof candidate.containerEl.addClass === "function") {
      candidate.containerEl.addClass("is-highlighted");
    } else if (typeof candidate.addClass === "function") {
      candidate.addClass("is-highlighted");
    }
  } else {
    if (typeof candidate.unhighlight === "function") {
      candidate.unhighlight();
    } else if (candidate.containerEl && typeof candidate.containerEl.removeClass === "function") {
      candidate.containerEl.removeClass("is-highlighted");
    } else if (typeof candidate.removeClass === "function") {
      candidate.removeClass("is-highlighted");
    }
  }
}

/**
 * Toggles the linked view highlight on both sides of a parent-child binding.
 * Uses Obsidian's native `leaf.highlight()` / `leaf.unhighlight()` (which applies
 * `is-highlighted` with native 25% accent color overlay).
 */
export function toggleLinkedViewsHighlight(
  manager: PanelBindingManager | undefined | null,
  sourcePanelId: string,
  sourceTarget: unknown,
  targetType: "parent" | "child",
  highlight: boolean
): void {
  applyHighlight(sourceTarget, highlight);

  if (!manager) {
    return;
  }

  const other = targetType === "parent"
    ? manager.getParentOf(sourcePanelId)
    : manager.getChildOf(sourcePanelId);

  if (other) {
    applyHighlight(other.leaf ?? other.containerEl ?? other, highlight);
  }
}
