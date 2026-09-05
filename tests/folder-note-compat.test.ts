import assert from "node:assert/strict";
import test from "node:test";
import type { App, TFolder } from "obsidian";

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

function makeFolder(name: string, path: string, children: MockChild[]): TFolder {
  return { name, path, children } as unknown as TFolder;
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

  const info = resolveFolderNote(folder, DEFAULT_OPTIONS);
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

  const info = resolveFolderNote(folder, DEFAULT_OPTIONS);
  assert.equal(info.notePath, "Projects/Project/Project.md");

  // 無 .md 時依字母序
  const noMd = makeFolder("Project", "Projects/Project", [
    makeFile("Project.txt", "Projects/Project/Project.txt"),
    makeFile("Project.canvas", "Projects/Project/Project.canvas")
  ]);
  const infoNoMd = resolveFolderNote(noMd, DEFAULT_OPTIONS);
  assert.equal(infoNoMd.notePath, "Projects/Project/Project.canvas");
});

test("無 plugin：無同名檔時無 folder note", () => {
  const folder = makeFolder("Project", "Projects/Project", [
    makeFile("README.md", "Projects/Project/README.md")
  ]);

  const info = resolveFolderNote(folder, DEFAULT_OPTIONS);
  assert.equal(info.hasNote, false);
  assert.equal(info.notePath, null);
});

test("無 plugin：多點副檔名/測試檔案（如 frames.test.ts）不應被誤判為 folder note", () => {
  const folder = makeFolder("frames", "quartz/components/frames", [
    makeFile("frames.test.ts", "quartz/components/frames/frames.test.ts"),
    makeFile("DefaultFrame.tsx", "quartz/components/frames/DefaultFrame.tsx"),
    makeFile("registry.ts", "quartz/components/frames/registry.ts"),
    makeFile("index.ts", "quartz/components/frames/index.ts")
  ]);

  const info = resolveFolderNote(folder, DEFAULT_OPTIONS);
  assert.equal(info.hasNote, false);
  assert.equal(info.notePath, null);
});

test("無 plugin：未被 Obsidian 支援且未開啟 showUnsupportedFiles 的檔案（如 loader.ts）不應被誤判為 folder note", () => {
  const folder = makeFolder("loader", "quartz/plugins/loader", [
    makeFile("loader.ts", "quartz/plugins/loader/loader.ts")
  ]);

  // 1. 預設環境（未開啟 showUnsupportedFiles，未註冊 .ts）
  const infoDefault = resolveFolderNote(folder, DEFAULT_OPTIONS);
  assert.equal(infoDefault.hasNote, false);
  assert.equal(infoDefault.notePath, null);

  // 2. 模擬 Obsidian vault 開啟了 showUnsupportedFiles
  const appWithShowUnsupported = {
    vault: { getConfig: (key: string) => (key === "showUnsupportedFiles" ? true : false) }
  } as unknown as App;
  const infoShowUnsupported = resolveFolderNote(folder, {
    ...DEFAULT_OPTIONS,
    app: appWithShowUnsupported
  });
  assert.equal(infoShowUnsupported.hasNote, true);
  assert.equal(infoShowUnsupported.notePath, "quartz/plugins/loader/loader.ts");

  // 3. 模擬 Obsidian viewRegistry 註冊了 .ts
  const appWithViewRegistry = {
    viewRegistry: { isExtensionRegistered: (ext: string) => ext === "ts" }
  } as unknown as App;
  const infoRegistered = resolveFolderNote(folder, {
    ...DEFAULT_OPTIONS,
    app: appWithViewRegistry
  });
  assert.equal(infoRegistered.hasNote, true);
  assert.equal(infoRegistered.notePath, "quartz/plugins/loader/loader.ts");
});

test("有 plugin：嚴格 respect Folder Note 設定中的副檔名與型態", () => {
  const folder = makeFolder("loader", "quartz/plugins/loader", [
    makeFile("loader.ts", "quartz/plugins/loader/loader.ts"),
    makeFile("loader.md", "quartz/plugins/loader/loader.md")
  ]);

  // 1. Folder Note 設定僅支援 .md（預設）
  const settingsMdOnly: FolderNotesPluginSettings = {
    folderNoteType: ".md",
    supportedFileTypes: ["md"],
    folderNoteName: "{{folder_name}}"
  };
  const infoMd = resolveFolderNote(folder, {
    folderNotesSettings: settingsMdOnly,
    hasFolderNoteClass: false
  });
  assert.equal(infoMd.hasNote, true);
  assert.equal(infoMd.notePath, "quartz/plugins/loader/loader.md");

  // 2. 目錄下只有 loader.ts 時，若外掛未將 ts 列為支援型態，即使有 loader.ts 也必須視為無 note
  const folderOnlyTs = makeFolder("loader", "quartz/plugins/loader", [
    makeFile("loader.ts", "quartz/plugins/loader/loader.ts")
  ]);
  const infoTsOnly = resolveFolderNote(folderOnlyTs, {
    folderNotesSettings: settingsMdOnly,
    hasFolderNoteClass: false
  });
  assert.equal(infoTsOnly.hasNote, false);
  assert.equal(infoTsOnly.notePath, null);
});

test("無 plugin：root 資料夾的同名檔（不應為 folder note）", () => {
  // root folder 的 name 是空字串或 vault 名；同名檔幾乎不可能，但規則應安全
  const folder = makeFolder("", "", [makeFile("README.md", "README.md")]);
  const info = resolveFolderNote(folder, DEFAULT_OPTIONS);
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

  const info = resolveFolderNote(folder, {
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
  (folder).parent = parentFolder;

  const settings: FolderNotesPluginSettings = {
    folderNoteName: "{{folder_name}}",
    folderNoteType: ".md",
    storageLocation: "parentFolder",
    supportedFileTypes: ["md"],
    hideFolderNote: false
  };

  const info = resolveFolderNote(folder, {
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

  const info = resolveFolderNote(folder, {
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

  const info = resolveFolderNote(folder, {
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
  const noClass = resolveFolderNote(folder, {
    folderNotesSettings: settings,
    hasFolderNoteClass: false
  });
  assert.equal(noClass.hasNote, false);

  // 有 has-folder-note class → 有 note 但不隱藏（解析不出路徑）
  const withClass = resolveFolderNote(folder, {
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

  const info = resolveFolderNote(folder, {
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
