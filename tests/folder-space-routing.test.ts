import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { EventRef, WorkspaceLeaf, WorkspaceParent } from "obsidian";

import {
  PanelActivityTracker,
  type ActivityWorkspace
} from "../src/panel-activity-tracker.js";
import {
  choosePanelTarget,
  chooseRecentPanel,
  chooseFolderSpaceCreationTarget,
  findExistingFolderSpace,
  isSameFolderSpaceScope,
  resolveContentAreaRouting,
  createTabInLastSplit,
  getLastLeafInRoot,
  type FolderSpaceScopeCandidate,
  type PanelCandidate
} from "../src/folder-space-routing-policy.js";

interface FakeLeaf {
  parent: object;
  active: boolean;
}

function toWorkspaceLeaf(leaf: FakeLeaf): WorkspaceLeaf {
  return {
    parent: leaf.parent,
    getViewState: () => ({ active: leaf.active })
  } as unknown as WorkspaceLeaf;
}

class FakeWorkspace implements ActivityWorkspace {
  readonly rootSplit = {} as WorkspaceParent;
  activeLeaf: WorkspaceLeaf | null = null;
  leaves: WorkspaceLeaf[] = [];
  private listener: ((leaf: WorkspaceLeaf | null) => unknown) | null = null;
  private eventRef: EventRef | null = null;
  offrefCalls = 0;

  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    for (const leaf of this.leaves) {
      callback(leaf);
    }
  }

  getMostRecentLeaf(): WorkspaceLeaf | null {
    return null;
  }

  on(
    _name: "active-leaf-change",
    callback: (leaf: WorkspaceLeaf | null) => unknown
  ): EventRef {
    this.listener = callback;
    this.eventRef = {} as EventRef;
    return this.eventRef;
  }

  offref(ref: EventRef): void {
    assert.equal(ref, this.eventRef);
    this.offrefCalls += 1;
    this.listener = null;
  }

  emit(leaf: WorkspaceLeaf | null): void {
    this.listener?.(leaf);
  }
}

test("panel activity tracker updates recency and disposes its listener", () => {
  const workspace = new FakeWorkspace();
  const leftPanel = {};
  const rightPanel = {};
  const leftLeaf = toWorkspaceLeaf({ parent: leftPanel, active: false });
  const rightLeaf = toWorkspaceLeaf({ parent: rightPanel, active: false });
  workspace.leaves = [leftLeaf, rightLeaf];

  const tracker = new PanelActivityTracker(workspace, () => false);
  const initialRightOrder = tracker.getPanelOrder(rightLeaf.parent);

  workspace.emit(leftLeaf);
  assert.ok(tracker.getPanelOrder(leftLeaf.parent) > initialRightOrder);
  assert.equal(tracker.getLastLeaf(leftLeaf.parent), leftLeaf);

  tracker.dispose();
  tracker.dispose();
  assert.equal(workspace.offrefCalls, 1);
});

test("recent sibling panel wins regardless of its direction", () => {
  const leftPanel = {};
  const rightPanel = {};
  const candidates: PanelCandidate<object, string>[] = [
    { panel: leftPanel, order: 4, activeLeaf: "left-note", activePinned: false },
    { panel: rightPanel, order: 9, activeLeaf: "right-note", activePinned: false }
  ];

  const recent = chooseRecentPanel(candidates);
  assert.equal(recent?.panel, rightPanel);
  assert.deepEqual(choosePanelTarget(recent), {
    kind: "existing",
    leaf: "right-note"
  });
});

test("pinned active panel requests a new tab instead of replacing it", () => {
  const panel = {};
  const target = choosePanelTarget({
    panel,
    order: 1,
    activeLeaf: "pinned-note",
    activePinned: true
  });

  assert.deepEqual(target, { kind: "new-tab", panel });
  assert.equal(choosePanelTarget(null), null);
});

test("Folder Space creation follows a focused folder inside the folder", () => {
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "Projects",
      { path: "Projects/Active", kind: "folder", parentPath: "Projects" },
      { path: "Projects/Other.md", kind: "file", parentPath: "Projects" }
    ),
    "Projects/Active"
  );
});

test("Folder Space creation uses the focused file parent and never escapes the folder", () => {
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "Projects",
      { path: "Projects/Notes.md", kind: "file", parentPath: "Projects/Notes" },
      null
    ),
    "Projects/Notes"
  );
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "Projects",
      { path: "Outside/Notes.md", kind: "file", parentPath: "Outside" },
      { path: "Outside/Other.md", kind: "file", parentPath: "Outside" }
    ),
    "Projects"
  );
});

test("chooseRecentPanel returns null for empty candidates and handles tie-breaking", () => {
  assert.equal(chooseRecentPanel([]), null);

  const panelA = { id: "A" };
  const panelB = { id: "B" };
  const candidates: PanelCandidate<object, string>[] = [
    { panel: panelA, order: 5, activeLeaf: "leaf-A", activePinned: false },
    { panel: panelB, order: 5, activeLeaf: "leaf-B", activePinned: false }
  ];

  const winner = chooseRecentPanel(candidates);
  assert.ok(winner === candidates[0] || winner === candidates[1]);
});

test("choosePanelTarget handles null candidate or null active leaf", () => {
  assert.equal(choosePanelTarget(null), null);

  const panel = { id: "panel-1" };
  const targetWithNoActiveLeaf = choosePanelTarget({
    panel,
    order: 1,
    activeLeaf: null,
    activePinned: false
  });

  assert.deepEqual(targetWithNoActiveLeaf, { kind: "new-tab", panel });
});

test("chooseFolderSpaceCreationTarget respects strict folder boundaries and fallback rules", () => {
  // Edge case: Prefix overlap ("Projects" vs "Projects-archive")
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "Projects",
      { path: "Projects-archive/Doc.md", kind: "file", parentPath: "Projects-archive" },
      null
    ),
    "Projects"
  );

  // Fallback case: focused is outside root, but activeFile is inside root
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "Projects",
      { path: "Outside/Doc.md", kind: "file", parentPath: "Outside" },
      { path: "Projects/Sub/Doc.md", kind: "file", parentPath: "Projects/Sub" }
    ),
    "Projects/Sub"
  );

  // Null folderPath case defaults to vault root
  assert.equal(
    chooseFolderSpaceCreationTarget(
      null,
      { path: "Projects/Sub", kind: "folder", parentPath: "Projects" },
      null
    ),
    "Projects/Sub"
  );

  // Vault root folderPath (empty path) contains every candidate
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "",
      { path: "Projects/Sub", kind: "folder", parentPath: "Projects" },
      null
    ),
    "Projects/Sub"
  );
  assert.equal(
    chooseFolderSpaceCreationTarget(
      "",
      { path: "Outside/Doc.md", kind: "file", parentPath: "Outside" },
      null
    ),
    "Outside"
  );
  // Vault root falls back to the root itself when no candidate matches
  assert.equal(chooseFolderSpaceCreationTarget("", null, null), "");
});

test("Folder Space scope identity requires the same window, region, and path", () => {
  const mainWindow = {} as Window;
  const popoutWindow = {} as Window;
  const base = { folderPath: "Projects", location: "editor" as const, window: mainWindow };

  assert.equal(isSameFolderSpaceScope(base, { ...base }), true);
  assert.equal(isSameFolderSpaceScope(base, { ...base, folderPath: "Notes" }), false);
  assert.equal(isSameFolderSpaceScope(base, { ...base, location: "left-sidebar" }), false);
  assert.equal(isSameFolderSpaceScope(base, { ...base, window: popoutWindow }), false);
});

test("Folder Space uniqueness reuses only a matching window and region", () => {
  const mainWindow = {} as Window;
  const popoutWindow = {} as Window;
  const candidates: FolderSpaceScopeCandidate<string>[] = [
    { leaf: "editor-projects", folderPath: "Projects", location: "editor", window: mainWindow },
    { leaf: "sidebar-projects", folderPath: "Projects", location: "left-sidebar", window: mainWindow },
    { leaf: "editor-notes", folderPath: "Notes", location: "editor", window: mainWindow },
    { leaf: "popout-projects", folderPath: "Projects", location: "editor", window: popoutWindow }
  ];

  assert.equal(
    findExistingFolderSpace(candidates, {
      folderPath: "Projects",
      location: "editor",
      window: mainWindow
    }),
    "editor-projects"
  );
  assert.equal(
    findExistingFolderSpace(candidates, {
      folderPath: "Projects",
      location: "right-sidebar",
      window: mainWindow
    }),
    null
  );
  assert.equal(
    findExistingFolderSpace(candidates, {
      folderPath: "Projects",
      location: "editor",
      window: popoutWindow
    }),
    "popout-projects"
  );
});

test("folder path bar stays non-shrinking and ellipsizes its text child", () => {
  const stylesPath = fileURLToPath(new URL("../../styles.css", import.meta.url));
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.folder-spaces-folder-path\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(styles, /\.folder-spaces-folder-path-text\s*\{[\s\S]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(
    styles,
    /\.tree-item-self\.folder-spaces-sync-focus\s*\{[\s\S]*background-color:\s*var\(--background-modifier-hover\)/
  );
  assert.doesNotMatch(
    styles,
    /\.tree-item-self\.folder-spaces-sync-focus\s*\{[\s\S]*color:\s*var\(--text-accent\)/
  );
  assert.match(
    styles,
    /\.tree-item-self\.folder-spaces-sync-focus \.nav-folder-title-content\s*\{[\s\S]*flex-grow:\s*1/
  );
  assert.match(styles, /\.folder-spaces-sync-source-icon\s*\{[\s\S]*flex:\s*0 0 var\(--icon-xs\)/);
  assert.match(styles, /\.folder-spaces-sync-source-icon\s*\{[\s\S]*color:\s*var\(--text-accent\)/);
  assert.match(styles, /\.folder-spaces-sync-source-icon\s*\{[\s\S]*height:\s*var\(--icon-xs\)/);
  assert.match(styles, /\.folder-spaces-sync-source-icon\s*\{[\s\S]*margin-inline:\s*0/);
  assert.match(
    styles,
    /\.tree-item-self\.folder-spaces-sync-has-tail \.folder-spaces-sync-source-icon\s*\{[\s\S]*margin-inline-end:\s*var\(--size-2-1\)/
  );
  assert.match(styles, /\.folder-spaces-sync-source-icon svg\s*\{[\s\S]*display:\s*block/);
  assert.match(
    styles,
    /\.folder-spaces-folder-path > \.folder-spaces-status-icon\.is-active\s*\{[\s\S]*color:\s*var\(--text-accent\)/
  );
  assert.match(
    styles,
    /\.folder-spaces-folder-path > \.folder-spaces-status-icon\.is-active\s*\{[\s\S]*background-color:\s*transparent/
  );
  assert.match(
    styles,
    /\.workspace-leaf\.is-highlighted:before\s*\{[\s\S]*background-color:\s*color-mix\(in oklch,\s*var\(--interactive-accent\)\s*25%,\s*transparent\)/
  );
});

test("resolveContentAreaRouting routes to other tab groups in content area", () => {
  const rootSplit = { id: "root-split" };
  const leftSidebar = { id: "left-sidebar" };
  const sidebarRoots = new Set([leftSidebar]);

  const currentTabGroup = { id: "group-1" };
  const otherTabGroup = { id: "group-2" };

  const currentFsLeaf = {
    id: "fs-leaf",
    parent: currentTabGroup,
    root: rootSplit,
    pinned: false,
    viewType: "folder-spaces-explorer"
  };

  const otherNoteLeaf = {
    id: "note-leaf-1",
    parent: otherTabGroup,
    root: rootSplit,
    pinned: false,
    viewType: "markdown"
  };

  const otherPinnedLeaf = {
    id: "note-leaf-2",
    parent: otherTabGroup,
    root: rootSplit,
    pinned: true,
    viewType: "markdown"
  };

  const anotherFsLeaf = {
    id: "fs-leaf-2",
    parent: otherTabGroup,
    root: rootSplit,
    pinned: false,
    viewType: "folder-spaces-explorer"
  };

  const sidebarFsLeaf = {
    id: "fs-sidebar",
    parent: { id: "sidebar-group" },
    root: leftSidebar,
    pinned: false,
    viewType: "folder-spaces-explorer"
  };

  // 1. Sidebar Folder Space -> fallback to native routing
  const sidebarDecision = resolveContentAreaRouting(
    sidebarFsLeaf,
    [sidebarFsLeaf, otherNoteLeaf],
    () => 1,
    sidebarRoots,
    true
  );
  assert.deepEqual(sidebarDecision, { kind: "fallback" });

  // 2. Content Area with unpinned note in another tab group -> reuse-leaf
  const reuseDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf, otherNoteLeaf],
    () => 1,
    sidebarRoots,
    true
  );
  assert.deepEqual(reuseDecision, { kind: "reuse-leaf", leaf: otherNoteLeaf });

  // 3. Content Area with pinned note in another tab group -> new-tab-in-group
  const newTabDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf, otherPinnedLeaf],
    () => 1,
    sidebarRoots,
    true
  );
  assert.deepEqual(newTabDecision, { kind: "new-tab-in-group", leaf: otherPinnedLeaf });

  // 4. Content Area with only other folder spaces (no editor leaf in other groups) -> split if alwaysOpenInOtherPanel
  const splitDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf, anotherFsLeaf],
    () => 1,
    sidebarRoots,
    true
  );
  assert.deepEqual(splitDecision, { kind: "split" });

  // 5. Content Area single group, alwaysOpenInOtherPanel = false -> fallback
  const noSplitDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf],
    () => 1,
    sidebarRoots,
    false
  );
  assert.deepEqual(noSplitDecision, { kind: "fallback" });

  // 6. Content Area multiple candidates selects highest score
  const scoreMap = new Map([
    [otherNoteLeaf, 10],
    [otherPinnedLeaf, 20]
  ]);
  const highestScoreDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf, otherNoteLeaf, otherPinnedLeaf],
    (leaf) => scoreMap.get(leaf) ?? 0,
    sidebarRoots,
    true
  );
  assert.deepEqual(highestScoreDecision, { kind: "new-tab-in-group", leaf: otherPinnedLeaf });

  // 7. Content Area excludes tool views and side columns
  const fileExplorerLeaf = {
    id: "popout-file-explorer",
    parent: otherTabGroup,
    root: rootSplit,
    pinned: false,
    viewType: "file-explorer"
  };

  const sideColumnNoteLeaf = {
    id: "side-column-leaf",
    parent: otherTabGroup,
    root: rootSplit,
    pinned: false,
    viewType: "markdown",
    isSideColumn: true
  };

  const toolExcludedDecision = resolveContentAreaRouting(
    currentFsLeaf,
    [currentFsLeaf, fileExplorerLeaf, sideColumnNoteLeaf],
    () => 1,
    sidebarRoots,
    true
  );
  // Both file-explorer and sideColumnNoteLeaf are excluded -> falls through to split
  assert.deepEqual(toolExcludedDecision, { kind: "split" });

  // 8. Content Area excludes leaves in other windows
  const win1 = { id: "popout-win-1" };
  const win2 = { id: "popout-win-2" };

  const fsInWin1 = {
    id: "fs-win-1",
    parent: { id: "win1-group1" },
    root: rootSplit,
    pinned: false,
    viewType: "folder-spaces-explorer",
    window: win1
  };

  const noteInWin2 = {
    id: "note-win-2",
    parent: { id: "win2-group1" },
    root: rootSplit,
    pinned: false,
    viewType: "markdown",
    window: win2
  };

  const crossWinDecision = resolveContentAreaRouting(
    fsInWin1,
    [fsInWin1, noteInWin2],
    () => 100,
    sidebarRoots,
    true
  );
  // noteInWin2 is in win2, fsInWin1 is in win1 -> noteInWin2 excluded, decision splits in win1
  assert.deepEqual(crossWinDecision, { kind: "split" });
});

test("createTabInLastSplit finds last leaf and appends tab or falls back to first leaf creator", () => {
  const root = { id: "root" };
  const otherRoot = { id: "other-root" };
  const parentSplit = { id: "parent-split" };

  const leaf1 = {
    id: "leaf-1",
    parent: parentSplit,
    getRoot: () => root
  };
  const leaf2 = {
    id: "leaf-2",
    parent: parentSplit,
    getRoot: () => root
  };
  const leafOther = {
    id: "leaf-other",
    parent: { id: "other-parent" },
    getRoot: () => otherRoot
  };

  const createdLeaf = { id: "created-leaf", getRoot: () => root };
  let insertedInParent: unknown = null;
  let insertedIndex: number | null = null;

  const mockWorkspace = {
    iterateAllLeaves(cb: (leaf: typeof leaf1) => unknown) {
      cb(leaf1);
      cb(leafOther);
      cb(leaf2);
    },
    createLeafInParent(parent: unknown, index: number) {
      insertedInParent = parent;
      insertedIndex = index;
      return createdLeaf;
    }
  };

  const last = getLastLeafInRoot(mockWorkspace, root);
  assert.equal(last, leaf2);

  const res = createTabInLastSplit(mockWorkspace, root, () => ({ id: "first-leaf", getRoot: () => root }));
  assert.equal(res, createdLeaf);
  assert.equal(insertedInParent, parentSplit);
  assert.equal(insertedIndex, -1);

  // Fallback when root has no leaves
  let firstCreated = false;
  const emptyWorkspace = {
    iterateAllLeaves(_cb: unknown) {},
    createLeafInParent(_parent: unknown, _index: number) {
      return createdLeaf;
    }
  };
  const fallbackRes = createTabInLastSplit(emptyWorkspace, root, () => {
    firstCreated = true;
    return { id: "fallback", getRoot: () => root };
  });
  assert.equal(fallbackRes.id, "fallback");
  assert.equal(firstCreated, true);
});


