import assert from "node:assert/strict";
import test from "node:test";

import { getTable, t } from "../src/i18n.js";

test("i18n language resolution falls back correctly and distinguishes zh-TW / zh-CN", () => {
  const enTable = getTable("en");
  const twTable = getTable("zh-TW");
  const cnTable = getTable("zh-CN");
  const fallbackTable = getTable("fr-FR");

  assert.equal(enTable.menuFolderSpacesLeftSidebar, "Open in left sidebar");
  assert.equal(twTable.menuFolderSpacesLeftSidebar, "在左側邊欄開啟");
  assert.equal(cnTable.menuFolderSpacesLeftSidebar, "在左侧边栏打开");
  assert.equal(fallbackTable.menuFolderSpacesLeftSidebar, "Open in left sidebar");

  assert.equal(t("actionGoUp", "zh-TW"), "返回上層資料夾");
  assert.equal(t("actionGoUp", "zh-CN"), "返回上层文件夹");
  assert.equal(t("actionOpenSettings", "en"), "Open Folder Spaces settings");
  assert.equal(t("actionOpenSettings", "zh-TW"), "開啟 Folder Spaces 設定");
  assert.equal(t("actionOpenSettings", "zh-CN"), "打开 Folder Spaces 设置");
  assert.equal(t("actionOpenFolderNote", "en"), "Open folder note");
  assert.equal(t("actionOpenFolderNote", "zh-TW"), "開啟資料夾筆記");
  assert.equal(t("actionOpenFolderNote", "zh-CN"), "打开文件夹笔记");
  assert.equal(t("actionFolderSpaceMenuHint", "en"), "Right-click to open actions menu");
  assert.equal(t("actionFolderSpaceMenuHint", "zh-TW"), "按右鍵開啟操作選單");
  assert.equal(t("actionFolderSpaceMenuHint", "zh-CN"), "按右键打开操作菜单");
  assert.equal(t("actionToggleParentLink", "en"), "Enable/disable link");
  assert.equal(t("actionToggleParentLink", "zh-TW"), "啟用/停用連結");
  assert.equal(t("actionToggleParentLink", "zh-CN"), "启用/停用链接");
  assert.equal(t("actionRemoveParentLink", "en"), "Remove parent link (cannot be undone)");
  assert.equal(t("actionRemoveParentLink", "zh-TW"), "移除父連結 (無法復原)");
  assert.equal(t("actionRemoveParentLink", "zh-CN"), "移除父链接 (无法复原)");
  assert.equal(t("settingsCascadeSection", "en"), "Cascade & linking");
  assert.equal(t("settingsCascadeSection", "zh-TW"), "雙面板接龍與連動");
  assert.equal(t("settingsCascadeSection", "zh-CN"), "双面板接龙与连动");
});

test("i18n recognizes various Traditional and Simplified Chinese locale tags", () => {
  const traditionalTags = ["zh-tw", "zh-TW", "zh_TW", "zh-hk", "zh-HK", "zh-mo", "zh-hant", "zh-Hant-TW", "zh-cht", "cht"];
  for (const tag of traditionalTags) {
    assert.equal(
      t("actionGoUp", tag),
      "返回上層資料夾",
      `Expected ${tag} to resolve to Traditional Chinese`
    );
  }

  const simplifiedTags = ["zh", "zh-cn", "zh-CN", "zh_CN", "zh-sg", "zh-hans", "zh-chs", "chs"];
  for (const tag of simplifiedTags) {
    assert.equal(
      t("actionGoUp", tag),
      "返回上层文件夹",
      `Expected ${tag} to resolve to Simplified Chinese`
    );
  }

  const fallbackTags = ["en", "en-US", "ja", "de", "unknown"];
  for (const tag of fallbackTags) {
    assert.equal(
      t("actionGoUp", tag),
      "Up to parent folder",
      `Expected ${tag} to fall back to English`
    );
  }
});

test("i18n auto-detects locale from Obsidian getLanguage() and moment.locale()", () => {
  const originalLang = (globalThis as any).__mockObsidianLanguage;
  const originalMoment = (globalThis as any).__mockMomentLocale;

  try {
    // 1. 模擬 Obsidian getLanguage() 回傳 "zh-TW"
    (globalThis as any).__mockObsidianLanguage = "zh-TW";
    assert.equal(t("actionGoUp"), "返回上層資料夾");
    assert.equal(t("commandOpenFolderSpace"), "開啟 Folder Space");

    // 2. 模擬 Obsidian getLanguage() 回傳 "zh-CN"
    (globalThis as any).__mockObsidianLanguage = "zh-CN";
    assert.equal(t("actionGoUp"), "返回上层文件夹");

    // 3. 模擬 Obsidian getLanguage() 無法取得時 fallback 到 moment.locale() 回傳 "zh-tw"
    (globalThis as any).__mockObsidianLanguage = "";
    (globalThis as any).__mockMomentLocale = "zh-tw";
    assert.equal(t("actionGoUp"), "返回上層資料夾");

    // 4. 模擬英文
    (globalThis as any).__mockObsidianLanguage = "en";
    assert.equal(t("actionGoUp"), "Up to parent folder");
  } finally {
    (globalThis as any).__mockObsidianLanguage = originalLang;
    (globalThis as any).__mockMomentLocale = originalMoment;
  }
});
