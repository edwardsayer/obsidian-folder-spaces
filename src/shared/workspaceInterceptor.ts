import { App, WorkspaceLeaf, TFile } from "obsidian";
import { getWindowOfLeaf, isPopoutWindow, PopoutLayoutEngine } from "./popoutLayout.js";
import { WindowActiveFileTracker } from "./windowActiveFileTracker.js";

/**
 * Generic policy supplied by a plugin to the shared Workspace interceptor.
 * The coordinator itself does not know which plugin registered the policy.
 */
export interface WorkspaceInterceptorParticipant {
  id: string;
  engine: PopoutLayoutEngine;
  isEnabled?: () => boolean;
  isManagedWindow?: (win: Window) => boolean;
}

interface EnsureSideLeafOptions {
  active?: boolean;
  split?: boolean;
  reveal?: boolean;
  state?: Record<string, unknown>;
}

interface EventSubscription {
  name?: string;
  fn?: unknown;
  ctx?: unknown;
}

interface InterceptableWorkspace {
  revealLeaf?: (leaf: WorkspaceLeaf) => Promise<void>;
  setActiveLeaf?: (leaf: WorkspaceLeaf, params?: { focus?: boolean }) => void;
  requestSaveLayout?: () => Promise<void>;
  getLeftLeaf?: (split: boolean) => WorkspaceLeaf | null;
  getRightLeaf?: (split: boolean) => WorkspaceLeaf | null;
  getLeaf?: (newLeaf?: boolean | string) => WorkspaceLeaf;
  getLeavesOfType?: (type: string) => WorkspaceLeaf[];
  ensureSideLeaf?: (
    viewType: string,
    side: "left" | "right",
    options?: EnsureSideLeafOptions
  ) => Promise<WorkspaceLeaf>;
  createLeafBySplit?: (
    leaf: WorkspaceLeaf,
    direction?: "vertical" | "horizontal",
    before?: boolean
  ) => WorkspaceLeaf;
  tryTrigger?: (subscription: EventSubscription, args: unknown[]) => void;
  getActiveFile?: () => TFile | null;
  __workspaceInterceptorInstalled?: boolean;
  __workspaceInterceptorOriginalGetLeftLeaf?: (split: boolean) => WorkspaceLeaf | null;
  __workspaceInterceptorOriginalGetRightLeaf?: (split: boolean) => WorkspaceLeaf | null;
  __workspaceInterceptorOriginalGetLeaf?: (newLeaf?: boolean | string) => WorkspaceLeaf;
  __workspaceInterceptorOriginalGetLeavesOfType?: (type: string) => WorkspaceLeaf[];
  __workspaceInterceptorOriginalEnsureSideLeaf?: (
    viewType: string,
    side: "left" | "right",
    options?: EnsureSideLeafOptions
  ) => Promise<WorkspaceLeaf>;
  __workspaceInterceptorOriginalTryTrigger?: (
    subscription: EventSubscription,
    args: unknown[]
  ) => void;
  __workspaceInterceptorOriginalGetActiveFile?: () => TFile | null;
}

interface OriginalWorkspaceMethods {
  getLeftLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getLeftLeaf"] };
  getRightLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getRightLeaf"] };
  getLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getLeaf"] };
  getLeavesOfType: { hadOwn: boolean; value?: InterceptableWorkspace["getLeavesOfType"] };
  ensureSideLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["ensureSideLeaf"] };
  tryTrigger: { hadOwn: boolean; value?: InterceptableWorkspace["tryTrigger"] };
  getActiveFile: { hadOwn: boolean; value?: InterceptableWorkspace["getActiveFile"] };
}

interface InterceptorState {
  app: App;
  workspace: InterceptableWorkspace;
  participants: Map<string, WorkspaceInterceptorParticipant>;
  tracker: WindowActiveFileTracker;
  installed: boolean;
  originalMethods?: OriginalWorkspaceMethods;
  eventRefs?: unknown[];
}

type GlobalNamespace = typeof window & {
  __obsidian_workspace_interceptor_state_v1__?: InterceptorState;
};

function getState(app: App): InterceptorState {
  const namespace = window as unknown as GlobalNamespace;
  const existing = namespace.__obsidian_workspace_interceptor_state_v1__;
  if (existing) {
    if (existing.participants.size === 0 && !existing.installed) {
      existing.app = app;
      existing.workspace = app.workspace as unknown as InterceptableWorkspace;
    }
    return existing;
  }

  const state: InterceptorState = {
    app,
    workspace: app.workspace as unknown as InterceptableWorkspace,
    participants: new Map<string, WorkspaceInterceptorParticipant>(),
    tracker: new WindowActiveFileTracker(app),
    installed: false,
    originalMethods: undefined,
    eventRefs: [],
  };
  namespace.__obsidian_workspace_interceptor_state_v1__ = state;
  return state;
}

function hasWindowFocus(win: Window | null | undefined): boolean {
  const document = win?.document;
  if (!document) return false;
  if (typeof document.hasFocus !== "function") return true;
  return document.hasFocus();
}

function getActivePopoutWindow(state: InterceptorState): Window | null {
  const mainWindow = typeof window !== "undefined" ? window : null;
  if (hasWindowFocus(mainWindow)) return null;

  const focusedWindow = typeof activeWindow !== "undefined" ? activeWindow : null;
  if (focusedWindow === mainWindow) return null;
  if (
    focusedWindow &&
    focusedWindow !== mainWindow &&
    isPopoutWindow(focusedWindow) &&
    hasWindowFocus(focusedWindow)
  ) {
    return focusedWindow;
  }

  let focusedPopout: Window | null = null;
  const workspace = state.workspace as unknown as {
    iterateAllLeaves?: (callback: (leaf: WorkspaceLeaf) => void) => void;
  };
  // 解構後必須以 call(workspace) 綁定 this，否則原生 iterateAllLeaves 內部
  // 的 this.iterateLeaves 會因 this 為 undefined 而拋錯，中斷 restore 流程。
  workspace.iterateAllLeaves?.call(workspace, (leaf) => {
    const win = getWindowOfLeaf(leaf);
    if (!focusedPopout && win && isPopoutWindow(win) && hasWindowFocus(win)) {
      focusedPopout = win;
    }
  });
  return focusedPopout;
}

function isParticipantEnabled(participant: WorkspaceInterceptorParticipant): boolean {
  try {
    return participant.isEnabled ? participant.isEnabled() : true;
  } catch {
    return false;
  }
}

function getParticipantForWindow(
  state: InterceptorState,
  win: Window
): WorkspaceInterceptorParticipant | null {
  for (const participant of state.participants.values()) {
    if (!isParticipantEnabled(participant)) continue;
    try {
      if (!participant.isManagedWindow || participant.isManagedWindow(win)) return participant;
    } catch {
      // A failing plugin policy must not affect other participants.
    }
  }
  return null;
}

function routeSideLeaf(state: InterceptorState, side: "left" | "right"): WorkspaceLeaf | null {
  const activeWindow = getActivePopoutWindow(state);
  const participant = activeWindow ? getParticipantForWindow(state, activeWindow) : null;
  const engine = participant?.engine ?? null;
  if (!activeWindow || !engine) return null;

  try {
    return engine.openSideLeafSync(activeWindow, side);
  } catch {
    return null;
  }
}

function routeGetLeaf(
  state: InterceptorState,
  newLeaf?: boolean | string
): WorkspaceLeaf | null {
  const activeWindow = getActivePopoutWindow(state);
  const participant = activeWindow ? getParticipantForWindow(state, activeWindow) : null;
  const engine = participant?.engine ?? null;
  if (!activeWindow || !engine) return null;

  if (newLeaf === "left" || newLeaf === "right") {
    return engine.openSideLeafSync(activeWindow, newLeaf);
  }

  if (newLeaf === "window") {
    return null;
  }

  const isNewContentLeafRequested = newLeaf === true || newLeaf === "tab" || newLeaf === "split";
  if (isNewContentLeafRequested) {
    // Route every explicit new tab/split request through the engine so a
    // content group remembered before a sidebar click remains the target.
    const centerLeaf =
      newLeaf === "split"
        ? engine.getCenterLeafSync(activeWindow)
        : engine.getCenterLeafSync(activeWindow, newLeaf);
    return newLeaf === "split" ? splitCenterLeaf(state.workspace, centerLeaf) : centerLeaf;
  }

  const activeLeaf = engine.getActiveLeafInWindow(activeWindow);
  if (activeLeaf && engine.isLeafInSideColumn(activeWindow, activeLeaf)) {
    return engine.getCenterLeafSync(activeWindow, newLeaf);
  }

  if (!activeLeaf || getWindowOfLeaf(activeLeaf) !== activeWindow) {
    return engine.getCenterLeafSync(activeWindow, newLeaf);
  }

  return null;
}

/** 以中央編輯區 leaf 為錨點建立 split；失敗或無 API 時回傳 null（fallback 原生）。 */
function splitCenterLeaf(
  workspace: InterceptableWorkspace,
  centerLeaf: WorkspaceLeaf | null
): WorkspaceLeaf | null {
  if (!centerLeaf || typeof workspace.createLeafBySplit !== "function") return null;
  try {
    return workspace.createLeafBySplit(centerLeaf);
  } catch {
    return null;
  }
}

async function routeEnsureSideLeaf(
  state: InterceptorState,
  viewType: string,
  side: "left" | "right",
  options: EnsureSideLeafOptions
): Promise<WorkspaceLeaf | null> {
  const activeWindow = getActivePopoutWindow(state);
  const participant = activeWindow ? getParticipantForWindow(state, activeWindow) : null;
  const engine = participant?.engine ?? null;
  if (!activeWindow || !engine) return null;

  // Popout windows have no native sidebar split tree. The shared engine's
  // side-column semantics are therefore used for both split=true and false;
  // active/reveal/state are still applied exactly from the caller options.
  const column = engine.getColumnElement(activeWindow, side);
  const existing = column
    ? engine.findLeafOfTypeInColumn(activeWindow, column, viewType)
    : null;
  const leaf = existing ?? engine.openSideLeafSync(activeWindow, side);
  if (!leaf) return null;

  if (!existing) {
    await leaf.setViewState({
      type: viewType,
      active: options.active,
      state: options.state,
    });
  } else if (options.state) {
    await leaf.setViewState({ type: viewType, state: options.state });
  }

  await leaf.loadIfDeferred();
  if (options.reveal !== false) {
    await state.workspace.revealLeaf?.(leaf);
  }
  if (options.active) {
    state.workspace.setActiveLeaf?.(leaf, { focus: true });
  }
  if (!existing) {
    await state.workspace.requestSaveLayout?.();
  }
  return leaf;
}

function hasOwnMethod(workspace: InterceptableWorkspace, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(workspace, key);
}

function restoreMethod(
  workspace: InterceptableWorkspace,
  key: string,
  original: { hadOwn: boolean; value?: unknown }
): void {
  if (original.hadOwn) {
    (workspace as unknown as Record<string, unknown>)[key] = original.value;
  } else {
    delete (workspace as unknown as Record<string, unknown>)[key];
  }
}

function install(state: InterceptorState): void {
  if (state.installed) return;
  const workspace = state.workspace;
  state.originalMethods = {
    getLeftLeaf: { hadOwn: hasOwnMethod(workspace, "getLeftLeaf"), value: workspace.getLeftLeaf },
    getRightLeaf: {
      hadOwn: hasOwnMethod(workspace, "getRightLeaf"),
      value: workspace.getRightLeaf,
    },
    getLeaf: { hadOwn: hasOwnMethod(workspace, "getLeaf"), value: workspace.getLeaf },
    getLeavesOfType: {
      hadOwn: hasOwnMethod(workspace, "getLeavesOfType"),
      value: workspace.getLeavesOfType,
    },
    ensureSideLeaf: {
      hadOwn: hasOwnMethod(workspace, "ensureSideLeaf"),
      value: workspace.ensureSideLeaf,
    },
    tryTrigger: { hadOwn: hasOwnMethod(workspace, "tryTrigger"), value: workspace.tryTrigger },
    getActiveFile: {
      hadOwn: hasOwnMethod(workspace, "getActiveFile"),
      value: workspace.getActiveFile,
    },
  };
  workspace.__workspaceInterceptorOriginalGetLeftLeaf = workspace.getLeftLeaf;
  workspace.__workspaceInterceptorOriginalGetRightLeaf = workspace.getRightLeaf;
  workspace.__workspaceInterceptorOriginalGetLeaf = workspace.getLeaf;
  workspace.__workspaceInterceptorOriginalGetLeavesOfType = workspace.getLeavesOfType;
  workspace.__workspaceInterceptorOriginalEnsureSideLeaf = workspace.ensureSideLeaf;
  workspace.__workspaceInterceptorOriginalTryTrigger = workspace.tryTrigger;
  workspace.__workspaceInterceptorOriginalGetActiveFile = workspace.getActiveFile;

  workspace.getLeftLeaf = function (split: boolean): WorkspaceLeaf | null {
    const original = state.originalMethods?.getLeftLeaf.value;
    return routeSideLeaf(state, "left") ?? original?.call(workspace, split) ?? null;
  };
  workspace.getRightLeaf = function (split: boolean): WorkspaceLeaf | null {
    const original = state.originalMethods?.getRightLeaf.value;
    return routeSideLeaf(state, "right") ?? original?.call(workspace, split) ?? null;
  };
  workspace.getLeaf = function (newLeaf?: boolean | string): WorkspaceLeaf {
    const original = state.originalMethods?.getLeaf.value;
    return (
      routeGetLeaf(state, newLeaf) ??
      original?.call(workspace, newLeaf) ??
      (null as unknown as WorkspaceLeaf)
    );
  };
  workspace.getLeavesOfType = function (type: string): WorkspaceLeaf[] {
    const original = state.originalMethods?.getLeavesOfType.value;
    const leaves = original?.call(workspace, type) ?? [];
    const activeWindow = getActivePopoutWindow(state);
    const participant = activeWindow ? getParticipantForWindow(state, activeWindow) : null;
    return participant ? leaves.filter((leaf) => getWindowOfLeaf(leaf) === activeWindow) : leaves;
  };
  workspace.ensureSideLeaf = function (
    viewType: string,
    side: "left" | "right",
    options: EnsureSideLeafOptions = {}
  ): Promise<WorkspaceLeaf> {
    const original = state.originalMethods?.ensureSideLeaf.value;
    return routeEnsureSideLeaf(state, viewType, side, options).then((leaf) => {
      if (leaf) return leaf;
      if (original) return original.call(workspace, viewType, side, options);
      return Promise.reject(new Error("Workspace.ensureSideLeaf is unavailable"));
    });
  };

  // INTERNAL API: workspace.tryTrigger - 全域攔截 file-open 事件傳遞，依 View 所在視窗隔離廣播
  workspace.tryTrigger = function (subscription: EventSubscription, args: unknown[]): void {
    if (subscription && subscription.name === "file-open") {
      const ctx = subscription.ctx;
      if (ctx && typeof ctx === "object") {
        const leaf = (ctx as { leaf?: WorkspaceLeaf }).leaf;
        const containerEl = (ctx as { containerEl?: HTMLElement }).containerEl;
        const target = leaf ?? containerEl;
        if (target) {
          if (!state.tracker.shouldProcessFileOpen(target as unknown as WorkspaceLeaf)) {
            return;
          }
        }
      }
    }
    const original = state.originalMethods?.tryTrigger.value;
    if (original) {
      return original.apply(this, [subscription, args]);
    }
  };

  // INTERNAL API: workspace.getActiveFile - 視窗感知 active file 路由，優先取得當前 Popout 視窗作用檔案。
  // isResolvingActiveFile 重入保護：tracker fallback 若間接回呼本攔截會造成無窮遞迴
  // （RangeError: Maximum call stack size exceeded），重入時直接 fallback 原始實作。
  let isResolvingActiveFile = false;
  workspace.getActiveFile = function (): TFile | null {
    if (isResolvingActiveFile) {
      const original = state.originalMethods?.getActiveFile.value;
      return original ? original.call(workspace) : null;
    }
    isResolvingActiveFile = true;
    try {
      const activeWindow = getActivePopoutWindow(state);
      if (activeWindow) {
        const winFile = state.tracker.getActiveFileForWindow(activeWindow);
        if (winFile) return winFile;
      }
      const original = state.originalMethods?.getActiveFile.value;
      return original ? original.call(workspace) : null;
    } finally {
      isResolvingActiveFile = false;
    }
  };

  // 監聽 Workspace 事件以持續更新視窗作用檔案追蹤
  const ws = state.app.workspace as unknown as {
    on?: (name: string, cb: (...args: any[]) => void) => unknown;
    offref?: (ref: unknown) => void;
  };
  if (ws && typeof ws.on === "function") {
    const ref1 = ws.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
      state.tracker.trackActiveLeaf(leaf);
    });
    const ref2 = ws.on("file-open", (file: TFile | null) => {
      state.tracker.trackFileOpen(file);
    });
    state.eventRefs = [ref1, ref2];
  }

  workspace.__workspaceInterceptorInstalled = true;
  state.installed = true;
}

function uninstall(state: InterceptorState): void {
  if (!state.installed) return;
  const workspace = state.workspace;
  const original = state.originalMethods;
  if (original) {
    restoreMethod(workspace, "getLeftLeaf", original.getLeftLeaf);
    restoreMethod(workspace, "getRightLeaf", original.getRightLeaf);
    restoreMethod(workspace, "getLeaf", original.getLeaf);
    restoreMethod(workspace, "getLeavesOfType", original.getLeavesOfType);
    restoreMethod(workspace, "ensureSideLeaf", original.ensureSideLeaf);
    restoreMethod(workspace, "tryTrigger", original.tryTrigger);
    restoreMethod(workspace, "getActiveFile", original.getActiveFile);
  }

  const ws = state.workspace as unknown as {
    offref?: (ref: unknown) => void;
  };
  if (state.eventRefs && typeof ws.offref === "function") {
    for (const ref of state.eventRefs) {
      ws.offref(ref);
    }
    state.eventRefs = [];
  }

  delete workspace.__workspaceInterceptorOriginalGetLeftLeaf;
  delete workspace.__workspaceInterceptorOriginalGetRightLeaf;
  delete workspace.__workspaceInterceptorOriginalGetLeaf;
  delete workspace.__workspaceInterceptorOriginalGetLeavesOfType;
  delete workspace.__workspaceInterceptorOriginalEnsureSideLeaf;
  delete workspace.__workspaceInterceptorOriginalTryTrigger;
  delete workspace.__workspaceInterceptorOriginalGetActiveFile;
  delete workspace.__workspaceInterceptorInstalled;
  state.originalMethods = undefined;
  state.installed = false;
}

/** Register one plugin policy with the process-wide coordinator. */
export function acquireWorkspaceInterceptor(
  app: App,
  participant: WorkspaceInterceptorParticipant
): void {
  if (!participant.id) throw new Error("Workspace interceptor participant id is required");
  const state = getState(app);
  state.participants.set(participant.id, participant);
  install(state);
}

/** Release one plugin policy; restore the original APIs after the last release. */
export function releaseWorkspaceInterceptor(id: string): void {
  const namespace = window as unknown as GlobalNamespace;
  const state = namespace.__obsidian_workspace_interceptor_state_v1__;
  if (!state) return;
  state.participants.delete(id);
  if (state.participants.size === 0) uninstall(state);
}

/** Get the shared WindowActiveFileTracker from the coordinator state. */
export function getWorkspaceActiveFileTracker(app: App): WindowActiveFileTracker {
  const state = getState(app);
  return state.tracker;
}

export {
  WindowActiveFileTracker,
  type PatchableViewOnFileOpen,
  type PatchableFileExplorerView,
  type WindowActiveFileTrackerState,
} from "./windowActiveFileTracker.js";
