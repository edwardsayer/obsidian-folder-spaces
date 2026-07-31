import assert from "node:assert/strict";
import test from "node:test";

import {
  findToolbarButton,
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
  assert.deepEqual(normalizeState(null), { folderPath: null });
  assert.deepEqual(normalizeState(undefined), { folderPath: null });
  assert.deepEqual(normalizeState({}), { folderPath: null });
  assert.deepEqual(normalizeState({ folderPath: "  " }), { folderPath: null });
  assert.deepEqual(normalizeState({ folderPath: "Projects/Active" }), { folderPath: "Projects/Active" });
  assert.deepEqual(normalizeState({ folderPath: "  Notes/2026  " }), { folderPath: "Notes/2026" });
  assert.deepEqual(normalizeState({ folderPath: "Notes", viewMode: "flat" }), {
    folderPath: "Notes",
    viewMode: "flat"
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
});
