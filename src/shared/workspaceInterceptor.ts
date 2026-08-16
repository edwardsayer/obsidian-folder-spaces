import { App, WorkspaceLeaf } from "obsidian";
import { getWindowOfLeaf, isPopoutWindow, PopoutLayoutEngine } from "./popoutLayout.js";

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
}

interface OriginalWorkspaceMethods {
  getLeftLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getLeftLeaf"] };
  getRightLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getRightLeaf"] };
  getLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["getLeaf"] };
  getLeavesOfType: { hadOwn: boolean; value?: InterceptableWorkspace["getLeavesOfType"] };
  ensureSideLeaf: { hadOwn: boolean; value?: InterceptableWorkspace["ensureSideLeaf"] };
}

interface InterceptorState {
  workspace: InterceptableWorkspace;
  participants: Map<string, WorkspaceInterceptorParticipant>;
  installed: boolean;
  originalMethods?: OriginalWorkspaceMethods;
}

type GlobalNamespace = typeof globalThis & {
  __obsidian_workspace_interceptor_state_v1__?: InterceptorState;
};

function getState(app: App): InterceptorState {
  const namespace = globalThis as GlobalNamespace;
  const existing = namespace.__obsidian_workspace_interceptor_state_v1__;
  if (existing) {
    if (existing.participants.size === 0 && !existing.installed) {
      existing.workspace = app.workspace as unknown as InterceptableWorkspace;
    }
    return existing;
  }

  const state: InterceptorState = {
    workspace: app.workspace as unknown as InterceptableWorkspace,
    participants: new Map<string, WorkspaceInterceptorParticipant>(),
    installed: false,
    originalMethods: undefined,
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

  const activeLeaf = engine.getActiveLeafInWindow(activeWindow);
  if (activeLeaf && engine.isLeafInSideColumn(activeWindow, activeLeaf)) {
    if (newLeaf === "split") {
      // 側欄 active 時 split：以中央編輯區的 leaf 為錨點，避免 split 到側欄
      // （原生 splitActiveLeaf 會 split「最近 active 的 leaf」，可能是側欄）。
      const centerLeaf = engine.getCenterLeafSync(activeWindow);
      return splitCenterLeaf(state.workspace, centerLeaf);
    }
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
    getRightLeaf: { hadOwn: hasOwnMethod(workspace, "getRightLeaf"), value: workspace.getRightLeaf },
    getLeaf: { hadOwn: hasOwnMethod(workspace, "getLeaf"), value: workspace.getLeaf },
    getLeavesOfType: { hadOwn: hasOwnMethod(workspace, "getLeavesOfType"), value: workspace.getLeavesOfType },
    ensureSideLeaf: { hadOwn: hasOwnMethod(workspace, "ensureSideLeaf"), value: workspace.ensureSideLeaf },
  };
  workspace.__workspaceInterceptorOriginalGetLeftLeaf = workspace.getLeftLeaf;
  workspace.__workspaceInterceptorOriginalGetRightLeaf = workspace.getRightLeaf;
  workspace.__workspaceInterceptorOriginalGetLeaf = workspace.getLeaf;
  workspace.__workspaceInterceptorOriginalGetLeavesOfType = workspace.getLeavesOfType;
  workspace.__workspaceInterceptorOriginalEnsureSideLeaf = workspace.ensureSideLeaf;

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
    return routeGetLeaf(state, newLeaf) ?? original?.call(workspace, newLeaf) ?? (null as unknown as WorkspaceLeaf);
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
  }
  delete workspace.__workspaceInterceptorOriginalGetLeftLeaf;
  delete workspace.__workspaceInterceptorOriginalGetRightLeaf;
  delete workspace.__workspaceInterceptorOriginalGetLeaf;
  delete workspace.__workspaceInterceptorOriginalGetLeavesOfType;
  delete workspace.__workspaceInterceptorOriginalEnsureSideLeaf;
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
  const namespace = globalThis as GlobalNamespace;
  const state = namespace.__obsidian_workspace_interceptor_state_v1__;
  if (!state) return;
  state.participants.delete(id);
  if (state.participants.size === 0) uninstall(state);
}
