import assert from "node:assert/strict";
import test from "node:test";

import {
  findToolbarButton,
  getFolderSpaceTitle,
  getRelativePathToFolderSpace,
  isMirrorAttribute,
  isPathInsideFolder,
  normalizeState
} from "../src/compatibility-helpers.js";

test("isMirrorAttribute accurately filters non-structural data attributes", () => {
  // Should mirror third-party custom attributes
  assert.equal(isMirrorAttribute("data-icon"), true);
  assert.equal(isMirrorAttribute("data-custom-color"), true);
  assert.equal(isMirrorAttribute("data-tags"), true);

  // Should NOT mirror structural attributes
  assert.equal(isMirrorAttribute("data-path"), false);
  assert.equal(isMirrorAttribute("data-file-basename"), false);
  assert.equal(isMirrorAttribute("data-folder-path"), false);
  assert.equal(isMirrorAttribute("data-type"), false);

  // Should NOT mirror non-data attributes
  assert.equal(isMirrorAttribute("class"), false);
  assert.equal(isMirrorAttribute("id"), false);
  assert.equal(isMirrorAttribute(null), false);
});

test("findToolbarButton matches toolbar buttons semantically regardless of index order", () => {
  assert.equal(findToolbarButton(null, "file", 0), null);

  const fakeElement = {
    querySelectorAll() {
      return [
        {
          getAttribute(attr: string) {
            return attr === "aria-label" ? "Collapse all" : null;
          },
          querySelector() {
            return { getAttribute: () => "lucide-minus-square" };
          },
          innerHTML: "collapse"
        },
        {
          getAttribute(attr: string) {
            return attr === "aria-label" ? "New folder" : null;
          },
          querySelector() {
            return { getAttribute: () => "lucide-folder-plus" };
          },
          innerHTML: "folder"
        },
        {
          getAttribute(attr: string) {
            return attr === "aria-label" ? "New note" : null;
          },
          querySelector() {
            return { getAttribute: () => "lucide-file-plus" };
          },
          innerHTML: "file"
        }
      ];
    }
  } as unknown as HTMLElement;

  const fileBtn = findToolbarButton(fakeElement, "file", 0);
  const folderBtn = findToolbarButton(fakeElement, "folder", 1);

  assert.ok(fileBtn);
  assert.ok(folderBtn);
  assert.equal((fileBtn as unknown as { innerHTML: string }).innerHTML, "file");
  assert.equal((folderBtn as unknown as { innerHTML: string }).innerHTML, "folder");
});

test("normalizeState handles null, undefined, whitespace, and valid state objects", () => {
  assert.deepEqual(normalizeState(null), { folderPath: "" });
  assert.deepEqual(normalizeState(undefined), { folderPath: "" });
  assert.deepEqual(normalizeState({}) , { folderPath: "" });
  assert.deepEqual(normalizeState({ folderPath: "  " }), { folderPath: "" });
  assert.deepEqual(normalizeState({ folderPath: "Projects/Active" }), { folderPath: "Projects/Active" });
  assert.deepEqual(normalizeState({ folderPath: "  Notes/2026  " }), { folderPath: "Notes/2026" });
  // The empty path represents the vault root.
  assert.deepEqual(normalizeState({ folderPath: "" }), { folderPath: "" });
  assert.deepEqual(normalizeState({ folderPath: "Notes", viewMode: "flat" }), {
    folderPath: "Notes",
    viewMode: "flat"
  });
  assert.deepEqual(normalizeState({ folderPath: "Notes", depthMode: "two-level" }), {
    folderPath: "Notes",
    depthMode: "two-level"
  });
  assert.deepEqual(normalizeState({ folderPath: "Notes", viewMode: "unknown" }), {
    folderPath: "Notes"
  });
});

test("isPathInsideFolder accurately evaluates path boundary conditions", () => {
  assert.equal(isPathInsideFolder(null, "Projects"), false);
  assert.equal(isPathInsideFolder("Projects", null), false);
  assert.equal(isPathInsideFolder("Projects", "Projects"), true);
  assert.equal(isPathInsideFolder("Projects/SubFolder", "Projects"), true);
  assert.equal(isPathInsideFolder("Projects/SubFolder/File.md", "Projects"), true);

  // Border collision check
  assert.equal(isPathInsideFolder("Projects-archive", "Projects"), false);
  assert.equal(isPathInsideFolder("Projects-archive/File.md", "Projects"), false);

  // The vault root (empty path) contains everything
  assert.equal(isPathInsideFolder("Projects", ""), true);
  assert.equal(isPathInsideFolder("Projects/Sub/File.md", ""), true);
  assert.equal(isPathInsideFolder(null, ""), false);
  assert.equal(isPathInsideFolder("Projects", null), false);
});

test("unspecified folderPath defaults to vault root empty string", () => {
  assert.equal(normalizeState(null).folderPath, "");
  assert.equal(normalizeState(undefined).folderPath, "");
  assert.equal(normalizeState({}).folderPath, "");
});

test("getFolderSpaceTitle returns vault name for root and last segment for subfolders", () => {
  const mockApp = {
    vault: {
      getName: () => "MyVault"
    }
  } as any;

  assert.equal(getFolderSpaceTitle(mockApp, ""), "MyVault");
  assert.equal(getFolderSpaceTitle(mockApp, null), "MyVault");
  assert.equal(getFolderSpaceTitle(mockApp, undefined), "MyVault");
  assert.equal(getFolderSpaceTitle(mockApp, "Projects"), "Projects");
  assert.equal(getFolderSpaceTitle(mockApp, "Projects/Active"), "Active");
});

test("normalizeState preserves custom state while preparing for folder spaces display", () => {
  const stateWithSearch = {
    folderPath: "Projects",
    searchQuery: "compat",
    showSearch: true
  };
  const normalized = normalizeState(stateWithSearch);
  assert.equal(normalized.folderPath, "Projects");
  // ensure normalizeState correctly accepts and retains standard object properties
  assert.equal(normalized.searchQuery, "compat");
});

test("getRelativePathToFolderSpace calculates relative paths correctly for root and subfolders", () => {
  // Root scopes ("" or "/")
  assert.equal(getRelativePathToFolderSpace("docs/advanced", ""), "docs/advanced");
  assert.equal(getRelativePathToFolderSpace("docs/advanced", "/"), "docs/advanced");
  assert.equal(getRelativePathToFolderSpace("quartz/cli/templates", ""), "quartz/cli/templates");

  // Scoped folder path
  assert.equal(getRelativePathToFolderSpace("docs/advanced", "docs"), "advanced");
  assert.equal(getRelativePathToFolderSpace("quartz/cli/templates", "quartz"), "cli/templates");
  assert.equal(getRelativePathToFolderSpace("quartz/cli/templates", "quartz/cli"), "templates");

  // Identity
  assert.equal(getRelativePathToFolderSpace("docs", "docs"), "docs");
});

