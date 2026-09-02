import assert from "node:assert/strict";
import test from "node:test";

import {
  readFolderNotesSettings,
  resolveFolderNote,
  type FolderNotesPluginSettings
} from "../src/folder-note-compat.js";

interface MockChild {
  name: string;
  path: string;
  extension?: string;
}

interface MockFolder {
  name: string;
  path: string;
  children: MockChild[];
}

function makeFolder(name: string, path: string, children: MockChild[]): MockFolder {
  return { name, path, children };
}

function makeFile(name: string, path: string): MockChild {
  const dotIndex = name.lastIndexOf(".");
  return { name, path, extension: dotIndex > 0 ? name.slice(dotIndex + 1) : "" };
}

const DEFAULT_OPTIONS = {
  folderNotesSettings: null,
  hasFolderNoteClass: false
};

test("無 plugin：資料夾內同名 .md 為 folder note，其餘檔案正常顯示", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.md", "Projects/Project/Project.md"),
    makeFile("README.md", "Projects/Project/README.md")
  ]);

  const info = resolveFolderNote(folder as any, DEFAULT_OPTIONS);
  assert.equal(info.hasNote, true);
  assert.equal(info.notePath, "Projects/Project/Project.md");
  assert.equal(info.shouldHide, false);
});

test("無 plugin：多檔同名時 .md 優先，其餘字母序", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.canvas", "Projects/Project/Project.canvas"),
    makeFile("Project.txt", "Projects/Project/Project.txt"),
    makeFile("Project.md", "Projects/Project/Project.md")
  ]);

  const info = resolveFolderNote(folder as any, DEFAULT_OPTIONS);
  assert.equal(info.notePath, "Projects/Project/Project.md");

  // 無 .md 時依字母序
  const noMd = makeFolder("Project", "Projects/Project", [
    makeFile("Project.txt", "Projects/Project/Project.txt"),
    makeFile("Project.canvas", "Projects/Project/Project.canvas")
  ]);
  const infoNoMd = resolveFolderNote(noMd as any, DEFAULT_OPTIONS);
  assert.equal(infoNoMd.notePath, "Projects/Project/Project.canvas");
});

test("無 plugin：無同名檔時無 folder note", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("README.md", "Projects/Project/README.md")
  ]);

  const info = resolveFolderNote(folder as any, DEFAULT_OPTIONS);
  assert.equal(info.hasNote, false);
  assert.equal(info.notePath, null);
});

test("無 plugin：root 資料夾的同名檔（不應為 folder note）", () => {
  // root folder 的 name 是空字串或 vault 名；同名檔幾乎不可能，但規則應安全
  const folder = makeFolder("", "", [makeFile("README.md", "README.md")]);
  const info = resolveFolderNote(folder as any, DEFAULT_OPTIONS);
  assert.equal(info.hasNote, false);
});

test("有 plugin：依 folderNoteName 模板與 storageLocation 解析", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project_note.md", "Projects/Project/Project_note.md")
  ]);
  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}_note",
    folderNoteType: ".md",
    storageLocation: "insideFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: true
  };

  const info = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(info.hasNote, true);
  assert.equal(info.notePath, "Projects/Project/Project_note.md");
  assert.equal(info.shouldHide, true);
});

test("有 plugin：storageLocation parentFolder 時 note 在父資料夾", () => {
  const parentChildren = [makeFile("Project.md", "Projects/Project.md")];
  const parentFolder = makeFolder("Projects", "Projects", parentChildren);
  const folder = makeFolder("Project", "Projects/Project", []);
  // mock parent 連結
  (folder as any).parent = parentFolder;

  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md",
    storageLocation: "parentFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: false
  };

  const info = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  // 解析路徑為父資料夾的 Project.md
  assert.equal(info.notePath, "Projects/Project.md");
  assert.equal(info.hasNote, true);
});

test("有 plugin：hideFolderNote false 時不隱藏", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.md", "Projects/Project/Project.md")
  ]);
  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md",
    storageLocation: "insideFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: false
  };

  const info = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(info.hasNote, true);
  assert.equal(info.notePath, "Projects/Project/Project.md");
  assert.equal(info.shouldHide, false);
});

test("有 plugin：excludeFolders 中 disableFolderNote 的資料夾視為無 note", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.md", "Projects/Project/Project.md")
  ]);
  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md",
    storageLocation: "insideFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: true,
    excludeFolders: [{ path: "Projects/Project", disableFolderNote: true }]
  };

  const info = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(info.hasNote, false);
  assert.equal(info.notePath, null);
  assert.equal(info.shouldHide, false);
});

test("有 plugin：解析失敗時不降級到慣例，以 has-folder-note class 為輔助信號", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.md", "Projects/Project/Project.md")
  ]);
  // plugin 用非慣例模板，解析失敗
  const settings: FolderNotesPluginSettings = {
    folderNoteName: "custom_name",
    folderNoteType: ".md",
    storageLocation: "insideFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: true
  };

  // 無 class → 視為無 note
  const noClass = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(noClass.hasNote, false);

  // 有 has-folder-note class → 有 note 但不隱藏（解析不出路徑）
  const withClass = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: true
  });
  assert.equal(withClass.hasNote, true);
  assert.equal(withClass.notePath, null);
  assert.equal(withClass.shouldHide, false);
});

test("有 plugin：folderNoteType .excalidraw 對應 .md", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("Project.md", "Projects/Project/Project.md")
  ]);
  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".excalidraw",
    storageLocation: "insideFolder",
    supportedFileTypes: ["excalidraw"],
    hideFolderNote: true
  };

  const info = resolveFolderNote(folder as any, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(info.hasNote, true);
  assert.equal(info.notePath, "Projects/Project/Project.md");
});

test("readFolderNotesSettings 讀取 plugin registry 中的 settings", () => {
  const app = {
    plugins: {
      plugins: {
        "folder-notes": { settings: { hideFolderNote: true } },
        "other-plugin": { settings: { foo: 1 } }
      }
    }
  };
  const settings = readFolderNotesSettings(app);
  assert.equal(settings?.hideFolderNote, true);

  // 未安裝時回傳 null
  assert.equal(readFolderNotesSettings({ plugins: { plugins: {} } }), null);
  assert.equal(readFolderNotesSettings(null), null);
});
