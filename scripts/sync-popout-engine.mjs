#!/usr/bin/env node
/**
 * sync-popout-engine.mjs
 * 
 * 從 WindowSpaces 同步共用模組到 FolderSpaces
 * 
 * 使用方式：
 *   node scripts/sync-popout-engine.mjs [--dry-run|--check]
 *
 * 來源路徑預設為同層資料夾 ../ObsidianWindowSpaces/src/shared；
 * 可用環境變數 WINDOW_SPACES_SRC 覆寫（CI 中 checkout 來源 repo 後指定）。
 * 
 * 同步的檔案：
 *   - popoutLayout.ts (PopoutLayoutEngine 與共用工具)
 *   - sharedVersion.ts (共用 API 版本 metadata)
 *   - popoutLayoutRegistry.ts (Singleton Registry)
 *   - workspaceInterceptor.ts (Workspace API coordinator)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 路徑配置（來源可經 WINDOW_SPACES_SRC 覆寫，供 CI 使用）
const PATHS = {
  windowSpaces: process.env.WINDOW_SPACES_SRC
    ? resolve(process.env.WINDOW_SPACES_SRC)
    : join(__dirname, "../../ObsidianWindowSpaces/src/shared"),
  folderSpaces: join(__dirname, "../src/shared"),
  
  // 來源與目標檔案必須保持完整且 byte-identical。
  sharedFiles: [
    "popoutLayout.ts",
    "sharedVersion.ts",
    "popoutLayoutRegistry.ts",
    "workspaceInterceptor.ts",
  ],
};

const isDryRun = process.argv.includes("--dry-run");
const isCheck = process.argv.includes("--check");

/**
 * 複製檔案
 */
function copyFile(fileName) {
  const sourcePath = join(PATHS.windowSpaces, fileName);
  const targetPath = join(PATHS.folderSpaces, fileName);
  
  if (!existsSync(sourcePath)) {
    console.error(`❌ 找不到來源檔案：${sourcePath}`);
    return false;
  }
  
  const content = readFileSync(sourcePath);

  if (isCheck) {
    if (!existsSync(targetPath)) {
      console.error(`❌ 找不到目標檔案：${targetPath}`);
      return false;
    }
    const targetContent = readFileSync(targetPath);
    const identical = content.equals(targetContent);
    console.log(`${identical ? "✅" : "❌"} ${fileName}: ${identical ? "byte-identical" : "內容不同"}`);
    return identical;
  }

  if (isDryRun) {
    const targetExists = existsSync(targetPath);
    const targetContent = targetExists ? readFileSync(targetPath) : null;
    const identical = targetContent?.equals(content) ?? false;
    console.log(`\n📝 將複製：${fileName} → ${fileName}`);
    console.log(`   大小：${content.length} bytes`);
    console.log(`   目前狀態：${targetExists ? (identical ? "byte-identical" : "內容不同") : "目標不存在"}`);
    return true;
  }

  writeFileSync(targetPath, content);
  const copiedContent = readFileSync(targetPath);
  const identical = content.equals(copiedContent);
  console.log(`${identical ? "✅" : "❌"} 已複製：${fileName}`);
  console.log(`   來源：${sourcePath}`);
  console.log(`   目標：${targetPath}`);
  return identical;
}

/**
 * 主函式
 */
async function main() {
  console.log("🔄 從 WindowSpaces 同步共用模組...\n");
  
  if (isDryRun) {
    console.log("📋 Dry run 模式，不會寫入檔案");
  } else if (isCheck) {
    console.log("🔎 Check 模式，只驗證 byte-identical，不會寫入檔案");
  }
  
  // 確保目標目錄存在
  if (!isDryRun && !isCheck && !existsSync(PATHS.folderSpaces)) {
    mkdirSync(PATHS.folderSpaces, { recursive: true });
  }
  
  // 複製檔案
  const results = PATHS.sharedFiles.map((fileName) => copyFile(fileName));
  
  const successCount = results.filter(Boolean).length;
  
  // 顯示摘要
  console.log("\n📊 同步摘要：");
  console.log(`   來源：WindowSpaces/src/shared/`);
  console.log(`   目標：FolderSpaces/src/shared/`);
  console.log(`   成功：${successCount}/${PATHS.sharedFiles.length} 個檔案`);
  console.log(`   時間：${new Date().toISOString()}`);
  
  // 提醒下一步
  if (successCount !== PATHS.sharedFiles.length) {
    process.exitCode = 1;
    return;
  }

  if (!isDryRun && !isCheck) {
    console.log("\n📌 下一步：");
    console.log("   1. 執行 npm run check 確認無錯誤");
    console.log("   2. 執行 npm run build 進行建置");
  }
}

main().catch((error) => {
  console.error("❌ 同步失敗：", error);
  process.exit(1);
});
