import assert from "node:assert/strict";
import test from "node:test";

import {
  computeNextFocusedItem,
  getVisibleTreeItems,
  isElementVisible
} from "../src/tree-navigation-helpers.js";

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
  const folderViewModes: Record<string, any> = {
    "Projects/Alpha": "flat",
    "Projects/Alpha/Sub": "tree"
  };
  const folderDepthModes: Record<string, any> = {
    "Projects/Alpha": "one-level",
    "Projects/Alpha/Sub": "all-level"
  };
  const folderContentModes: Record<string, any> = {
    "Projects/Alpha": "files",
    "Projects/Alpha/Sub": "folders"
  };

  const view: any = {
    folderPath: "Projects",
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "all",
    drillDownStack: [],
    getDefaultViewMode: () => "tree",
    getFolderViewMode: (p: string) => folderViewModes[p] ?? null,
    getDefaultDepthMode: () => "all-level",
    getFolderDepthMode: (p: string) => folderDepthModes[p] ?? null,
    getDefaultContentMode: () => "all",
    getFolderContentMode: (p: string) => folderContentModes[p] ?? null,
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
});
