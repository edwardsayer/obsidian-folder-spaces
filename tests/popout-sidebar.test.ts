import assert from "node:assert/strict";
import test from "node:test";

import type { Workspace, WorkspaceLeaf, WorkspaceTabs } from "obsidian";

import {
  collectPopoutColumns,
  collectPopoutPanes,
  findTrueLeftSidebar,
  findTrueRightSidebar,
  getPaneRect,
  getTopLevelNodeInWindow,
  isLeafInTabs,
  isPopoutWindow,
  pickCenterPopoutPane
} from "../src/popout-sidebar.js";

test("isPopoutWindow identifies popout windows correctly", () => {
  const fakeMainWindow = {
    document: {
      body: {
        classList: {
          contains: (cls: string) => cls === "is-main-window"
        }
      }
    }
  } as unknown as Window;

  const fakePopoutWindow = {
    document: {
      body: {
        classList: {
          contains: (cls: string) => cls === "is-popout-window"
        }
      }
    }
  } as unknown as Window;

  const fakeModPopoutWindow = {
    document: {
      body: {
        classList: {
          contains: (cls: string) => cls === "mod-popout"
        }
      }
    }
  } as unknown as Window;

  assert.equal(isPopoutWindow(fakeMainWindow), false);
  assert.equal(isPopoutWindow(fakePopoutWindow), true);
  assert.equal(isPopoutWindow(fakeModPopoutWindow), true);
  assert.equal(isPopoutWindow(null), false);
  assert.equal(isPopoutWindow(undefined), false);
});

test("getPaneRect reads containerEl bounding client rect and falls back if needed", () => {
  const tabsWithContainer = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 10, top: 0, width: 300, height: 600 })
    }
  } as unknown as WorkspaceTabs;

  const rect = getPaneRect(tabsWithContainer);
  assert.deepEqual(rect, { left: 10, top: 0, width: 300, height: 600 });
});

test("collectPopoutColumns groups vertically stacked panes into a single column", () => {
  const fakeWin = {} as Window;

  const pane1Tabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 250, height: 300 })
    }
  };
  const pane2Tabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 0, top: 300, width: 250, height: 300 })
    }
  };
  const pane3Tabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 250, top: 0, width: 500, height: 600 })
    }
  };

  const leaf1 = {
    parent: pane1Tabs,
    view: { containerEl: { ownerDocument: { defaultView: fakeWin } } }
  } as unknown as WorkspaceLeaf;
  const leaf2 = {
    parent: pane2Tabs,
    view: { containerEl: { ownerDocument: { defaultView: fakeWin } } }
  } as unknown as WorkspaceLeaf;
  const leaf3 = {
    parent: pane3Tabs,
    view: { containerEl: { ownerDocument: { defaultView: fakeWin } } }
  } as unknown as WorkspaceLeaf;

  const workspace = {
    iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => {
      cb(leaf1);
      cb(leaf2);
      cb(leaf3);
    }
  } as unknown as Workspace;

  const columns = collectPopoutColumns(fakeWin, workspace);
  assert.equal(columns.length, 2);
  assert.equal(columns[0].left, 0);
  assert.equal(columns[0].panes.length, 2); // pane1 & pane2 stacked vertically
  assert.equal(columns[1].left, 250);
  assert.equal(columns[1].panes.length, 1); // pane3 full height
});

test("findTrueLeftSidebar and findTrueRightSidebar distinguish full height sidebars from sub-splits", () => {
  const fakeWin = { innerHeight: 600 } as Window;

  const leftSidebarTabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 250, height: 600 })
    }
  };
  const editorTabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 250, top: 0, width: 500, height: 600 })
    }
  };
  const rightSidebarTabs = {
    containerEl: {
      getBoundingClientRect: () => ({ left: 750, top: 0, width: 250, height: 600 })
    }
  };

  const leafLeft = { parent: leftSidebarTabs, view: { containerEl: { ownerDocument: { defaultView: fakeWin } } } } as unknown as WorkspaceLeaf;
  const leafEditor = { parent: editorTabs, view: { containerEl: { ownerDocument: { defaultView: fakeWin } } } } as unknown as WorkspaceLeaf;
  const leafRight = { parent: rightSidebarTabs, view: { containerEl: { ownerDocument: { defaultView: fakeWin } } } } as unknown as WorkspaceLeaf;

  const workspace = {
    iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => {
      cb(leafLeft);
      cb(leafEditor);
      cb(leafRight);
    }
  } as unknown as Workspace;

  const columns = collectPopoutColumns(fakeWin, workspace);
  assert.equal(columns.length, 3);

  const leftSb = findTrueLeftSidebar(fakeWin, columns);
  const rightSb = findTrueRightSidebar(fakeWin, columns);

  assert.ok(leftSb !== null);
  assert.equal(leftSb?.tabs, leftSidebarTabs as unknown as WorkspaceTabs);
  assert.ok(rightSb !== null);
  assert.equal(rightSb?.tabs, rightSidebarTabs as unknown as WorkspaceTabs);
});

test("getTopLevelNodeInWindow ascends to root level child node", () => {
  const root = { type: "root" };
  const topSplit = { parent: root, type: "split" };
  const subSplit = { parent: topSplit, type: "split" };
  const leaf = {
    parent: subSplit,
    getRoot: () => root
  } as unknown as WorkspaceLeaf;

  const topNode = getTopLevelNodeInWindow(leaf);
  assert.equal(topNode, topSplit);
});

test("pickCenterPopoutPane selects pane closest to window center", () => {
  const fakeWin = { innerWidth: 1000 } as Window;
  const pane1 = { left: 0, width: 200, center: 100, tabs: {} as WorkspaceTabs };
  const pane2 = { left: 200, width: 600, center: 500, tabs: {} as WorkspaceTabs };
  const pane3 = { left: 800, width: 200, center: 900, tabs: {} as WorkspaceTabs };

  const selected = pickCenterPopoutPane([pane1, pane2, pane3], fakeWin);
  assert.equal(selected, pane2);
});

test("isLeafInTabs accurately checks leaf parentage", () => {
  const tabs = { children: [] } as unknown as WorkspaceTabs;
  const leafInTabs = { parent: tabs } as unknown as WorkspaceLeaf;
  const leafOutTabs = { parent: {} } as unknown as WorkspaceLeaf;

  assert.equal(isLeafInTabs(leafInTabs, tabs), true);
  assert.equal(isLeafInTabs(leafOutTabs, tabs), false);
});
