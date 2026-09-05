import assert from "node:assert/strict";
import test from "node:test";

// shared 引擎以 window 作為全域命名空間（Electron 中 window === globalThis）；
// Node 測試環境無 window，預先建立別名供 shared state 掛載。
const globalWithWindow = globalThis as unknown as { window?: unknown };
if (typeof globalWithWindow.window === "undefined") {
  globalWithWindow.window = globalThis;
}

import type { App, WorkspaceLeaf } from "obsidian";

import {
  PopoutLayoutEngine,
  type ExtendedWorkspace,
  type WorkspaceParent
} from "../src/shared/popoutLayout.js";
import {
  acquirePopoutLayoutEngine,
  releasePopoutLayoutEngine
} from "../src/shared/popoutLayoutRegistry.js";
import {
  SHARED_API_VERSION,
  SHARED_COMPATIBLE_FROM_VERSION,
  SHARED_IMPLEMENTATION_REVISION
} from "../src/shared/sharedVersion.js";
import {
  acquireWorkspaceInterceptor,
  releaseWorkspaceInterceptor
} from "../src/shared/workspaceInterceptor.js";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

class FakeElement {
  parentElement: FakeElement | null = null;
  instanceOf(cls: unknown): boolean {
    return cls === HTMLElement;
  }
  readonly children: FakeElement[] = [];
  readonly classList: { contains: (name: string) => boolean };

  constructor(private readonly rect: Rect, classes: readonly string[] = []) {
    const classSet = new Set(classes);
    this.classList = { contains: (name) => classSet.has(name) };
  }

  getBoundingClientRect(): Rect {
    return this.rect;
  }

  contains(element: FakeElement): boolean {
    return element === this || this.children.some((child) => child.contains(element));
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (
        selector === ".workspace-split.mod-root" &&
        current.classList.contains("workspace-split") &&
        current.classList.contains("mod-root")
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}

interface FakeWindow extends Window {
  innerWidth: number;
}

interface FakeLeaf {
  parent: WorkspaceParent;
  containerEl: FakeElement;
  state: { type: string; state?: Record<string, unknown> };
  getViewState(): { type: string; state?: Record<string, unknown> };
  setViewState(next: { type: string; state?: Record<string, unknown> }): Promise<void>;
  loadIfDeferred(): Promise<void>;
}

function createFakeWindow(): FakeWindow {
  return {
    innerWidth: 1200,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
    document: {
      body: { classList: { contains: (name: string) => name === "is-popout-window" } }
    }
  } as unknown as FakeWindow;
}

function createFakeLayout(): {
  engine: PopoutLayoutEngine;
  workspace: ExtendedWorkspace;
  tabs: WorkspaceParent;
  leaves: FakeLeaf[];
  win: FakeWindow;
} {
  const win = createFakeWindow();
  const tabsContainer = new FakeElement({ left: 200, top: 0, width: 800, height: 700 });
  const tabs: WorkspaceParent = {
    containerEl: tabsContainer as unknown as HTMLElement,
    children: []
  };
  const leaves: FakeLeaf[] = [];
  const createLeaf = (state: { type: string; state?: Record<string, unknown> }): FakeLeaf => {
    const leaf = {
      parent: tabs,
      containerEl: new FakeElement({ left: 200, top: 0, width: 800, height: 700 }),
      state,
      getViewState: () => leaf.state,
      setViewState: async (next: { type: string; state?: Record<string, unknown> }) => {
        leaf.state = { type: next.type, state: next.state };
      },
      loadIfDeferred: async () => undefined
    } as unknown as FakeLeaf;
    leaf.containerEl.parentElement = tabsContainer;
    (tabs.children as unknown as FakeLeaf[]).push(leaf);
    leaves.push(leaf);
    return leaf;
  };

  createLeaf({ type: "empty" });
  const workspace = {
    activeLeaf: leaves[0] as unknown as WorkspaceLeaf,
    iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
      for (const leaf of leaves) {
        callback(leaf as unknown as WorkspaceLeaf);
      }
    },
    createLeafInParent: () => createLeaf({ type: "empty" }),
    createLeafBySplit: () => createLeaf({ type: "empty" }),
    getLeaf: () => createLeaf({ type: "empty" }),
    setActiveLeaf: (leaf: WorkspaceLeaf) => {
      workspace.activeLeaf = leaf;
    },
    revealLeaf: async () => undefined
  } as unknown as ExtendedWorkspace;

  for (const leaf of leaves) {
    leaf.containerEl = Object.assign(leaf.containerEl, {
      ownerDocument: { defaultView: win }
    }) as FakeElement;
  }

  return {
    engine: new PopoutLayoutEngine({ workspace } as unknown as App),
    workspace,
    tabs,
    leaves,
    win
  };
}

function createFakeSidebarLayout(): {
  engine: PopoutLayoutEngine;
  workspace: ExtendedWorkspace;
  leftTabs: WorkspaceParent;
  centerTabs: WorkspaceParent;
  rightTabs: WorkspaceParent;
  win: FakeWindow;
} {
  const win = createFakeWindow();
  const root = new FakeElement(
    { left: 0, top: 0, width: 1200, height: 700 },
    ["workspace-split", "mod-root"]
  );
  const leftElement = new FakeElement(
    { left: 0, top: 0, width: 200, height: 700 },
    ["workspace-tabs", "window-spaces-sidebar-column"]
  );
  const centerElement = new FakeElement(
    { left: 200, top: 0, width: 800, height: 700 },
    ["workspace-tabs"]
  );
  const rightElement = new FakeElement(
    { left: 1000, top: 0, width: 200, height: 700 },
    ["workspace-tabs", "window-spaces-sidebar-column"]
  );
  for (const element of [leftElement, centerElement, rightElement]) {
    element.parentElement = root;
    root.children.push(element);
  }

  const createTabs = (element: FakeElement): WorkspaceParent => ({
    containerEl: element as unknown as HTMLElement,
    children: []
  });
  const leftTabs = createTabs(leftElement);
  const centerTabs = createTabs(centerElement);
  const rightTabs = createTabs(rightElement);
  const leaves: FakeLeaf[] = [];

  const createLeaf = (parent: WorkspaceParent, type: string): FakeLeaf => {
    const element = parent.containerEl as unknown as FakeElement;
    const leaf = {
      parent,
      containerEl: new FakeElement(
        { left: element.getBoundingClientRect().left, top: 0, width: element.getBoundingClientRect().width, height: 700 }
      ),
      state: { type },
      getViewState: () => leaf.state,
      setViewState: async (next: { type: string; state?: Record<string, unknown> }) => {
        leaf.state = { type: next.type, state: next.state };
      },
      loadIfDeferred: async () => undefined
    } as FakeLeaf;
    leaf.containerEl.parentElement = element;
    element.children.push(leaf.containerEl);
    Object.assign(leaf.containerEl, { ownerDocument: { defaultView: win } });
    (parent.children as unknown as FakeLeaf[]).push(leaf);
    leaves.push(leaf);
    return leaf;
  };

  createLeaf(leftTabs, "empty");
  const centerLeaf = createLeaf(centerTabs, "empty");
  createLeaf(rightTabs, "empty");
  const workspace = {
    activeLeaf: centerLeaf as unknown as WorkspaceLeaf,
    iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
      for (const leaf of leaves) callback(leaf as unknown as WorkspaceLeaf);
    },
    createLeafInParent: (parent: unknown) => createLeaf(parent as WorkspaceParent, "empty"),
    createLeafBySplit: () => createLeaf(centerTabs, "empty"),
    getLeaf: () => createLeaf(centerTabs, "empty"),
    setActiveLeaf: (leaf: WorkspaceLeaf) => {
      workspace.activeLeaf = leaf;
    },
    revealLeaf: async () => undefined
  } as unknown as ExtendedWorkspace;

  return {
    engine: new PopoutLayoutEngine({ workspace } as unknown as App),
    workspace,
    leftTabs,
    centerTabs,
    rightTabs,
    win
  };
}

function fakeEngine(value: string): PopoutLayoutEngine {
  return {
    getActiveLeafInWindow: () => value
  } as unknown as PopoutLayoutEngine;
}

test("shared version metadata declares a valid compatibility range", () => {
  assert.ok(Number.isInteger(SHARED_API_VERSION));
  assert.ok(Number.isInteger(SHARED_COMPATIBLE_FROM_VERSION));
  assert.ok(SHARED_API_VERSION >= SHARED_COMPATIBLE_FROM_VERSION);
  assert.match(SHARED_IMPLEMENTATION_REVISION, /^\d{4}-\d{2}-\d{2}T/);
});

test("registry keeps a stable proxy while upgrading to a compatible candidate", () => {
  const v1Id = "test-registry-stable-v1";
  const v2Id = "test-registry-stable-v2";
  try {
    const first = acquirePopoutLayoutEngine({
      id: v1Id,
      apiVersion: 1,
      compatibleFrom: 1,
      implementationRevision: "2026-01-01T00:00:00Z",
      create: () => fakeEngine("v1")
    });
    const stableReference = first;

    const upgraded = acquirePopoutLayoutEngine({
      id: v2Id,
      apiVersion: 2,
      compatibleFrom: 1,
      implementationRevision: "2026-02-01T00:00:00Z",
      create: () => fakeEngine("v2")
    });

    assert.strictEqual(upgraded, stableReference);
    assert.equal(
      (stableReference.getActiveLeafInWindow as unknown as (win: Window) => string)({} as Window),
      "v2"
    );
  } finally {
    releasePopoutLayoutEngine(v2Id);
    releasePopoutLayoutEngine(v1Id);
  }
});

test("registry does not activate an incompatible newer candidate until the older consumer is released", () => {
  const v1Id = "test-registry-incompatible-v1";
  const v2Id = "test-registry-incompatible-v2";
  try {
    const proxy = acquirePopoutLayoutEngine({
      id: v1Id,
      apiVersion: 1,
      compatibleFrom: 1,
      implementationRevision: "2026-03-01T00:00:00Z",
      create: () => fakeEngine("v1")
    });
    acquirePopoutLayoutEngine({
      id: v2Id,
      apiVersion: 2,
      compatibleFrom: 2,
      implementationRevision: "2026-04-01T00:00:00Z",
      create: () => fakeEngine("v2")
    });

    const getValue = proxy.getActiveLeafInWindow as unknown as (win: Window) => string;
    assert.equal(getValue({} as Window), "v1");

    releasePopoutLayoutEngine(v1Id);
    assert.equal(getValue({} as Window), "v2");
  } finally {
    releasePopoutLayoutEngine(v2Id);
    releasePopoutLayoutEngine(v1Id);
  }
});

test("registry falls back to the remaining candidate after release", () => {
  const firstId = "test-registry-fallback-first";
  const secondId = "test-registry-fallback-second";
  try {
    const proxy = acquirePopoutLayoutEngine({
      id: firstId,
      apiVersion: 1,
      compatibleFrom: 1,
      implementationRevision: "2026-05-01T00:00:00Z",
      create: () => fakeEngine("first")
    });
    acquirePopoutLayoutEngine({
      id: secondId,
      apiVersion: 1,
      compatibleFrom: 1,
      implementationRevision: "2026-06-01T00:00:00Z",
      create: () => fakeEngine("second")
    });

    const getValue = proxy.getActiveLeafInWindow as unknown as (win: Window) => string;
    assert.equal(getValue({} as Window), "second");
    releasePopoutLayoutEngine(secondId);
    assert.equal(getValue({} as Window), "first");
  } finally {
    releasePopoutLayoutEngine(secondId);
    releasePopoutLayoutEngine(firstId);
  }
});

test("registry openNewPopoutWindow opens a popout and runs candidate initializers", async () => {
  const popoutWin = {
    focus: () => undefined,
    document: { body: { classList: { contains: (name: string) => name === "is-popout-window" } } }
  } as unknown as Window;
  const createdLeaf = {
    containerEl: Object.assign(new FakeElement({ left: 0, top: 0, width: 300, height: 700 }), {
      ownerDocument: { defaultView: popoutWin }
    }),
    setViewState: async () => undefined,
    getViewState: () => ({ type: "empty", state: {} })
  } as unknown as WorkspaceLeaf;
  const workspace = {
    openPopoutLeaf: () => createdLeaf
  } as unknown as App["workspace"];
  const engine = { workspace } as unknown as PopoutLayoutEngine;
  const initialized: string[] = [];
  const id = "test-registry-open-new-window";
  try {
    const proxy = acquirePopoutLayoutEngine({
      id,
      apiVersion: SHARED_API_VERSION,
      compatibleFrom: SHARED_COMPATIBLE_FROM_VERSION,
      implementationRevision: SHARED_IMPLEMENTATION_REVISION,
      create: () => engine,
      initializeNewPopoutWindow: (win) => {
        initialized.push(win === popoutWin ? "win" : "other");
      }
    });

    const result = await proxy.openNewPopoutWindow();
    assert.ok(result);
    assert.equal(result.win, popoutWin);
    assert.equal(result.leaf, createdLeaf);
    assert.deepEqual(initialized, ["win"]);
  } finally {
    releasePopoutLayoutEngine(id);
  }
});

test("workspace interceptor invokes popout document.hasFocus with its document receiver", async () => {
  const globalObject = globalThis as unknown as {
    window?: Window;
    activeWindow?: Window;
  };
  // shared 引擎以 window 為命名空間；Node 測試環境以 globalThis 別名承載。
  (globalThis as unknown as { window?: unknown }).window = globalObject.window ?? (globalThis as unknown as Window);
  const previousWindow = globalObject.window;
  const previousActiveWindow = globalObject.activeWindow;
  const mainDocument = {
    body: { classList: { contains: () => false } },
    hasFocus: () => false
  };
  const popoutDocument: {
    body: { classList: { contains: (name: string) => boolean } };
    hasFocus: () => boolean;
  } = {
    body: { classList: { contains: (name) => name === "is-popout-window" } },
    hasFocus() {
      return this === popoutDocument;
    }
  };
  const mainWindow = { document: mainDocument } as unknown as Window;
  const popoutWindow = { document: popoutDocument } as unknown as Window;
  const leaf = {
    containerEl: Object.assign(new FakeElement({ left: 0, top: 0, width: 300, height: 700 }), {
      ownerDocument: popoutDocument
    }),
    getViewState: () => ({ type: "tag", state: {} }),
    setViewState: async () => undefined,
    loadIfDeferred: async () => undefined
  } as unknown as WorkspaceLeaf;
  const workspace = {
    revealLeaf: async () => undefined,
    setActiveLeaf: () => undefined,
    requestSaveLayout: async () => undefined,
    iterateAllLeaves: () => undefined
  } as unknown as App["workspace"];
  const engine = {
    getColumnElement: () => null,
    openSideLeafSync: () => leaf
  } as unknown as PopoutLayoutEngine;
  const participantId = "test-workspace-interceptor-focus";

  Object.assign(globalObject, { window: mainWindow, activeWindow: popoutWindow });
  try {
    acquireWorkspaceInterceptor({ workspace } as unknown as App, {
      id: participantId,
      engine,
      isManagedWindow: (win) => win === popoutWindow
    });
    const patchedWorkspace = workspace as unknown as {
      ensureSideLeaf: (
        viewType: string,
        side: "left" | "right",
        options?: { active?: boolean; reveal?: boolean; state?: Record<string, unknown> }
      ) => Promise<WorkspaceLeaf>;
    };
    const routed = await patchedWorkspace.ensureSideLeaf("tag", "left", { active: true });
    assert.strictEqual(routed, leaf);
  } finally {
    releaseWorkspaceInterceptor(participantId);
    if (previousWindow === undefined) {
      delete globalObject.window;
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      globalObject.window = previousWindow;
    }
    if (previousActiveWindow === undefined) {
      delete globalObject.activeWindow;
    } else {
      globalObject.activeWindow = previousActiveWindow;
    }
  }
});

test("shared engine places native sidebar views in the selected popout side column", async () => {
  const original = globalThis.HTMLElement;
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement
  });
  try {
    const { engine, leftTabs, rightTabs, win } = createFakeSidebarLayout();
    const leftLeaf = await engine.openPanel(win, "left", "tag");
    const rightLeaf = await engine.openPanel(win, "right", "outline");

    assert.equal(leftLeaf.parent, leftTabs);
    assert.equal(leftLeaf.getViewState().type, "tag");
    assert.equal(rightLeaf.parent, rightTabs);
    assert.equal(rightLeaf.getViewState().type, "outline");
  } finally {
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: original
    });
  }
});

test("shared engine places search and auxiliary views in the selected popout editor pane", async () => {
  const original = globalThis.HTMLElement;
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement
  });
  try {
    for (const viewType of ["search", "tag", "outline", "backlink"]) {
      const { engine, tabs, leaves, win } = createFakeLayout();
      const opened = await engine.openPanel(win, "tab", viewType);

      assert.equal(opened.getViewState().type, viewType);
      assert.equal(opened.parent, tabs);
      assert.equal(leaves.length, 2);
    }
  } finally {
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: original
    });
  }
});

test("workspace getLeaf routes popout sidebar opens to the center pane (folder-spaces only)", () => {
  const original = globalThis.HTMLElement;
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement
  });
  const globalObject = globalThis as unknown as {
    window?: Window;
    activeWindow?: Window;
  };
  const previousWindow = globalObject.window;
  const previousActiveWindow = globalObject.activeWindow;
  try {
    const { engine, workspace, leftTabs, centerTabs, win } = createFakeSidebarLayout();
    // 側欄 leaf 為 active leaf（模擬使用者在側欄 Folder Space / Files panel 點開檔）。
    const sidebarLeaf = (leftTabs.children?.[0] as unknown) as WorkspaceLeaf;
    workspace.activeLeaf = sidebarLeaf;

    // 主視窗無 focus；popout win 為 activeWindow（hasFocus 判定 true）。
    const mainWindow = {} as unknown as Window;
    Object.assign(globalObject, { window: mainWindow, activeWindow: win });

    acquireWorkspaceInterceptor({ workspace } as unknown as App, {
      id: "test-fs-getleaf-route",
      engine,
      isManagedWindow: (w) => w === win
    });

    const patchedWorkspace = workspace as unknown as App["workspace"];

    // 普通開檔（false）：側欄 active → 路由至中央編輯區（重用目前顯示 unpinned tab）。
    const routed = patchedWorkspace.getLeaf(false) as unknown as FakeLeaf;
    assert.equal(routed.parent, centerTabs);

    // tab 開檔（"tab"）：側欄 active → 中央開新 tab。
    const routedTab = patchedWorkspace.getLeaf("tab") as unknown as FakeLeaf;
    assert.equal(routedTab.parent, centerTabs);

    // split 開檔：側欄 active → 以中央 leaf 為錨點 split。
    const routedSplit = patchedWorkspace.getLeaf("split") as unknown as FakeLeaf;
    assert.equal(routedSplit.parent, centerTabs);
  } finally {
    releaseWorkspaceInterceptor("test-fs-getleaf-route");
    if (previousWindow === undefined) {
      delete globalObject.window;
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      globalObject.window = previousWindow;
    }
    if (previousActiveWindow === undefined) {
      delete globalObject.activeWindow;
    } else {
      globalObject.activeWindow = previousActiveWindow;
    }
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: original
    });
  }
});
