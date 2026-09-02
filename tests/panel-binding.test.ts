import assert from "node:assert/strict";
import test from "node:test";

import {
  PanelBindingManager,
  generatePanelId,
  toggleLinkedViewsHighlight,
  type PanelBindingView
} from "../src/panel-binding.js";

interface FakePanel extends PanelBindingView {
  folderPath: string | null;
  alive: boolean;
  bindingChangedCount: number;
  lastFolderPathChangeOptions?: { preserveViewSettings?: boolean };
}

function createPanel(id: string, options: Partial<FakePanel> = {}): FakePanel {
  const panel: FakePanel = {
    panelId: id,
    parentPanelId: options.parentPanelId ?? null,
    followParent: options.followParent ?? true,
    folderPath: options.folderPath ?? null,
    alive: options.alive ?? true,
    bindingChangedCount: 0,
    isAlive: () => panel.alive,
    getFolderPath: () => panel.folderPath,
    setFolderPath: (path: string | null, options) => {
      panel.folderPath = path;
      panel.lastFolderPathChangeOptions = options;
    },
    onBindingChanged: () => {
      panel.bindingChangedCount += 1;
    }
  };
  return panel;
}

function isAlive(panel: FakePanel): boolean {
  return panel.alive;
}

test("register stores panels without destroying existing bindings", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  assert.equal(manager.panelCount, 2);
  assert.equal(manager.getParentOf("child"), parent);
  assert.equal(manager.getChildOf("parent"), child);

  // Re-registering the same child (as on layout change) must not unbind it.
  manager.register(child);
  assert.equal(manager.getParentOf("child"), parent);
  assert.equal(manager.getChildOf("parent"), child);
});

test("bind links parent and child and marks the child's parentPanelId", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  assert.equal(child.parentPanelId, "parent");
  assert.equal(manager.getChildOf("parent"), child);
  assert.equal(manager.getParentOf("child"), parent);
  assert.equal(child.bindingChangedCount, 1);
});

test("bind is 1:1 - rebinding a parent replaces its previous child", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const childA = createPanel("child-a");
  const childB = createPanel("child-b");

  manager.register(parent);
  manager.register(childA);
  manager.register(childB);

  manager.bind("parent", "child-a");
  manager.bind("parent", "child-b");

  assert.equal(manager.getChildOf("parent"), childB);
  assert.equal(childA.parentPanelId, null);
  assert.equal(manager.getParentOf("child-a"), null);
});

test("child panels can parent deeper cascades (unlimited depth)", () => {
  const manager = new PanelBindingManager();
  const root = createPanel("root");
  const child = createPanel("child");
  const grandchild = createPanel("grandchild");
  const greatGrandchild = createPanel("great-grandchild");

  manager.register(root);
  manager.register(child);
  manager.register(grandchild);
  manager.register(greatGrandchild);

  manager.bind("root", "child");
  manager.bind("child", "grandchild");
  manager.bind("grandchild", "great-grandchild");

  assert.equal(manager.getChildOf("root"), child);
  assert.equal(manager.getChildOf("child"), grandchild);
  assert.equal(manager.getChildOf("grandchild"), greatGrandchild);
  assert.equal(child.parentPanelId, "root");
  assert.equal(grandchild.parentPanelId, "child");
  assert.equal(greatGrandchild.parentPanelId, "grandchild");
});

test("bind rejects cyclic relationships", () => {
  const manager = new PanelBindingManager();
  const a = createPanel("a");
  const b = createPanel("b");
  const c = createPanel("c");

  manager.register(a);
  manager.register(b);
  manager.register(c);

  manager.bind("a", "b");
  manager.bind("b", "c");

  // Trying to make `b` (already a child of `a`) the parent of `a` would create
  // a cycle: a -> b -> a.
  manager.bind("b", "a");
  assert.equal(manager.getChildOf("b"), c);
  assert.equal(manager.getParentOf("a"), null);
  assert.equal(a.parentPanelId, null);
});

test("unbind clears the child binding and notifies the child", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  manager.unbind("child");

  assert.equal(manager.getChildOf("parent"), null);
  assert.equal(manager.getParentOf("child"), null);
  assert.equal(child.parentPanelId, null);
  assert.ok(child.bindingChangedCount >= 2);
});

test("unregistering a parent orphans the child (child stays alive, binding cleared)", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  parent.alive = false;
  manager.unregister("parent");

  assert.equal(child.parentPanelId, null);
  assert.equal(manager.getChildOf("parent"), null);
  assert.equal(manager.getParentOf("child"), null);
  assert.equal(manager.panelCount, 1);
});

test("propagateFrom pushes an explicit folder path to the following child", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent", { folderPath: "/A" });
  const child = createPanel("child", { folderPath: "/A/sub" });

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  manager.propagateFrom("parent", "/A/sub/deep");
  assert.equal(child.folderPath, "/A/sub/deep");
  assert.deepEqual(child.lastFolderPathChangeOptions, { preserveViewSettings: true });
});

test("propagateFrom uses the parent's current path when no explicit path is given", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent", { folderPath: "/B" });
  const child = createPanel("child", { folderPath: "/A/sub" });

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  manager.propagateFrom("parent");
  assert.equal(child.folderPath, "/B");
});

test("propagateFrom skips children whose follow toggle is OFF", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent", { folderPath: "/A" });
  const child = createPanel("child", { folderPath: "/A/sub", followParent: false });

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  manager.propagateFrom("parent", "/A/other");
  assert.equal(child.folderPath, "/A/sub");
});

test("propagateFrom skips dead children and identical paths", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent", { folderPath: "/A" });
  const child = createPanel("child", { folderPath: "/A/sub" });

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  manager.propagateFrom("parent", "/A/sub");
  assert.equal(child.folderPath, "/A/sub");

  child.alive = false;
  manager.propagateFrom("parent", "/A/other");
  assert.equal(child.folderPath, "/A/sub");
});

test("propagateFrom with no bound child is a no-op", () => {
  const manager = new PanelBindingManager();
  const lonely = createPanel("lonely", { folderPath: "/A" });
  manager.register(lonely);

  manager.propagateFrom("lonely", "/B");
  assert.equal(lonely.folderPath, "/A");
});

test("focus cascade propagates down a multi-level chain", () => {
  const manager = new PanelBindingManager();
  const root = createPanel("root", { folderPath: "/A" });
  const child = createPanel("child", { folderPath: "/A/sub" });
  const grandchild = createPanel("grandchild", { folderPath: "/A/sub/deep" });

  // Simulate the view behavior: after a panel's scope changes it re-propagates
  // to its own bound child, cascading the focus down the chain.
  child.setFolderPath = (path: string | null) => {
    child.folderPath = path;
    manager.propagateFrom(child.panelId);
  };
  grandchild.setFolderPath = (path: string | null) => {
    grandchild.folderPath = path;
    manager.propagateFrom(grandchild.panelId);
  };

  manager.register(root);
  manager.register(child);
  manager.register(grandchild);
  manager.bind("root", "child");
  manager.bind("child", "grandchild");

  manager.propagateFrom("root", "/B/clicked");
  assert.equal(child.folderPath, "/B/clicked");
  assert.equal(grandchild.folderPath, "/B/clicked");
});

test("reconcile prunes dead panels and breaks stale bindings", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent", { folderPath: "/A" });
  const child = createPanel("child", { folderPath: "/A/sub" });

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  parent.alive = false;
  const changed = manager.reconcile();

  assert.equal(changed, true);
  assert.equal(manager.panelCount, 1);
  assert.equal(child.parentPanelId, null);
  assert.equal(manager.getParentOf("child"), null);
});

test("reconcile re-links persisted parentPanelId values across reloads", () => {
  const manager = new PanelBindingManager();
  // Simulates a reload: both panels are re-registered fresh, the child still
  // carries its persisted parentPanelId, and reconcile re-establishes the link.
  const parent = createPanel("parent");
  const child = createPanel("child", { parentPanelId: "parent" });

  manager.register(parent);
  manager.register(child);

  assert.equal(manager.getChildOf("parent"), null);
  assert.equal(manager.reconcile(), true);
  assert.equal(manager.getChildOf("parent"), child);
  assert.equal(manager.getParentOf("child"), parent);
});

test("reconcile does not report changes when bindings are already consistent", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);
  manager.bind("parent", "child");

  assert.equal(manager.reconcile(), false);
  assert.equal(manager.getChildOf("parent"), child);
});

test("clear empties the registry", () => {
  const manager = new PanelBindingManager();
  manager.register(createPanel("parent"));
  manager.register(createPanel("child"));
  manager.clear();
  assert.equal(manager.panelCount, 0);
});

test("generatePanelId returns a non-empty unique string", () => {
  const a = generatePanelId();
  const b = generatePanelId();
  assert.ok(typeof a === "string" && a.length > 0);
  assert.notEqual(a, b);
});

test("isAlive helper is used by the manager for reconcile decisions", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");
  const dead = createPanel("dead");

  manager.register(parent);
  manager.register(child);
  manager.register(dead);

  dead.alive = false;
  manager.bind("parent", "child");

  assert.equal(manager.reconcile(), true);
  assert.equal(manager.panelCount, 2);
  assert.equal(isAlive(parent), true);
  assert.equal(isAlive(dead), false);
});

test("hasChild correctly reports whether a panel parents any active child", () => {
  const manager = new PanelBindingManager();
  const parent = createPanel("parent");
  const child = createPanel("child");

  manager.register(parent);
  manager.register(child);

  assert.equal(manager.hasChild("parent"), false);
  manager.bind("parent", "child");
  assert.equal(manager.hasChild("parent"), true);

  manager.unbind("child");
  assert.equal(manager.hasChild("parent"), false);
});

test("toggleLinkedViewsHighlight toggles highlight class on both bound views", () => {
  const manager = new PanelBindingManager();

  const createMockLeaf = () => {
    const classes = new Set<string>();
    const containerEl = {
      addClass: (cls: string) => classes.add(cls),
      removeClass: (cls: string) => classes.delete(cls),
      hasClass: (cls: string) => classes.has(cls)
    } as unknown as HTMLElement;
    return {
      containerEl,
      highlight: () => (containerEl as any).addClass("is-highlighted"),
      unhighlight: () => (containerEl as any).removeClass("is-highlighted")
    };
  };

  const parentLeaf = createMockLeaf();
  const childLeaf = createMockLeaf();

  const parentPanel = createPanel("parent");
  parentPanel.leaf = parentLeaf;
  parentPanel.containerEl = parentLeaf.containerEl;

  const childPanel = createPanel("child");
  childPanel.leaf = childLeaf;
  childPanel.containerEl = childLeaf.containerEl;

  manager.register(parentPanel);
  manager.register(childPanel);
  manager.bind("parent", "child");

  // Child hovers its status icon
  toggleLinkedViewsHighlight(manager, "child", childLeaf, "parent", true);
  assert.equal((childLeaf.containerEl as any).hasClass("is-highlighted"), true);
  assert.equal((parentLeaf.containerEl as any).hasClass("is-highlighted"), true);

  // Child unhovers
  toggleLinkedViewsHighlight(manager, "child", childLeaf, "parent", false);
  assert.equal((childLeaf.containerEl as any).hasClass("is-highlighted"), false);
  assert.equal((parentLeaf.containerEl as any).hasClass("is-highlighted"), false);

  // Parent hovers its sync focus icon
  toggleLinkedViewsHighlight(manager, "parent", parentLeaf, "child", true);
  assert.equal((childLeaf.containerEl as any).hasClass("is-highlighted"), true);
  assert.equal((parentLeaf.containerEl as any).hasClass("is-highlighted"), true);

  // Parent unhovers
  toggleLinkedViewsHighlight(manager, "parent", parentLeaf, "child", false);
  assert.equal((childLeaf.containerEl as any).hasClass("is-highlighted"), false);
  assert.equal((parentLeaf.containerEl as any).hasClass("is-highlighted"), false);
});
