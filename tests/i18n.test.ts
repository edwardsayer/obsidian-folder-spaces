import assert from "node:assert/strict";
import test from "node:test";

import { getTable, t, tf } from "../src/i18n.js";

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

  assert.equal(
    tf("settingsViewIconCurrent", { icon: "lucide-folder" }, "zh-TW"),
    "目前圖示：lucide-folder"
  );
  assert.equal(
    tf("settingsViewIconCurrent", { icon: "lucide-folder" }, "zh-CN"),
    "当前图标：lucide-folder"
  );
});
