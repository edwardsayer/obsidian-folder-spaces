import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultOpenLocation,
  normalizeSettings,
  resolveOpenLocation,
  resolveViewIcon
} from "../src/settings.js";

(globalThis as { getIconIds?: () => string[] }).getIconIds = () => [
  "lucide-folders",
  "lucide-rocket",
  "lucide-star",
  "lucide-folder"
];

test("normalizeSettings merges defaults and normalizes folder icons", () => {
  const settings = normalizeSettings({
    folderIcons: {
      "Projects/Active": "lucide-rocket",
      "Projects/Archive": "not-a-real-icon",
      "": "lucide-folder",
      "  Projects/Empty  ": "  lucide-star  "
    }
  });

  assert.equal(settings.viewIcon, "lucide-folders");
  assert.equal(settings.folderIcons["Projects/Active"], "lucide-rocket");
  assert.equal(settings.folderIcons["Projects/Empty"], "lucide-star");
  assert.equal("Projects/Archive" in settings.folderIcons, false);
  assert.equal("" in settings.folderIcons, false);
  assert.equal("not-a-real-icon" in settings.folderIcons, false);
});

test("normalizeSettings drops folder icons equal to the default icon", () => {
  const settings = normalizeSettings({
    folderIcons: {
      "Projects/Active": "lucide-folders"
    }
  });

  assert.deepEqual(settings.folderIcons, {});
});

test("normalizeSettings tolerates null folder icons data", () => {
  const settings = normalizeSettings({ folderIcons: null });

  assert.deepEqual(settings.folderIcons, {});
});

test("normalizeSettings defaults open location per window", () => {
  assert.equal(resolveOpenLocation("editor"), "editor");
  assert.equal(resolveOpenLocation("window"), "window");
  assert.equal(resolveOpenLocation("right-sidebar"), "right-sidebar");
  assert.equal(resolveOpenLocation("bogus"), "left-sidebar");
  assert.equal(resolveOpenLocation(undefined), "left-sidebar");

  const settings = normalizeSettings({});
  assert.equal(settings.defaultOpenLocationMain, "right-sidebar");
  assert.equal(settings.defaultOpenLocationPopout, "left-sidebar");
});

test("normalizeSettings migrates the legacy open location to both windows", () => {
  const migrated = normalizeSettings({ defaultOpenLocation: "window" });
  assert.equal(migrated.defaultOpenLocationMain, "window");
  assert.equal(migrated.defaultOpenLocationPopout, "window");

  const fallback = normalizeSettings({ defaultOpenLocation: "nope" });
  assert.equal(fallback.defaultOpenLocationMain, "left-sidebar");
  assert.equal(fallback.defaultOpenLocationPopout, "left-sidebar");
});

test("normalizeSettings keeps per-window open locations", () => {
  const settings = normalizeSettings({
    defaultOpenLocationMain: "editor",
    defaultOpenLocationPopout: "window"
  });
  assert.equal(settings.defaultOpenLocationMain, "editor");
  assert.equal(settings.defaultOpenLocationPopout, "window");
});

test("getDefaultOpenLocation picks the per-window setting", () => {
  const settings = normalizeSettings({
    defaultOpenLocationMain: "right-sidebar",
    defaultOpenLocationPopout: "left-sidebar"
  });

  assert.equal(getDefaultOpenLocation(settings, false), "right-sidebar");
  assert.equal(getDefaultOpenLocation(settings, true), "left-sidebar");
});

test("resolveViewIcon returns configured icon or falls back to default", () => {
  assert.equal(resolveViewIcon("lucide-rocket"), "lucide-rocket");
  assert.equal(resolveViewIcon("invalid-icon-id"), "lucide-folders");
  assert.equal(resolveViewIcon(""), "lucide-folders");
  assert.equal(resolveViewIcon(null), "lucide-folders");
});

test("folderIcons resolves folder specific icon with fallback to viewIcon", () => {
  const settings = normalizeSettings({
    viewIcon: "lucide-folders",
    folderIcons: {
      "Projects/Active": "lucide-rocket"
    }
  });

  const getIcon = (path?: string | null) => {
    if (path) {
      const folderIcon = settings.folderIcons[path];
      if (folderIcon) {
        return resolveViewIcon(folderIcon);
      }
    }
    return resolveViewIcon(settings.viewIcon);
  };

  assert.equal(getIcon("Projects/Active"), "lucide-rocket");
  assert.equal(getIcon("Projects/Other"), "lucide-folders");
  assert.equal(getIcon(null), "lucide-folders");
});
