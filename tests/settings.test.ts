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
  resolveContentMode
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

test("normalizeSettings defaults and normalizes ribbon and follow-parent settings", () => {
  const defaults = normalizeSettings({});
  assert.equal(defaults.showRibbonIcon, true);
  assert.equal(defaults.defaultFollowParentSameWindow, true);
  assert.equal(defaults.defaultFollowParentNewWindow, false);

  const custom = normalizeSettings({
    showRibbonIcon: false,
    defaultFollowParentSameWindow: false,
    defaultFollowParentNewWindow: true
  });
  assert.equal(custom.showRibbonIcon, false);
  assert.equal(custom.defaultFollowParentSameWindow, false);
  assert.equal(custom.defaultFollowParentNewWindow, true);

  // Non-boolean values fall back to the defaults
  const weird = normalizeSettings({
    showRibbonIcon: "yes",
    defaultFollowParentSameWindow: 1,
    defaultFollowParentNewWindow: "no"
  });
  assert.equal(weird.showRibbonIcon, true);
  assert.equal(weird.defaultFollowParentSameWindow, true);
  assert.equal(weird.defaultFollowParentNewWindow, false);
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

test("folderIcons resolves folder specific icon with fallback to the fixed default icon", () => {
  const settings = normalizeSettings({
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
    return DEFAULT_VIEW_ICON;
  };

  assert.equal(getIcon("Projects/Active"), "lucide-rocket");
  assert.equal(getIcon("Projects/Other"), DEFAULT_VIEW_ICON);
  assert.equal(getIcon(null), DEFAULT_VIEW_ICON);
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
  assert.deepEqual(defaults.folderDepthModes, {});
  assert.deepEqual(defaults.folderContentModes, {});

  const custom = normalizeSettings({
    defaultDepthMode: "two-level",
    defaultContentMode: "folders",
    folderDepthModes: {
      "Projects/Active": "two-level",
      "Projects/Archive": "bogus",
      "": "one-level"
    },
    folderContentModes: {
      "Projects/Active": "files",
      "Projects/Archive": "bogus",
      "": "files"
    }
  });
  assert.equal(custom.defaultDepthMode, "two-level");
  assert.equal(custom.defaultContentMode, "folders");
  assert.equal(custom.folderDepthModes["Projects/Active"], "two-level");
  assert.equal("Projects/Archive" in custom.folderDepthModes, false);
  assert.equal("" in custom.folderDepthModes, false);
  assert.equal(custom.folderContentModes["Projects/Active"], "files");
  assert.equal("Projects/Archive" in custom.folderContentModes, false);
  assert.equal("" in custom.folderContentModes, false);
});
