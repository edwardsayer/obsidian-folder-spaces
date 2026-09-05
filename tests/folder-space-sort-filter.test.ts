import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSortableItems,
  DEFAULT_FOLDER_SPACE_SORT_ORDER,
  getRelativePath,
  hasMatchingPathDescendant,
  normalizeSortOrder,
  pathContainsQuery,
  sortByOrder,
  type SortableFileLike
} from "../src/folder-space-sort-filter.js";

const file = (name: string, mtime = 0, ctime = 0, path?: string): SortableFileLike => ({
  name,
  path: path ?? name,
  stat: { mtime, ctime }
});
const folder = (name: string, children: SortableFileLike[] = [], path?: string): SortableFileLike => ({
  name,
  path: path ?? name,
  children
});

test("pathContainsQuery is a case-insensitive substring on the path", () => {
  assert.equal(pathContainsQuery("", "anything"), true);
  assert.equal(pathContainsQuery("  ", "anything"), true);
  assert.equal(pathContainsQuery("note", "My Note.md"), true);
  assert.equal(pathContainsQuery("note", "Projects/My Note.md"), true); // 目錄前綴也算
  assert.equal(pathContainsQuery("NOTE", "projects/my note.md"), true);
  assert.equal(pathContainsQuery("productivity", "Professional/productivity/123.md"), true);
  assert.equal(pathContainsQuery("xyz", "My Note.md"), false);
});

test("getRelativePath extracts relative path based on basePath", () => {
  assert.equal(getRelativePath("Notes/Sub/file.md", "Notes"), "Sub/file.md");
  assert.equal(getRelativePath("Notes/file.md", "Notes"), "file.md");
  assert.equal(getRelativePath("Sub/file.md", ""), "Sub/file.md");
  assert.equal(getRelativePath("file.md", ""), "file.md");
  assert.equal(getRelativePath("file.md", null), "file.md");
  assert.equal(getRelativePath("file.md", undefined), "file.md");
  assert.equal(getRelativePath("", "Notes"), "");
  assert.equal(getRelativePath(undefined, "Notes"), "");
});

test("hasMatchingPathDescendant finds path matches at any depth", () => {
  const tree = {
    path: "root",
    name: "root",
    children: [
      { path: "root/a.md", name: "a.md" },
      {
        path: "root/sub",
        name: "sub",
        children: [
          { path: "root/sub/b.md", name: "b.md" },
          {
            path: "root/sub/deep",
            name: "deep",
            children: [{ path: "root/sub/deep/target.md", name: "target.md" }]
          }
        ]
      }
    ]
  };
  assert.equal(hasMatchingPathDescendant(tree, "deep/target"), true); // 後代路徑命中
  assert.equal(hasMatchingPathDescendant(tree, "sub"), true);
  assert.equal(hasMatchingPathDescendant(tree, "missing"), false);
  assert.equal(hasMatchingPathDescendant(tree, ""), true);
});

test("compareSortableItems puts folders first regardless of order", () => {
  const a = folder("Zeta");
  const b = file("Alpha");
  assert.ok(compareSortableItems(a, b, { key: "name", dir: "asc" }) < 0);
  assert.ok(compareSortableItems(a, b, { key: "name", dir: "desc" }) < 0);
  assert.ok(compareSortableItems(b, a, { key: "name", dir: "asc" }) > 0);
});

test("compareSortableItems sorts by name asc/desc with natural order", () => {
  assert.ok(compareSortableItems(file("a.md"), file("b.md"), { key: "name", dir: "asc" }) < 0);
  assert.ok(compareSortableItems(file("a.md"), file("b.md"), { key: "name", dir: "desc" }) > 0);
  assert.ok(compareSortableItems(file("item2.md"), file("item10.md"), { key: "name", dir: "asc" }) < 0);
});

test("compareSortableItems sorts by relative path when useRelativePath is true", () => {
  const fileA = file("zeta.md", 0, 0, "Root/alpha/zeta.md");
  const fileB = file("alpha.md", 0, 0, "Root/beta/alpha.md");

  // Default basename sort: fileB ("alpha.md") < fileA ("zeta.md")
  assert.ok(compareSortableItems(fileA, fileB, { key: "name", dir: "asc" }) > 0);

  // Relative path sort (Flat view): fileA ("alpha/zeta.md") < fileB ("beta/alpha.md")
  assert.ok(
    compareSortableItems(fileA, fileB, { key: "name", dir: "asc" }, {
      basePath: "Root",
      useRelativePath: true
    }) < 0
  );

  // Relative path desc
  assert.ok(
    compareSortableItems(fileA, fileB, { key: "name", dir: "desc" }, {
      basePath: "Root",
      useRelativePath: true
    }) > 0
  );
});

test("compareSortableItems sorts by mtime/ctime", () => {
  assert.ok(compareSortableItems(file("a", 100), file("b", 200), { key: "mtime", dir: "asc" }) < 0);
  assert.ok(compareSortableItems(file("a", 100), file("b", 200), { key: "mtime", dir: "desc" }) > 0);
  assert.ok(compareSortableItems(file("a", 0, 300), file("b", 0, 100), { key: "ctime", dir: "asc" }) > 0);
});

test("sortByOrder sorts in place, folders first then key", () => {
  const items = [
    file("b.md", 2),
    folder("A-folder"),
    file("a.md", 1),
    folder("B-folder")
  ];
  const sorted = sortByOrder(items, { key: "name", dir: "asc" });
  assert.deepEqual(
    sorted.map((i) => i.name),
    ["A-folder", "B-folder", "a.md", "b.md"]
  );

  const byMtime = sortByOrder(items, { key: "mtime", dir: "desc" });
  assert.deepEqual(byMtime.map((i) => i.name), ["A-folder", "B-folder", "b.md", "a.md"]);
});

test("sortByOrder supports relative path sorting for Flat view", () => {
  const items = [
    file("zeta.md", 0, 0, "Vault/alpha/zeta.md"),
    file("alpha.md", 0, 0, "Vault/beta/alpha.md"),
    file("main.md", 0, 0, "Vault/main.md"),
    folder("beta", [], "Vault/beta"),
    folder("alpha", [], "Vault/alpha")
  ];

  const sorted = sortByOrder(items, { key: "name", dir: "asc" }, {
    basePath: "Vault",
    useRelativePath: true
  });

  assert.deepEqual(
    sorted.map((i) => i.path),
    [
      "Vault/alpha",
      "Vault/beta",
      "Vault/alpha/zeta.md",
      "Vault/beta/alpha.md",
      "Vault/main.md"
    ]
  );
});

test("normalizeSortOrder validates key/dir", () => {
  assert.deepEqual(normalizeSortOrder({ key: "name", dir: "asc" }), { key: "name", dir: "asc" });
  assert.deepEqual(normalizeSortOrder({ key: "ctime", dir: "desc" }), { key: "ctime", dir: "desc" });
  assert.equal(normalizeSortOrder({ key: "size", dir: "asc" }), null);
  assert.equal(normalizeSortOrder({ key: "name", dir: "sideways" }), null);
  assert.equal(normalizeSortOrder(null), null);
  assert.equal(normalizeSortOrder(undefined), null);
  assert.equal(normalizeSortOrder("name"), null);
});

test("default sort order is name asc", () => {
  assert.deepEqual(DEFAULT_FOLDER_SPACE_SORT_ORDER, { key: "name", dir: "asc" });
});

test("hasMatchingPathDescendant matches nested file paths for query", () => {
  const root = folder("docs", [
    folder("features", [
      file("Obsidian compatibility.md", 0, 0, "docs/features/Obsidian compatibility.md")
    ], "docs/features")
  ], "docs");

  assert.equal(hasMatchingPathDescendant(root as any, "compat"), true);
  assert.equal(hasMatchingPathDescendant(root as any, "features"), true);
  assert.equal(hasMatchingPathDescendant(root as any, "nonexistent"), false);
});
