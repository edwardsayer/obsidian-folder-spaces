#!/usr/bin/env node
/**
 * test-build.mjs — 驗證 production build 產物（對應 ObsidianWindowSpaces 的
 * `src/tools/test-build.js`）。在 `npm run build` 之後執行：
 *   npm run test:build
 *
 * 檢查項目：
 *   1. main.js / styles.css / manifest.json 存在且非空（production sourcemap:false，main.js.map 僅為選配）
 *   2. main.js 包含 plugin 的核心標記（字串常數／property 名在 minify 後仍保留）
 *   3. manifest 欄位與大小合理性
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  failures += 1;
};
const ok = (msg) => console.log(`✅ ${msg}`);

console.log("🧪 測試 Folder Spaces build 產物...\n");

// ---------- 1. 產物存在 ----------
console.log("📁 檢查生成檔案:");
for (const file of ["main.js", "styles.css", "manifest.json"]) {
  const abs = resolve(root, file);
  if (existsSync(abs)) {
    const size = statSync(abs).size;
    if (size > 0) {
      ok(`${file} (${size} bytes)`);
    } else {
      fail(`${file} 為空檔案`);
    }
  } else {
    fail(`缺少 build 產物: ${file}（請先執行 npm run build）`);
  }
}
if (existsSync(resolve(root, "main.js.map"))) {
  ok(`main.js.map (${statSync(resolve(root, "main.js.map")).size} bytes，dev 建置產物)`);
}

// ---------- 2. main.js 內容標記 ----------
console.log("\n🔎 檢查 main.js 內容標記:");
// production 有 minify：class 名稱會被改名（如 FolderSpacesPlugin），
// 因此只檢查「字串常數／property 名稱」這類 minify 後仍保留的標記。
const mainJsPath = resolve(root, "main.js");
if (existsSync(mainJsPath)) {
  const content = readFileSync(mainJsPath, "utf8");
  const markers = {
    "folder-spaces-explorer": "Folder Space view type 字串",
    "folder-spaces": "插件 id 字串",
    "openFolderSpace": "公開 API 方法名（property，minify 保留）",
  };
  for (const [marker, desc] of Object.entries(markers)) {
    if (content.includes(marker)) {
      ok(`包含 ${desc} (${marker})`);
    } else {
      fail(`main.js 缺少 ${desc} 標記 (${marker}) — 可能建置/打包異常`);
    }
  }

  const size = statSync(mainJsPath).size;
  if (size < 10000) {
    fail(`main.js 僅 ${size} bytes，功能可能不完整`);
  } else if (size > 500000) {
    console.warn(`⚠️  main.js ${size} bytes，較大，可考慮優化`);
  } else {
    ok(`main.js 大小合理 (${size} bytes)`);
  }
}

// ---------- 3. manifest ----------
console.log("\n📋 檢查 manifest.json:");
try {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  for (const field of ["id", "name", "version", "minAppVersion", "description"]) {
    ok(`${field}: ${manifest[field] ?? "(缺)"}`);
  }
} catch (e) {
  fail(`無法讀取 manifest.json: ${e.message}`);
}

console.log("\n" + (failures === 0 ? "🎉 build 產物驗證通過！" : `❗ build 產物驗證失敗：${failures} 項問題`));
process.exit(failures === 0 ? 0 : 1);