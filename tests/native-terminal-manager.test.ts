import test from "node:test";
import assert from "node:assert/strict";
import {
  isNativeTerminalFolder,
  updateNativeFileItemsTerminalIndicators,
  clearTerminalIndicators,
  type AbstractFileLike,
  type TreeItemLike
} from "../src/terminal-folder-helpers.js";

function createMockFolder(path: string, children: AbstractFileLike[] = [], isRoot = false): AbstractFileLike {
  return {
    path,
    name: path.split("/").pop() ?? "",
    children,
    isRoot: () => isRoot
  };
}

function createMockFile(path: string): AbstractFileLike {
  return {
    path,
    name: path.split("/").pop() ?? ""
  };
}

function createMockElement(): any {
  const classes = new Set<string>();
  return {
    classList: {
      add: (cls: string) => classes.add(cls),
      remove: (cls: string) => classes.delete(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force === undefined) {
          if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
        } else if (force) {
          classes.add(cls);
        } else {
          classes.delete(cls);
        }
        return classes.has(cls);
      },
      contains: (cls: string) => classes.has(cls)
    },
    get className() {
      return Array.from(classes).join(" ");
    }
  };
}

test("terminal-folder-helpers: isNativeTerminalFolder accurately detects empty folders", () => {
  const emptyFolder = createMockFolder("EmptyDir", []);
  const nonEmptyFolder = createMockFolder("HasFile", [createMockFile("HasFile/note.md")]);
  const rootFolder = createMockFolder("/", [], true);

  assert.equal(isNativeTerminalFolder(emptyFolder, null), true);
  assert.equal(isNativeTerminalFolder(nonEmptyFolder, null), false);
  assert.equal(isNativeTerminalFolder(rootFolder, null), false);
});

test("terminal-folder-helpers: isNativeTerminalFolder detects folders with only unsupported files", () => {
  const folderWithYamlOnly = createMockFolder("templates", [
    createMockFile("templates/obsidian.yaml"),
    createMockFile("templates/default.yaml")
  ]);

  const mockAppWithoutUnsupported: any = {
    vault: { getConfig: (key: string) => (key === "showUnsupportedFiles" ? false : null) },
    viewRegistry: { isExtensionRegistered: (ext: string) => ext === "md" }
  };

  const mockAppWithUnsupported: any = {
    vault: { getConfig: (key: string) => (key === "showUnsupportedFiles" ? true : null) },
    viewRegistry: { isExtensionRegistered: (ext: string) => ext === "md" }
  };

  // When showUnsupportedFiles is false and only yaml files exist -> terminal
  assert.equal(isNativeTerminalFolder(folderWithYamlOnly, { app: mockAppWithoutUnsupported }), true);

  // When showUnsupportedFiles is true -> non-terminal
  assert.equal(isNativeTerminalFolder(folderWithYamlOnly, { app: mockAppWithUnsupported }), false);
});

test("terminal-folder-helpers: isNativeTerminalFolder handles hidden folder notes", () => {
  const folderNoteOnly = createMockFolder("NotesDir", [createMockFile("NotesDir/NotesDir.md")]);
  const folderNoteWithOther = createMockFolder("NotesDir2", [
    createMockFile("NotesDir2/NotesDir2.md"),
    createMockFile("NotesDir2/another.md")
  ]);

  const settingsWithHide: any = {
    hideFolderNote: true,
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md"
  };

  // When hideFolderNote is true and only the folder note exists -> terminal
  assert.equal(isNativeTerminalFolder(folderNoteOnly, settingsWithHide), true);

  // When hideFolderNote is true and other files exist -> non-terminal
  assert.equal(isNativeTerminalFolder(folderNoteWithOther, settingsWithHide), false);

  // When hideFolderNote is false -> non-terminal
  const settingsWithoutHide: any = {
    hideFolderNote: false,
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md"
  };
  assert.equal(isNativeTerminalFolder(folderNoteOnly, settingsWithoutHide), false);
});

test("terminal-folder-helpers: updateNativeFileItemsTerminalIndicators toggles class on elements", () => {
  const emptyFolder = createMockFolder("EmptyDir", []);
  const nonEmptyFolder = createMockFolder("HasFile", [createMockFile("HasFile/note.md")]);
  const rootFolder = createMockFolder("/", [emptyFolder, nonEmptyFolder], true);
  const fileItem = createMockFile("SomeFile.md");

  const emptyEl = createMockElement();
  const nonEmptyEl = createMockElement();
  const rootEl = createMockElement();
  const fileEl = createMockElement();

  const fileItems: Record<string, TreeItemLike> = {
    "/": { file: rootFolder, selfEl: rootEl },
    "EmptyDir": { file: emptyFolder, selfEl: emptyEl },
    "HasFile": { file: nonEmptyFolder, selfEl: nonEmptyEl },
    "SomeFile.md": { file: fileItem, selfEl: fileEl }
  };

  updateNativeFileItemsTerminalIndicators(fileItems, null);

  assert.equal(emptyEl.classList.contains("is-terminal-folder"), true);
  assert.equal(nonEmptyEl.classList.contains("is-terminal-folder"), false);
  assert.equal(rootEl.classList.contains("is-terminal-folder"), false);
  assert.equal(fileEl.classList.contains("is-terminal-folder"), false);
});

test("terminal-folder-helpers: clearTerminalIndicators cleans up all is-terminal-folder classes", () => {
  const emptyEl = createMockElement();
  emptyEl.classList.add("is-terminal-folder");

  const fileItems: Record<string, TreeItemLike> = {
    "EmptyDir": { selfEl: emptyEl }
  };

  clearTerminalIndicators(fileItems);

  assert.equal(emptyEl.classList.contains("is-terminal-folder"), false);
});
