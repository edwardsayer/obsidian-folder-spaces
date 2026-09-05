import { PopoutLayoutEngine, ExtendedWorkspace, ExtendedWorkspaceLeaf } from "./popoutLayout";
import { WorkspaceLeaf } from "obsidian";

/** Fixed cross-bundle key. Both plugins must use this exact namespace. */
export const POPOUT_LAYOUT_REGISTRY_KEY = "__obsidian_popout_layout_registry_v1__";

/** Registry-level API exposed on the stable proxy (not part of the engine class). */
export interface PopoutLayoutWindowApi {
  /**
   * 開一個新的 Popout window（初始 empty tab），等待 window mount 後依序呼叫
   * 所有已註冊 candidate 的 initializeNewPopoutWindow policy。無 provider 註冊
   * initializer 時僅做原生開窗（shared 獨立運作原則）。
   */
  openNewPopoutWindow(): Promise<{ win: Window; leaf: WorkspaceLeaf } | null>;
}

export type PopoutLayoutEngineWithWindow = PopoutLayoutEngine & PopoutLayoutWindowApi;

export interface PopoutLayoutEngineCandidate {
  id: string;
  apiVersion: number;
  compatibleFrom: number;
  implementationRevision: string;
  create: () => PopoutLayoutEngine;
  /**
   * 選用 policy：新 popout window 建立並 mount 後被呼叫（供外掛初始化
   * activity bars / 欄位結構等「新視窗行為」）。多個 candidate 都會被呼叫。
   */
  initializeNewPopoutWindow?: (win: Window) => Promise<void> | void;
}

interface StoredCandidate extends Omit<PopoutLayoutEngineCandidate, "create"> {
  engine: PopoutLayoutEngine;
}

interface PopoutLayoutRegistryState {
  candidates: Map<string, StoredCandidate>;
  activeId: string | null;
  activeEngine: PopoutLayoutEngine | null;
  methodWrappers: Map<PropertyKey, (...args: unknown[]) => unknown>;
  proxy: PopoutLayoutEngineWithWindow;
}

type GlobalNamespace = typeof window & {
  [POPOUT_LAYOUT_REGISTRY_KEY]?: PopoutLayoutRegistryState;
};

function compareRevisions(left: string, right: string): number {
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareCandidatePriority(left: StoredCandidate, right: StoredCandidate): number {
  // Prefer the newest API, then the implementation that supports the broadest
  // compatible range, and finally the newest implementation revision.
  if (left.apiVersion !== right.apiVersion) {
    return right.apiVersion - left.apiVersion;
  }
  if (left.compatibleFrom !== right.compatibleFrom) {
    return left.compatibleFrom - right.compatibleFrom;
  }
  const revisionOrder = compareRevisions(left.implementationRevision, right.implementationRevision);
  return revisionOrder === 0 ? 0 : -revisionOrder;
}

function compareCandidates(left: StoredCandidate, right: StoredCandidate): number {
  const priorityOrder = compareCandidatePriority(left, right);
  if (priorityOrder !== 0) return priorityOrder;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function supportsApiVersion(candidate: StoredCandidate, apiVersion: number): boolean {
  return candidate.compatibleFrom <= apiVersion && apiVersion <= candidate.apiVersion;
}

/**
 * A candidate may become active only when it can serve every older API version
 * currently registered. Registered candidates represent active consumers: this
 * prevents a v2 implementation with compatibleFrom=2 from replacing the v1
 * implementation that an already-loaded plugin still requires.
 */
function isBackwardCompatibleWithRegisteredConsumers(
  candidate: StoredCandidate,
  candidates: StoredCandidate[]
): boolean {
  return candidates
    .filter((consumer) => consumer.apiVersion < candidate.apiVersion)
    .every((consumer) => supportsApiVersion(candidate, consumer.apiVersion));
}

function selectActiveCandidate(state: PopoutLayoutRegistryState): void {
  // acquirePopoutLayoutEngine validates each candidate's own range. Selection
  // must now evaluate it against the other registered API consumers.
  const candidates = Array.from(state.candidates.values());
  const compatibleCandidates = candidates
    .filter((candidate) => isBackwardCompatibleWithRegisteredConsumers(candidate, candidates))
    .sort(compareCandidates);
  const currentActive = state.activeId ? state.candidates.get(state.activeId) ?? null : null;
  const currentRemainsBest =
    currentActive !== null &&
    compatibleCandidates.some((candidate) => candidate.id === currentActive.id) &&
    compatibleCandidates.every((candidate) => compareCandidatePriority(currentActive, candidate) <= 0);
  const active = currentRemainsBest ? currentActive : compatibleCandidates[0] ?? null;
  state.activeId = active?.id ?? null;
  state.activeEngine = active?.engine ?? null;
}

function isPopoutDocument(targetDocument: Document | null | undefined): boolean {
  const body = targetDocument?.body;
  return !!body && (body.classList.contains("is-popout-window") || body.classList.contains("mod-popout"));
}

async function waitForPopoutWindow(leaf: WorkspaceLeaf): Promise<Window | null> {
  const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = extLeaf.containerEl?.ownerDocument?.defaultView as Window | undefined;
    if (candidate && isPopoutDocument(candidate.document)) return candidate;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return null;
}

function createStableProxy(state: PopoutLayoutRegistryState): PopoutLayoutEngineWithWindow {
  const target = Object.create(null) as PopoutLayoutEngineWithWindow;

  // Registry-level API（不委託 active engine）：開新 popout、等待 window mount、
  // 然後依序呼叫所有已註冊 candidate 的 initializeNewPopoutWindow policy。
  // 無 provider 註冊 initializer 時僅做原生開窗（shared 獨立運作原則）。
  target.openNewPopoutWindow = async () => {
    const engine = state.activeEngine;
    if (!engine) return null;
    const workspace = engine.workspace as ExtendedWorkspace & { openPopoutLeaf?: () => WorkspaceLeaf };
    // INTERNAL API: Workspace.openPopoutLeaf - d.ts 有宣告但官方文件未記載（asar-findings #3：帶 WorkspaceWindowInitData 消除兩階段跳動）
    const leaf = workspace.openPopoutLeaf?.();
    if (!leaf) return null;

    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    await Promise.resolve(extLeaf.setViewState({ type: "empty" }));

    const win = await waitForPopoutWindow(leaf);
    if (!win) {
      console.warn("Popout leaf was created, but its Window was not mounted in time.");
      return null;
    }
    try {
      win.focus?.();
    } catch (e) {
      console.warn("Failed to focus new popout window:", e);
    }

    for (const candidate of state.candidates.values()) {
      if (candidate.initializeNewPopoutWindow) {
        try {
          await candidate.initializeNewPopoutWindow(win);
        } catch (e) {
          console.warn(`Popout new-window initializer failed (${candidate.id}):`, e);
        }
      }
    }
    return { win, leaf };
  };

  return new Proxy(target, {
    get(proxyTarget, property, receiver) {
      // Let test instrumentation or an explicitly attached property behave
      // normally without changing the delegate held by the registry.
      if (property in proxyTarget) {
        return Reflect.get(proxyTarget, property, receiver);
      }

      const delegate = state.activeEngine;
      if (!delegate) return undefined;

      const value = Reflect.get(delegate, property, delegate);
      if (typeof value !== "function") return value;

      let wrapper = state.methodWrappers.get(property);
      if (!wrapper) {
        wrapper = (...args: unknown[]) => {
          const current = state.activeEngine;
          if (!current) throw new Error("No active Popout layout engine candidate");
          const currentMethod = Reflect.get(current, property, current);
          if (typeof currentMethod !== "function") {
            throw new Error(`Active Popout layout engine has no method '${String(property)}'`);
          }
          return currentMethod.apply(current, args);
        };
        state.methodWrappers.set(property, wrapper);
      }
      return wrapper;
    },
    has(proxyTarget, property) {
      return property in proxyTarget || Boolean(state.activeEngine && property in state.activeEngine);
    },
    getOwnPropertyDescriptor(proxyTarget, property) {
      const own = Reflect.getOwnPropertyDescriptor(proxyTarget, property);
      if (own) return own;

      const delegate = state.activeEngine;
      if (delegate && property in delegate) {
        return {
          configurable: true,
          enumerable: false,
          writable: true,
          value: Reflect.get(delegate, property, delegate),
        };
      }
      return undefined;
    },
    set(proxyTarget, property, value, receiver) {
      return Reflect.set(proxyTarget, property, value, receiver);
    },
  });
}

function getRegistryState(): PopoutLayoutRegistryState {
  // shared 引擎在主視窗 realm 載入（plugin 進入點），以 window 作為全域命名空間
  // （避免 no-global-this 警告；popout realm 會經由 registry proxy 共享同一 state）。
  const namespace = window as unknown as GlobalNamespace;
  const existing = namespace[POPOUT_LAYOUT_REGISTRY_KEY];
  if (existing) return existing;

  const state = {
    candidates: new Map<string, StoredCandidate>(),
    activeId: null,
    activeEngine: null,
    methodWrappers: new Map<PropertyKey, (...args: unknown[]) => unknown>(),
    proxy: undefined as unknown as PopoutLayoutEngineWithWindow,
  };
  state.proxy = createStableProxy(state);
  namespace[POPOUT_LAYOUT_REGISTRY_KEY] = state;
  return state;
}

/**
 * Register an implementation candidate and return the cross-bundle stable
 * singleton proxy. A later compatible candidate only changes the proxy's
 * delegate; existing references therefore remain valid after an upgrade.
 */
export function acquirePopoutLayoutEngine(
  candidate: PopoutLayoutEngineCandidate
): PopoutLayoutEngineWithWindow {
  if (!candidate.id) throw new Error("Popout layout candidate id is required");
  if (!Number.isInteger(candidate.apiVersion) || candidate.apiVersion < 1) {
    throw new Error("Popout layout candidate apiVersion must be a positive integer");
  }
  if (!Number.isInteger(candidate.compatibleFrom) || candidate.compatibleFrom < 1) {
    throw new Error("Popout layout candidate compatibleFrom must be a positive integer");
  }
  if (candidate.compatibleFrom > candidate.apiVersion) {
    throw new Error("Popout layout candidate compatibleFrom cannot exceed apiVersion");
  }
  if (typeof candidate.create !== "function") {
    throw new Error("Popout layout candidate create must be a function");
  }

  const state = getRegistryState();
  const engine = candidate.create();
  if (!engine) throw new Error(`Popout layout candidate '${candidate.id}' returned no engine`);

  state.candidates.set(candidate.id, {
    id: candidate.id,
    apiVersion: candidate.apiVersion,
    compatibleFrom: candidate.compatibleFrom,
    implementationRevision: candidate.implementationRevision,
    engine,
    initializeNewPopoutWindow: candidate.initializeNewPopoutWindow,
  });
  selectActiveCandidate(state);
  return state.proxy;
}

/** Remove a candidate and fall back to the best remaining implementation. */
export function releasePopoutLayoutEngine(id: string): void {
  const state = getRegistryState();
  state.candidates.delete(id);
  selectActiveCandidate(state);
}
