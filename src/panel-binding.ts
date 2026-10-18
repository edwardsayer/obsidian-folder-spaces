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
  private readonly childrenOf = new Map<string, Set<string>>();

  register(view: PanelBindingView): void {
    if (view?.panelId) this.panels.set(view.panelId, view);
  }

  unregister(panelId: string): void {
    this.unbind(panelId);
    for (const childId of [...(this.childrenOf.get(panelId) ?? [])]) this.unbind(childId);
    this.panels.delete(panelId);
  }

  bind(parentId: string, childId: string): void {
    if (!parentId || !childId || parentId === childId) return;
    const parent = this.panels.get(parentId);
    const child = this.panels.get(childId);
    if (!parent || !child || this.isAncestor(childId, parentId)) return;

    const previousParentId = this.parentOf.get(childId);
    if (previousParentId === parentId) return;
    if (previousParentId) this.removeChild(previousParentId, childId);
    this.parentOf.set(childId, parentId);
    let children = this.childrenOf.get(parentId);
    if (!children) this.childrenOf.set(parentId, children = new Set());
    children.add(childId);
    child.parentPanelId = parentId;
    child.onBindingChanged?.();
    if (previousParentId) this.panels.get(previousParentId)?.onBindingChanged?.();
    parent.onBindingChanged?.();
  }

  unbind(panelId: string): void {
    const parentId = this.parentOf.get(panelId);
    if (parentId) {
      this.removeChild(parentId, panelId);
      this.parentOf.delete(panelId);
      this.panels.get(parentId)?.onBindingChanged?.();
    }
    const child = this.panels.get(panelId);
    if (child && child.parentPanelId !== null) {
      child.parentPanelId = null;
      child.onBindingChanged?.();
    }
  }

  getParentOf(panelId: string): PanelBindingView | null {
    const parentId = this.parentOf.get(panelId);
    return parentId ? (this.panels.get(parentId) ?? null) : null;
  }

  getChildrenOf(parentId: string): PanelBindingView[] {
    return [...(this.childrenOf.get(parentId) ?? [])]
      .map((id) => this.panels.get(id))
      .filter((view): view is PanelBindingView => Boolean(view?.isAlive()));
  }

  getChildOf(parentId: string): PanelBindingView | null {
    return this.getChildrenOf(parentId)[0] ?? null;
  }

  hasChild(parentId: string): boolean {
    return this.getChildrenOf(parentId).length > 0;
  }

  propagateFrom(parentId: string, explicitPath?: string | null): void {
    const parent = this.panels.get(parentId);
    const nextPath = explicitPath ?? parent?.getFolderPath() ?? null;
    let changed = false;
    for (const child of this.getChildrenOf(parentId)) {
      if (!child.followParent || nextPath === child.getFolderPath()) continue;
      child.setFolderPath(nextPath, { preserveViewSettings: true });
      changed = true;
    }
    if (changed) parent?.onBindingChanged?.();
  }

  reconcile(): boolean {
    let changed = false;
    for (const [panelId, view] of [...this.panels]) {
      if (!view.isAlive()) {
        this.unregister(panelId);
        changed = true;
        continue;
      }
      const desiredParentId = view.parentPanelId;
      if (!desiredParentId) {
        if (this.parentOf.has(panelId)) { this.unbind(panelId); changed = true; }
        continue;
      }
      const parent = this.panels.get(desiredParentId);
      if (parent?.isAlive()) {
        if (this.parentOf.get(panelId) !== desiredParentId) {
          this.bind(desiredParentId, panelId);
          changed = this.parentOf.get(panelId) === desiredParentId || changed;
        }
      } else if (this.parentOf.has(panelId) || view.parentPanelId) {
        this.unbind(panelId);
        changed = true;
      }
    }
    for (const view of this.panels.values()) if (view.isAlive()) view.onBindingChanged?.();
    return changed;
  }

  clear(): void {
    this.panels.clear();
    this.parentOf.clear();
    this.childrenOf.clear();
  }

  get panelCount(): number { return this.panels.size; }

  private removeChild(parentId: string, childId: string): void {
    const children = this.childrenOf.get(parentId);
    children?.delete(childId);
    if (children?.size === 0) this.childrenOf.delete(parentId);
  }

  private isAncestor(maybeAncestorId: string, fromPanelId: string): boolean {
    let current = fromPanelId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parentId = this.parentOf.get(current);
      if (!parentId) return false;
      if (parentId === maybeAncestorId) return true;
      current = parentId;
    }
    return true;
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

  const related = targetType === "parent"
    ? [manager.getParentOf(sourcePanelId)]
    : manager.getChildrenOf(sourcePanelId);
  for (const panel of related) {
    if (panel) applyHighlight(panel.leaf ?? panel.containerEl ?? panel, highlight);
  }
}
