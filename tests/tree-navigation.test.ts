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
