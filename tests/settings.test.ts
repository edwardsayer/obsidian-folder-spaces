import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIEW_ICON,
  getDefaultFollowParent,
  getDefaultOpenLocation,
  normalizeSettings,
  resolveOpenLocation,
  resolveViewIcon,
  resolveDepthMode,
  resolveContentMode,
  readLegacyFolderScopedSettings
} from "../src/settings.js";

// Node 測試環境以 globalThis 模擬 Obsidian 的 icon registry（`getIconIds` 由 obsidian 模組提供）。
const mockGlobal = globalThis as unknown as { __mockObsidianIconIds?: string[] | (() => string[]) };
const TEST_ICON_IDS = ["lucide-folders", "lucide-rocket", "lucide-star", "lucide-folder"];
mockGlobal.__mockObsidianIconIds = TEST_ICON_IDS;

test("normalizeSettings no longer carries per-folder path maps", () => {
  const settings = normalizeSettings({
    folderIcons: { "Projects/Active": "lucide-rocket" },
    folderSortOrders: { "Projects/Active": { key: "mtime", dir: "desc" } }
  });

  // icon／排序現在屬於 panel（view state），不再是 settings 的一部分
  assert.equal("folderIcons" in settings, false);
  assert.equal("folderSortOrders" in settings, false);
});

test("readLegacyFolderScopedSettings normalizes legacy path maps for one-time migration", () => {
  const legacy = readLegacyFolderScopedSettings({
    folderIcons: {
      "Projects/Active": "lucide-rocket",
      "Projects/Archive": "not-a-real-icon",
      "": "lucide-folder",
      "  Projects/Empty  ": "  lucide-star  ",
      "Projects/Default": "lucide-folders"
    },
    folderSortOrders: {
      "Projects/Active": { key: "mtime", dir: "desc" },
      "Projects/Broken": { key: "size", dir: "desc" }
    }
  });

  assert.equal(legacy.folderIcons["Projects/Active"], "lucide-rocket");
  assert.equal(legacy.folderIcons["Projects/Empty"], "lucide-star");
  assert.equal("Projects/Archive" in legacy.folderIcons, false);
  assert.equal("" in legacy.folderIcons, false);
  assert.equal("not-a-real-icon" in legacy.folderIcons, false);
  // 等於預設 icon 的條目不需要遷移
  assert.equal("Projects/Default" in legacy.folderIcons, false);

  assert.deepEqual(legacy.folderSortOrders["Projects/Active"], { key: "mtime", dir: "desc" });
  assert.equal("Projects/Broken" in legacy.folderSortOrders, false);
});

test("readLegacyFolderScopedSettings tolerates missing or invalid data", () => {
  assert.deepEqual(readLegacyFolderScopedSettings(null), { folderIcons: {}, folderSortOrders: {} });
  assert.deepEqual(readLegacyFolderScopedSettings({ folderIcons: null }), {
    folderIcons: {},
    folderSortOrders: {}
  });
});

// 回歸測試（GitHub issue #2）：Obsidian 未把 getIconIds 掛到 window，舊實作取不到
// registry 就一律回 DEFAULT_VIEW_ICON，導致圖示永遠無法變更（連既有設定也被清空）。
// registry 不可用時必須 fail-open，保留使用者設定。
test("keeps icons when the icon registry is unavailable", () => {
  mockGlobal.__mockObsidianIconIds = [];

  const legacy = readLegacyFolderScopedSettings({
    folderIcons: { Projects: "lucide-rocket" }
  });

  assert.equal(legacy.folderIcons["Projects"], "lucide-rocket");
  assert.equal(resolveViewIcon("lucide-rocket"), "lucide-rocket");

  mockGlobal.__mockObsidianIconIds = TEST_ICON_IDS;
});

test("keeps folder icons when the icon registry throws", () => {
  mockGlobal.__mockObsidianIconIds = () => {
    throw new Error("icon registry unavailable");
  };

  assert.equal(resolveViewIcon("lucide-rocket"), "lucide-rocket");

  mockGlobal.__mockObsidianIconIds = TEST_ICON_IDS;
});

test("normalizeSettings defaults open location per window", () => {
  assert.equal(resolveOpenLocation("editor"), "editor");
  assert.equal(resolveOpenLocation("window"), "left-sidebar");
  assert.equal(resolveOpenLocation("right-sidebar"), "right-sidebar");
  assert.equal(resolveOpenLocation("bogus"), "left-sidebar");
  assert.equal(resolveOpenLocation(undefined), "left-sidebar");

  const settings = normalizeSettings({});
  assert.equal(settings.defaultOpenLocationMain, "right-sidebar");
  assert.equal(settings.defaultOpenLocationPopout, "left-sidebar");
});

test("normalizeSettings migrates the legacy open location to both windows", () => {
  const migrated = normalizeSettings({ defaultOpenLocation: "window" });
  assert.equal(migrated.defaultOpenLocationMain, "left-sidebar");
  assert.equal(migrated.defaultOpenLocationPopout, "left-sidebar");

  const fallback = normalizeSettings({ defaultOpenLocation: "nope" });
  assert.equal(fallback.defaultOpenLocationMain, "left-sidebar");
  assert.equal(fallback.defaultOpenLocationPopout, "left-sidebar");
});

test("normalizeSettings keeps per-window open locations", () => {
  const settings = normalizeSettings({
    defaultOpenLocationMain: "editor",
    defaultOpenLocationPopout: "right-sidebar"
  });
  assert.equal(settings.defaultOpenLocationMain, "editor");
  assert.equal(settings.defaultOpenLocationPopout, "right-sidebar");
});

test("normalizeSettings migrates legacy window in per-window setting", () => {
  const settings = normalizeSettings({
    defaultOpenLocationMain: "window",
    defaultOpenLocationPopout: "window"
  });
  assert.equal(settings.defaultOpenLocationMain, "left-sidebar");
  assert.equal(settings.defaultOpenLocationPopout, "left-sidebar");
});

test("getDefaultOpenLocation picks the per-window setting", () => {
  const settings = normalizeSettings({
    defaultOpenLocationMain: "right-sidebar",
    defaultOpenLocationPopout: "left-sidebar"
  });

  assert.equal(getDefaultOpenLocation(settings, false), "right-sidebar");
  assert.equal(getDefaultOpenLocation(settings, true), "left-sidebar");
});

test("normalizeSettings defaults and normalizes ribbon and follow-parent settings", () => {
  const defaults = normalizeSettings({});
  assert.equal(defaults.showRibbonIcon, true);
  assert.equal(defaults.defaultFollowParentSameWindow, true);
  assert.equal(defaults.defaultFollowParentNewWindow, false);
  assert.equal(defaults.alwaysOpenInOtherPanel, true);

  const custom = normalizeSettings({
    showRibbonIcon: false,
    defaultFollowParentSameWindow: false,
    defaultFollowParentNewWindow: true,
    alwaysOpenInOtherPanel: false
  });
  assert.equal(custom.showRibbonIcon, false);
  assert.equal(custom.defaultFollowParentSameWindow, false);
  assert.equal(custom.defaultFollowParentNewWindow, true);
  assert.equal(custom.alwaysOpenInOtherPanel, false);

  // Non-boolean values fall back to the defaults
  const weird = normalizeSettings({
    showRibbonIcon: "yes",
    defaultFollowParentSameWindow: 1,
    defaultFollowParentNewWindow: "no",
    alwaysOpenInOtherPanel: "false"
  });
  assert.equal(weird.showRibbonIcon, true);
  assert.equal(weird.defaultFollowParentSameWindow, true);
  assert.equal(weird.defaultFollowParentNewWindow, false);
  assert.equal(weird.alwaysOpenInOtherPanel, true);
});

test("getDefaultFollowParent picks the per-window behavior", () => {
  const settings = normalizeSettings({
    defaultFollowParentSameWindow: true,
    defaultFollowParentNewWindow: false
  });

  assert.equal(getDefaultFollowParent(settings, false), true);
  assert.equal(getDefaultFollowParent(settings, true), false);
});

test("resolveViewIcon returns configured icon or falls back to the fixed default", () => {
  assert.equal(resolveViewIcon("lucide-rocket"), "lucide-rocket");
  assert.equal(resolveViewIcon("invalid-icon-id"), DEFAULT_VIEW_ICON);
  assert.equal(resolveViewIcon(""), DEFAULT_VIEW_ICON);
  assert.equal(resolveViewIcon(null), DEFAULT_VIEW_ICON);
});

test("resolveDepthMode returns valid depth mode or falls back to all-level", () => {
  assert.equal(resolveDepthMode("one-level"), "one-level");
  assert.equal(resolveDepthMode("two-level"), "two-level");
  assert.equal(resolveDepthMode("all-level"), "all-level");
  assert.equal(resolveDepthMode("bogus"), "all-level");
  assert.equal(resolveDepthMode(undefined), "all-level");
  assert.equal(resolveDepthMode(null), "all-level");
});

test("resolveContentMode returns valid content mode or falls back to all", () => {
  assert.equal(resolveContentMode("folders"), "folders");
  assert.equal(resolveContentMode("files"), "files");
  assert.equal(resolveContentMode("all"), "all");
  assert.equal(resolveContentMode("bogus"), "all");
  assert.equal(resolveContentMode(undefined), "all");
  assert.equal(resolveContentMode(null), "all");
});

test("normalizeSettings defaults and normalizes depth and content modes", () => {
  const defaults = normalizeSettings({});
  assert.equal(defaults.defaultDepthMode, "all-level");
  assert.equal(defaults.defaultContentMode, "all");

  const custom = normalizeSettings({
    defaultDepthMode: "two-level",
    defaultContentMode: "folders"
  });
  assert.equal(custom.defaultDepthMode, "two-level");
  assert.equal(custom.defaultContentMode, "folders");
});

test("normalizeSettings defaults and normalizes view presets", () => {
  const defaults = normalizeSettings({});
  assert.equal(defaults.defaultPreset, "explorer");
  assert.equal(defaults.defaultChildPreset, "contents");
  assert.equal(defaults.adaptiveCascadeParent, true);
  assert.equal(defaults.cascadeParentPreset, "navigate");

  const custom = normalizeSettings({
    defaultPreset: "navigate",
    defaultChildPreset: "context",
    adaptiveCascadeParent: false,
    cascadeParentPreset: "columns",
    defaultPresetBogus: "whatever"
  });
  assert.equal(custom.defaultPreset, "navigate");
  assert.equal(custom.defaultChildPreset, "context");
  assert.equal(custom.adaptiveCascadeParent, false);
  assert.equal(custom.cascadeParentPreset, "columns");

  const invalid = normalizeSettings({
    defaultPreset: "bogus",
    defaultChildPreset: "bogus",
    adaptiveCascadeParent: "no",
    cascadeParentPreset: "bogus"
  });
  assert.equal(invalid.defaultPreset, "explorer");
  assert.equal(invalid.defaultChildPreset, "contents");
  assert.equal(invalid.adaptiveCascadeParent, true);
  assert.equal(invalid.cascadeParentPreset, "navigate");
});

