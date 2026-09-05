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
