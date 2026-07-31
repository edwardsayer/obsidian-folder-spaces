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

  // Null folderPath case
  assert.equal(
    chooseFolderSpaceCreationTarget(
      null,
      { path: "Projects/Sub", kind: "folder", parentPath: "Projects" },
      null
    ),
    null
  );
});

test("folder path bar stays non-shrinking and ellipsizes its text child", () => {
  const stylesPath = fileURLToPath(new URL("../../styles.css", import.meta.url));
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.folder-spaces-folder-path\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(styles, /\.folder-spaces-folder-path-text\s*\{[\s\S]*text-overflow:\s*ellipsis/);
});
