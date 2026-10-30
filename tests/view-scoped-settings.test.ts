import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeViewScopedIcon,
  normalizeViewScopedSortOrder,
  isDefaultViewScopedIcon
} from "../src/view-scoped-settings.js";
import { DEFAULT_VIEW_ICON } from "../src/settings.js";

// Node 測試環境以 globalThis 模擬 Obsidian 的 icon registry。
const mockGlobal = globalThis as unknown as { __mockObsidianIconIds?: string[] | (() => string[]) };
const TEST_ICON_IDS = ["lucide-folders", "lucide-rocket", "lucide-star", "lucide-folder"];
mockGlobal.__mockObsidianIconIds = TEST_ICON_IDS;

test("per-view icon prefers the value stored in the view state", () => {
  assert.equal(normalizeViewScopedIcon("lucide-rocket", "lucide-star"), "lucide-rocket");
  assert.equal(normalizeViewScopedIcon("  lucide-star  "), "lucide-star");
});

test("per-view icon falls back to the legacy folder-scoped value once", () => {
  assert.equal(normalizeViewScopedIcon(undefined, "lucide-rocket"), "lucide-rocket");
  assert.equal(normalizeViewScopedIcon("", "lucide-star"), "lucide-star");
  assert.equal(normalizeViewScopedIcon(null, null), DEFAULT_VIEW_ICON);
});

test("per-view icon normalizes invalid ids to the fixed default icon", () => {
  assert.equal(normalizeViewScopedIcon("not-a-real-icon"), DEFAULT_VIEW_ICON);
  assert.equal(normalizeViewScopedIcon(42, "not-a-real-icon"), DEFAULT_VIEW_ICON);
  assert.equal(isDefaultViewScopedIcon(DEFAULT_VIEW_ICON), true);
  assert.equal(isDefaultViewScopedIcon("lucide-rocket"), false);
});

test("per-view icon keeps the configured value when the registry is unavailable", () => {
  mockGlobal.__mockObsidianIconIds = [];
  assert.equal(normalizeViewScopedIcon("lucide-rocket"), "lucide-rocket");

  mockGlobal.__mockObsidianIconIds = () => {
    throw new Error("registry unavailable");
  };
  assert.equal(normalizeViewScopedIcon("lucide-star"), "lucide-star");

  mockGlobal.__mockObsidianIconIds = TEST_ICON_IDS;
});

test("per-view sort order prefers the view state and falls back to legacy", () => {
  assert.deepEqual(normalizeViewScopedSortOrder({ key: "mtime", dir: "desc" }, { key: "name", dir: "asc" }), {
    key: "mtime",
    dir: "desc"
  });
  assert.deepEqual(normalizeViewScopedSortOrder(undefined, { key: "ctime", dir: "asc" }), {
    key: "ctime",
    dir: "asc"
  });
});

test("per-view sort order returns null when neither source is valid", () => {
  assert.equal(normalizeViewScopedSortOrder(undefined, undefined), null);
  assert.equal(normalizeViewScopedSortOrder({ key: "size", dir: "asc" }, { key: "name" }), null);
  assert.equal(normalizeViewScopedSortOrder("mtime", null), null);
});
