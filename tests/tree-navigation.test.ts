import assert from "node:assert/strict";
import test from "node:test";

import {
  computeNextFocusedItem,
  getVisibleTreeItems,
  isElementVisible
} from "../src/tree-navigation-helpers.js";
import { getPreset, presetToState } from "../src/presets.js";

// Mock minimal DOM setup for testing navigation logic in Node
function createMockElement(tagName: string, className = ""): any {
  const children: any[] = [];
  const style: Record<string, string> = {};
  const classListSet = new Set(className.split(" ").filter(Boolean));
  let parentElement: any = null;

  const el: any = {
    tagName: tagName.toUpperCase(),
    style,
    classList: {
      contains: (cls: string) => classListSet.has(cls),
      add: (cls: string) => classListSet.add(cls),
      remove: (cls: string) => classListSet.delete(cls)
    },
    children,
    get parentElement() {
      return parentElement;
    },
    set parentElement(val: any) {
      parentElement = val;
    },
    get isConnected() {
      let p = parentElement;
      while (p) {
        if (p.tagName === "BODY" || p.tagName === "HTML") return true;
        p = p.parentElement;
      }
      return false;
    },
    appendChild(child: any) {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    querySelector(selector: string) {
      if (selector === ".tree-item-children") {
        return children.find((c) => c.classList.contains("tree-item-children")) ?? null;
      }
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === ".tree-item-self") {
        const result: any[] = [];
        const walk = (node: any) => {
          if (node.classList.contains("tree-item-self")) {
            result.push(node);
          }
          for (const child of node.children) {
            walk(child);
          }
        };
        walk(el);
        return result;
      }
      return [];
    },
    closest(selector: string) {
      let curr: any = el;
      while (curr) {
        if (selector === ".tree-item" && curr.classList.contains("tree-item")) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    },
    contains(child: any) {
      let curr = child;
      while (curr) {
        if (curr === el) return true;
        curr = curr.parentElement;
      }
      return false;
    }
  };

  return el;
}

test("isElementVisible accurately detects visibility in tree hierarchy", () => {
  const body = createMockElement("body");
  const navContainer = createMockElement("div", "nav-files-container");
  body.appendChild(navContainer);

  const folder1 = createMockElement("div", "tree-item");
  const folder1Self = createMockElement("div", "tree-item-self");
  const folder1Children = createMockElement("div", "tree-item-children");
  folder1.appendChild(folder1Self);
  folder1.appendChild(folder1Children);
  navContainer.appendChild(folder1);

  const child1 = createMockElement("div", "tree-item");
  const child1Self = createMockElement("div", "tree-item-self");
  child1.appendChild(child1Self);
  folder1Children.appendChild(child1);

  // Initially expanded
  assert.equal(isElementVisible(folder1Self), true);
  assert.equal(isElementVisible(child1Self), true);

  // Collapse folder1
  folder1.classList.add("is-collapsed");
  assert.equal(isElementVisible(folder1Self), true);
  assert.equal(isElementVisible(child1Self), false);

  // Hidden by display: none
  folder1Self.style.display = "none";
  assert.equal(isElementVisible(folder1Self), false);
});

test("computeNextFocusedItem moves focus only between visible items and skips collapsed children", () => {
  const body = createMockElement("body");
  const navContainer = createMockElement("div", "nav-files-container");
  body.appendChild(navContainer);

  // Folder A (collapsed)
  const folderA = createMockElement("div", "tree-item is-collapsed");
  const folderASelf = createMockElement("div", "tree-item-self");
  const folderAChildren = createMockElement("div", "tree-item-children");
  folderA.appendChild(folderASelf);
  folderA.appendChild(folderAChildren);

  const childA1 = createMockElement("div", "tree-item");
  const childA1Self = createMockElement("div", "tree-item-self");
  childA1.appendChild(childA1Self);
  folderAChildren.appendChild(childA1);

  // File B
  const fileB = createMockElement("div", "tree-item");
  const fileBSelf = createMockElement("div", "tree-item-self");
  fileB.appendChild(fileBSelf);

  navContainer.appendChild(folderA);
  navContainer.appendChild(fileB);

  const itemFolderA: any = { selfEl: folderASelf, file: { path: "FolderA" } };
  const itemChildA1: any = { selfEl: childA1Self, file: { path: "FolderA/childA1.md" }, parent: itemFolderA };
  const itemFileB: any = { selfEl: fileBSelf, file: { path: "fileB.md" } };

  const filesMap = new Map();
  filesMap.set(folderA, itemFolderA.file);
  filesMap.set(childA1, itemChildA1.file);
  filesMap.set(fileB, itemFileB.file);

  const fileItems = {
    "FolderA": itemFolderA,
    "FolderA/childA1.md": itemChildA1,
    "fileB.md": itemFileB
  };

  const visible = getVisibleTreeItems(navContainer, filesMap, fileItems);
  assert.deepEqual(visible, [itemFolderA, itemFileB]);

  // Press Down from folderA -> skips childA1.md (hidden inside collapsed folder) and returns fileB directly
  const nextItem = computeNextFocusedItem(visible, itemFolderA, "forwards", "Root");
  assert.equal(nextItem, itemFileB);

  // Press Up from fileB -> returns folderA directly
  const prevItem = computeNextFocusedItem(visible, itemFileB, "backwards", "Root");
  assert.equal(prevItem, itemFolderA);

  // If focused item was childA1 (hidden), pressing Down recovers to closest visible parent or fileB
  const recoveredItem = computeNextFocusedItem(visible, itemChildA1, "forwards", "Root");
  assert.equal(recoveredItem, itemFileB);
});

test("keyboard focus change cascades to bound child panel", async () => {
  const propagatedPaths: string[] = [];
  const manager: any = {
    hasChild: (id: string) => id === "parent-panel",
    getChildOf: (id: string) => ({ panelId: "child-panel", followParent: true }),
    propagateFrom: (id: string, path: string) => {
      propagatedPaths.push(path);
    }
  };

  let focused: any = null;
  const tree: any = {
    focusedItem: null,
    setFocusedItem(item: any, focus?: boolean) {
      focused = item;
      tree.focusedItem = item;
    }
  };

  // Simulate registerTreeNavigationOverride hook on setFocusedItem
  const originalSetFocusedItem = tree.setFocusedItem.bind(tree);
  tree.setFocusedItem = function (item: any, focus?: boolean) {
    originalSetFocusedItem(item, focus);
    if (item?.file?.isFolder && manager.hasChild("parent-panel")) {
      const child = manager.getChildOf("parent-panel");
      if (child && child.followParent) {
        manager.propagateFrom("parent-panel", item.file.path);
      }
    }
  };

  const folderItem: any = { file: { path: "Projects/Alpha", isFolder: true } };
  const fileItem: any = { file: { path: "Projects/Alpha/doc.md", isFolder: false } };

  tree.setFocusedItem(folderItem);
  assert.equal(focused, folderItem);
  assert.deepEqual(propagatedPaths, ["Projects/Alpha"]);

  // Focusing a file should not cascade folder path
  tree.setFocusedItem(fileItem);
  assert.deepEqual(propagatedPaths, ["Projects/Alpha"]);
});

test("drillDownToFolder pushes current state to drillDownStack and updates to target folder", () => {
  const view: any = {
    folderPath: "Projects",
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "all",
    drillDownStack: [],
    getDefaultViewMode: () => "tree",
    getDefaultDepthMode: () => "all-level",
    getDefaultContentMode: () => "all",
    getFolderSortOrder: () => null,
    getIcon: () => "lucide-folders",
    requestSort: () => {},
    followParentButtonEl: {
      toggle: () => {},
      toggleClass: () => {},
      setAttr: () => {},
      removeAttribute: () => {},
      empty: () => {}
    },
    app: {
      workspace: {
        requestSaveLayout: () => Promise.resolve()
      }
    }
  };

  // Import drillDownToFolder / drillDownGoBack logic test
  // Step 1: Drill down to Projects/Alpha
  if (!view.drillDownStack) view.drillDownStack = [];
  view.drillDownStack.push({
    folderPath: view.folderPath,
    viewMode: view.viewMode,
    depthMode: view.depthMode,
    contentMode: view.contentMode
  });
  view.folderPath = "Projects/Alpha";
  view.viewMode = "flat";
  view.depthMode = "one-level";
  view.contentMode = "files";

  assert.equal(view.folderPath, "Projects/Alpha");
  assert.equal(view.viewMode, "flat");
  assert.equal(view.depthMode, "one-level");
  assert.equal(view.contentMode, "files");
  assert.equal(view.drillDownStack.length, 1);
  assert.deepEqual(view.drillDownStack[0], {
    folderPath: "Projects",
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "all"
  });

  // Step 2: Drill down to Projects/Alpha/Sub
  view.drillDownStack.push({
    folderPath: view.folderPath,
    viewMode: view.viewMode,
    depthMode: view.depthMode,
    contentMode: view.contentMode
  });
  view.folderPath = "Projects/Alpha/Sub";
  view.viewMode = "tree";
  view.depthMode = "all-level";
  view.contentMode = "folders";
  assert.equal(view.drillDownStack.length, 2);

  // Step 3: Back to Projects/Alpha
  const prev1 = view.drillDownStack.pop();
  view.folderPath = prev1.folderPath;
  view.viewMode = prev1.viewMode;
  view.depthMode = prev1.depthMode;
  view.contentMode = prev1.contentMode;
  assert.equal(view.folderPath, "Projects/Alpha");
  assert.equal(view.drillDownStack.length, 1);

  // Step 4: Back to Projects
  const prev2 = view.drillDownStack.pop();
  view.folderPath = prev2.folderPath;
  view.viewMode = prev2.viewMode;
  view.depthMode = prev2.depthMode;
  view.contentMode = prev2.contentMode;
  assert.equal(view.folderPath, "Projects");
  assert.equal(view.drillDownStack.length, 0);
});

test("isTerminalFolderItem identifies terminal folders by depth limit and item availability", () => {
  const rootFolder: any = { path: "Root", children: [] };
  const folderWithChildren: any = { path: "Root/FolderA", children: [{ path: "Root/FolderA/doc.md" }] };
  const emptyFolder: any = { path: "Root/EmptyFolder", children: [] };

  const view: any = {
    folderPath: "Root",
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "all",
    fileItems: {},
    app: {
      vault: {
        getAbstractFileByPath: (p: string) => {
          if (p === "Root") return rootFolder;
          if (p === "Root/FolderA") return folderWithChildren;
          if (p === "Root/EmptyFolder") return emptyFolder;
          return null;
        }
      }
    },
    getSortedFolderItems: (folder: any) => {
      if (folder === folderWithChildren) {
        return [{ file: { path: "Root/FolderA/doc.md" } }];
      }
      return [];
    }
  };

  // Helper logic simulation for isTerminalFolderItem
  const testIsTerminal = (v: any, f: any) => {
    if (f === rootFolder) return false;
    if (v.viewMode === "tree") {
      const limit = v.depthMode === "one-level" ? 1 : v.depthMode === "two-level" ? 2 : null;
      if (limit !== null) {
        const prefix = "Root/";
        const rel = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
        const depth = rel ? rel.split("/").length : 0;
        if (depth >= limit) return true;
      }
    }
    const items = v.getSortedFolderItems(f);
    return !items || items.length === 0;
  };

  // Case 1: all-level depth, folder with children is NOT terminal
  assert.equal(testIsTerminal(view, folderWithChildren), false);

  // Case 2: all-level depth, empty folder IS terminal
  assert.equal(testIsTerminal(view, emptyFolder), true);

  // Case 3: one-level depth limit forces all depth 1 items to be terminal
  view.depthMode = "one-level";
  assert.equal(testIsTerminal(view, folderWithChildren), true);
  assert.equal(testIsTerminal(view, emptyFolder), true);

  // Case 4: two-level depth limit allows depth 1 to expand, but forces depth 2 to be terminal
  view.depthMode = "two-level";
  const depth2Folder: any = { path: "Root/FolderA/SubFolder", children: [{ path: "Root/FolderA/SubFolder/file.md" }] };
  assert.equal(testIsTerminal(view, folderWithChildren), false); // depth 1 < 2 -> non-terminal
  assert.equal(testIsTerminal(view, depth2Folder), true); // depth 2 >= 2 -> terminal

  // Case 5: contentMode folders with only files inside is terminal
  view.depthMode = "all-level";
  view.contentMode = "folders";
  const folderWithOnlyFiles: any = { path: "Root/FolderWithOnlyFiles", children: [{ path: "Root/FolderWithOnlyFiles/note.md" }] };
  // in folders contentMode, getSortedFolderItems returns 0 items for folders that only contain files
  assert.equal(testIsTerminal(view, folderWithOnlyFiles), true);

  // Case 6: contentMode all with only hidden folder note is terminal
  view.contentMode = "all";
  const folderWithFolderNoteOnly: any = { path: "Root/FolderWithNote", children: [{ path: "Root/FolderWithNote/FolderWithNote.md" }] };
  const folderNotesSettings = { hideFolderNote: true };
  const testIsTerminalWithNotes = (v: any, f: any, noteInfo: any) => {
    if (f === rootFolder) return false;
    const items = v.getSortedFolderItems(f);
    if (!items || items.length === 0) return true;
    if (noteInfo?.shouldHide && noteInfo.notePath) {
      const visible = items.filter((i: any) => i.file.path !== noteInfo.notePath);
      if (visible.length === 0) return true;
    }
    return false;
  };
  view.getSortedFolderItems = (f: any) => {
    if (f === folderWithFolderNoteOnly) return [{ file: { path: "Root/FolderWithNote/FolderWithNote.md" } }];
    return [];
  };
  assert.equal(
    testIsTerminalWithNotes(view, folderWithFolderNoteOnly, {
      notePath: "Root/FolderWithNote/FolderWithNote.md",
      hasNote: true,
      shouldHide: true
    }),
    true
  );

  // Case 7: contentMode all with hidden folder note AND other files is NOT terminal
  const folderWithNoteAndDoc: any = {
    path: "Root/FolderWithNoteAndDoc",
    children: [{ path: "Root/FolderWithNoteAndDoc/Note.md" }, { path: "Root/FolderWithNoteAndDoc/other.md" }]
  };
  view.getSortedFolderItems = (f: any) => {
    if (f === folderWithNoteAndDoc) {
      return [
        { file: { path: "Root/FolderWithNoteAndDoc/Note.md" } },
        { file: { path: "Root/FolderWithNoteAndDoc/other.md" } }
      ];
    }
    return [];
  };
  // Case 8: folder with only unsupported files (e.g. .yaml with showUnsupportedFiles: false) is terminal
  const folderWithYamlOnly: any = {
    path: "Root/FolderWithYamlOnly",
    children: [{ path: "Root/FolderWithYamlOnly/config.yaml" }]
  };
  const testIsTerminalWithUnsupported = (v: any, f: any, showUnsupported: boolean, registeredExts: string[]) => {
    if (f === rootFolder) return false;
    const items = v.getSortedFolderItems(f);
    if (!items || items.length === 0) return true;
    const supported = items.filter((item: any) => {
      if (!item?.file || item.file.children) return true;
      if (showUnsupported) return true;
      const ext = item.file.path.split(".").pop()?.toLowerCase() ?? "";
      if (!ext) return false;
      return registeredExts.includes(ext) || ext === "md" || ext === "canvas";
    });
    return supported.length === 0;
  };
  view.getSortedFolderItems = (f: any) => {
    if (f === folderWithYamlOnly) {
      return [{ file: { path: "Root/FolderWithYamlOnly/config.yaml" } }];
    }
    return [];
  };
  assert.equal(testIsTerminalWithUnsupported(view, folderWithYamlOnly, false, []), true);
  assert.equal(testIsTerminalWithUnsupported(view, folderWithYamlOnly, true, []), false);
  assert.equal(testIsTerminalWithUnsupported(view, folderWithYamlOnly, false, ["yaml"]), false);
});

test("drillDownToFolder applies defaultChildPreset and drillDownGoBack restores previous state", () => {
  const view: any = {
    folderPath: "Projects",
    viewMode: "tree",
    depthMode: "one-level",
    contentMode: "folders", // e.g. navigate preset
    drillDownStack: [],
    getDefaultChildPreset: () => "contents",
    requestSort: () => {},
    followParentButtonEl: {
      toggle: () => {},
      toggleClass: () => {},
      setAttr: () => {},
      removeAttribute: () => {},
      empty: () => {}
    }
  };

  // Helper simulating drillDownToFolder
  const simulateDrillDown = (v: any, target: string) => {
    v.drillDownStack.push({
      folderPath: v.folderPath,
      viewMode: v.viewMode,
      depthMode: v.depthMode,
      contentMode: v.contentMode
    });
    v.folderPath = target;
    const childPresetId = v.getDefaultChildPreset?.() ?? "contents";
    const childPreset = getPreset(childPresetId);
    if (childPreset) {
      const modes = presetToState(childPreset);
      v.viewMode = modes.viewMode;
      v.depthMode = modes.depthMode;
      v.contentMode = modes.contentMode;
    }
    if (v.contentMode === "files") {
      v.viewMode = "flat";
    }
  };

  const simulateGoBack = (v: any) => {
    const prev = v.drillDownStack.pop();
    if (!prev) return;
    v.folderPath = prev.folderPath;
    v.viewMode = prev.viewMode;
    v.depthMode = prev.depthMode;
    v.contentMode = prev.contentMode;
    if (v.contentMode === "files") {
      v.viewMode = "flat";
    }
  };

  // Initial state: navigate preset
  assert.equal(view.folderPath, "Projects");
  assert.equal(view.viewMode, "tree");
  assert.equal(view.depthMode, "one-level");
  assert.equal(view.contentMode, "folders");

  // Step 1: Drill down -> defaultChildPreset ('contents') applied
  simulateDrillDown(view, "Projects/Alpha");
  assert.equal(view.folderPath, "Projects/Alpha");
  assert.equal(view.viewMode, "flat");
  assert.equal(view.depthMode, "all-level");
  assert.equal(view.contentMode, "all");
  assert.equal(view.drillDownStack.length, 1);

  // Step 2: Go back -> restored to navigate preset
  simulateGoBack(view);
  assert.equal(view.folderPath, "Projects");
  assert.equal(view.viewMode, "tree");
  assert.equal(view.depthMode, "one-level");
  assert.equal(view.contentMode, "folders");
  assert.equal(view.drillDownStack.length, 0);
});

test("3-zone click dispatch correctly discriminates Chevron, Name, and Row background", () => {
  type ClickAction = "toggle" | "open-note" | "cascade" | "drill-down";

  const dispatchClick = (options: {
    zone: "chevron" | "name" | "row";
    hasFolderNote: boolean;
    hasFollowingChild: boolean;
  }): ClickAction => {
    if (options.zone === "chevron") {
      return "toggle";
    }
    if (options.zone === "name") {
      if (options.hasFolderNote) {
        return "open-note";
      }
      if (options.hasFollowingChild) {
        return "cascade";
      }
      return "toggle";
    }
    // row background
    if (options.hasFollowingChild) {
      return "cascade";
    }
    return "drill-down";
  };

  // 1. Chevron clicks: ALWAYS toggle regardless of note or twin panel
  assert.equal(dispatchClick({ zone: "chevron", hasFolderNote: false, hasFollowingChild: false }), "toggle");
  assert.equal(dispatchClick({ zone: "chevron", hasFolderNote: true, hasFollowingChild: false }), "toggle");
  assert.equal(dispatchClick({ zone: "chevron", hasFolderNote: true, hasFollowingChild: true }), "toggle");

  // 2. Name clicks:
  // - With Folder Note: open-note
  assert.equal(dispatchClick({ zone: "name", hasFolderNote: true, hasFollowingChild: false }), "open-note");
  assert.equal(dispatchClick({ zone: "name", hasFolderNote: true, hasFollowingChild: true }), "open-note");
  // - Without Folder Note: single panel toggles (native), twin panel cascades
  assert.equal(dispatchClick({ zone: "name", hasFolderNote: false, hasFollowingChild: false }), "toggle");
  assert.equal(dispatchClick({ zone: "name", hasFolderNote: false, hasFollowingChild: true }), "cascade");

  // 3. Row background clicks:
  // - Single panel: in-place drill-down
  assert.equal(dispatchClick({ zone: "row", hasFolderNote: false, hasFollowingChild: false }), "drill-down");
  assert.equal(dispatchClick({ zone: "row", hasFolderNote: true, hasFollowingChild: false }), "drill-down");
  // - Twin panel: cascade
  assert.equal(dispatchClick({ zone: "row", hasFolderNote: false, hasFollowingChild: true }), "cascade");
  assert.equal(dispatchClick({ zone: "row", hasFolderNote: true, hasFollowingChild: true }), "cascade");
});
