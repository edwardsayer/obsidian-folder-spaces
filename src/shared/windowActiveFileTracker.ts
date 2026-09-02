import type { App, WorkspaceLeaf, TFile } from "obsidian";
import { getWindowOfLeaf } from "./popoutLayout.js";

export interface PatchableViewOnFileOpen {
  onFileOpen?: (file: TFile | null) => void;
  __sharedOriginalOnFileOpen?: (file: TFile | null) => void;
  _fsOriginalOnFileOpen?: (file: TFile | null) => void;
  leaf?: WorkspaceLeaf;
  containerEl?: HTMLElement;
}

/** Legacy alias for FolderSpaces compatibility. */
export type PatchableFileExplorerView = PatchableViewOnFileOpen;

export interface WindowActiveFileTrackerState {
  windowActiveFiles: WeakMap<Window, TFile | null>;
  lastActiveWindow: Window | null;
  patchedViews: Set<PatchableViewOnFileOpen>;
}

type GlobalNamespace = typeof globalThis & {
  __obsidian_window_active_file_tracker_state_v1__?: WindowActiveFileTrackerState;
};

export function getSharedActiveFileState(): WindowActiveFileTrackerState {
  const namespace = globalThis as GlobalNamespace;
  let state = namespace.__obsidian_window_active_file_tracker_state_v1__;
  if (!state) {
    state = {
      windowActiveFiles: new WeakMap<Window, TFile | null>(),
      lastActiveWindow: null,
      patchedViews: new Set<PatchableViewOnFileOpen>(),
    };
    namespace.__obsidian_window_active_file_tracker_state_v1__ = state;
  }
  return state;
}

export function isWindowObject(val: unknown): val is Window {
  if (!val || typeof val !== "object") return false;
  const anyVal = val as { window?: unknown; document?: unknown; isMockWindow?: boolean };
  if (anyVal.isMockWindow) return true;
  return anyVal.window === val && typeof anyVal.document === "object";
}

export function isHTMLElement(val: unknown): val is HTMLElement {
  if (!val || typeof val !== "object") return false;
  const anyVal = val as { nodeType?: unknown; ownerDocument?: unknown };
  return anyVal.nodeType === 1 && typeof anyVal.ownerDocument === "object";
}

/**
 * Tracks the active file per window and enforces window boundary isolation
 * during onFileOpen / auto-reveal operations.
 */
export class WindowActiveFileTracker {
  private readonly state: WindowActiveFileTrackerState;

  constructor(private readonly app: App, state?: WindowActiveFileTrackerState) {
    this.state = state ?? getSharedActiveFileState();
  }

  /**
   * Tracks the active leaf when workspace focus or active leaf changes.
   */
  trackActiveLeaf(leaf: WorkspaceLeaf | null | undefined): void {
    if (!leaf) {
      return;
    }
    const win = getWindowOfLeaf(leaf);
    if (!win) {
      return;
    }
    this.setLastActiveWindow(win);
    const view = leaf.view as { file?: unknown } | null | undefined;
    if (view && typeof view === "object" && "file" in view && (view as { file: unknown }).file) {
      this.setWindowActiveFile(win, (view as { file: TFile }).file);
    }
  }

  /**
   * Tracks active file when a file-open event fires.
   */
  trackFileOpen(file: TFile | null, sourceLeaf?: WorkspaceLeaf | null): void {
    const leaf =
      sourceLeaf ??
      (this.app?.workspace
        ? (this.app.workspace as { activeLeaf?: WorkspaceLeaf | null }).activeLeaf
        : null);
    const win = leaf ? getWindowOfLeaf(leaf) : null;
    if (win) {
      this.setLastActiveWindow(win);
      if (file) {
        this.setWindowActiveFile(win, file);
      }
    }
  }

  /**
   * Retrieves the active file for a given window, falling back to the global active file.
   */
  getActiveFileForWindow(win: Window | null | undefined): TFile | null {
    if (!win) {
      return this.app?.workspace?.getActiveFile?.() ?? null;
    }
    const file = this.state.windowActiveFiles.get(win);
    if (file !== undefined) {
      return file;
    }
    // Fallback: check if the global active leaf belongs to this window
    const activeLeaf = this.app?.workspace
      ? (this.app.workspace as { activeLeaf?: WorkspaceLeaf | null }).activeLeaf
      : null;
    if (activeLeaf && getWindowOfLeaf(activeLeaf) === win) {
      return this.app.workspace.getActiveFile?.() ?? null;
    }
    return null;
  }

  /**
   * Returns the last known active window.
   */
  getLastActiveWindow(): Window | null {
    return this.state.lastActiveWindow;
  }

  /**
   * Sets the last known active window explicitly (useful for testing or window focus tracking).
   */
  setLastActiveWindow(win: Window | null): void {
    this.state.lastActiveWindow = win;
  }

  /**
   * Explicitly sets the active file for a window (useful for testing or direct routing).
   */
  setWindowActiveFile(win: Window, file: TFile | null): void {
    this.state.windowActiveFiles.set(win, file);
  }

  /**
   * Determines whether an onFileOpen event should be processed by a view in `viewLeafOrWindowOrEl`.
   * Returns false if the event was triggered by a different window.
   */
  shouldProcessFileOpen(
    viewLeafOrWindowOrEl: WorkspaceLeaf | Window | HTMLElement | null | undefined
  ): boolean {
    if (!viewLeafOrWindowOrEl) {
      return true;
    }
    let viewWindow: Window | null = null;
    if (isWindowObject(viewLeafOrWindowOrEl)) {
      viewWindow = viewLeafOrWindowOrEl;
    } else if (isHTMLElement(viewLeafOrWindowOrEl)) {
      viewWindow = (viewLeafOrWindowOrEl as HTMLElement).ownerDocument?.defaultView ?? null;
    } else {
      viewWindow = getWindowOfLeaf(viewLeafOrWindowOrEl as WorkspaceLeaf);
    }
    if (!viewWindow || !this.state.lastActiveWindow) {
      return true;
    }
    return viewWindow === this.state.lastActiveWindow;
  }

  /**
   * Patches a FileExplorerView, FolderSpaceView, or other onFileOpen view instance
   * to enforce window boundary isolation.
   */
  patchViewInstance(view: PatchableViewOnFileOpen | null | undefined): void {
    if (
      !view ||
      typeof view.onFileOpen !== "function" ||
      view.__sharedOriginalOnFileOpen ||
      view._fsOriginalOnFileOpen
    ) {
      return;
    }
    const original = view.onFileOpen;
    view.__sharedOriginalOnFileOpen = original;
    view._fsOriginalOnFileOpen = original;
    const tracker = this;
    view.onFileOpen = function (file: TFile | null) {
      const targetLeaf =
        view.leaf ??
        (view.containerEl
          ? ({ containerEl: view.containerEl } as unknown as WorkspaceLeaf)
          : null);
      if (!tracker.shouldProcessFileOpen(targetLeaf)) {
        return;
      }
      return original.call(this, file);
    };
    this.state.patchedViews.add(view);
  }

  /**
   * Restores a single patched view instance.
   */
  restoreViewInstance(view: PatchableViewOnFileOpen | null | undefined): void {
    if (!view) {
      return;
    }
    const original = view.__sharedOriginalOnFileOpen ?? view._fsOriginalOnFileOpen;
    if (original) {
      view.onFileOpen = original;
      delete view.__sharedOriginalOnFileOpen;
      delete view._fsOriginalOnFileOpen;
    }
    this.state.patchedViews.delete(view);
  }

  /**
   * Restores all patched view instances when the plugin is unloaded.
   */
  restoreAll(): void {
    for (const view of Array.from(this.state.patchedViews)) {
      this.restoreViewInstance(view);
    }
    this.state.patchedViews.clear();
    this.state.lastActiveWindow = null;
  }
}
