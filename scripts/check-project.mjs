#!/usr/bin/env node
/**
 * check-project.mjs — Folder Spaces 專案健康檢查（對應 ObsidianWindowSpaces 的
 * `src/tools/check-project.js`，並加上本案特有的版本一致性與 shared engine 同步驗證）。
 *
 * 執行：npm run check:project
 *
 * 檢查項目：
 *   1. 必要檔案/目錄存在（manifest、設定檔、src、tests、scripts、文件）
 *   2. package.json 必要 devDependencies
 *   3. manifest.json 必要欄位
 *   4. 版本一致性：manifest.json ↔ package.json ↔ versions.json ↔ minAppVersion
 *   5. TypeScript 型別檢查（tsc --noEmit --skipLibCheck）
 *   6. shared engine byte-identical 同步狀態（sync:popout-engine --check）
 *      - 來源路徑可用環境變數 WINDOW_SPACES_SRC 覆寫（CI 使用）
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  failures += 1;
};
const ok = (msg) => console.log(`✅ ${msg}`);

// ---------- 1. 必要檔案 ----------
console.log("🔍 檢查必要檔案/目錄...");
const requiredPaths = [
  "manifest.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.tests.json",
  "esbuild.config.mjs",
  "version-bump.mjs",
  "styles.css",
  "LICENSE",
  "README.md",
  "README.zh-TW.md",
  "README.zh-CN.md",
  "src/main.ts",
  "src/folder-space-explorer.ts",
  "src/panel-binding.ts",
  "src/panel-activity-tracker.ts",
  "src/settings.ts",
  "src/api.ts",
  "src/i18n.ts",
  "src/compatibility-helpers.ts",
  "src/file-explorer-compatibility.ts",
  "src/folder-space-routing-policy.ts",
  "src/tree-navigation-helpers.ts",
  "src/shared/popoutLayout.ts",
  "src/shared/sharedVersion.ts",
  "src/shared/popoutLayoutRegistry.ts",
  "src/shared/workspaceInterceptor.ts",
  "src/shared/windowActiveFileTracker.ts",
  "src/ui/settings-tab.ts",
  "src/ui/icon-picker-modal.ts",
  "scripts/run-tests.mjs",
  "scripts/sync-popout-engine.mjs",
  "scripts/obsidian-debug.mjs",
  "tests/",
  "tests/integration/",
  "docs/api.md",
];
for (const p of requiredPaths) {
  if (existsSync(join(root, p))) {
    ok(p);
  } else {
    fail(`缺少檔案/目錄: ${p}`);
  }
}

// ---------- 2. 依賴 ----------
console.log("\n📦 檢查 devDependencies...");
try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = pkg.devDependencies ?? {};
  for (const dep of ["obsidian", "typescript", "esbuild", "eslint"]) {
    if (deps[dep]) {
      ok(`${dep}@${deps[dep]}`);
    } else {
      fail(`缺少 devDependency: ${dep}`);
    }
  }
} catch (e) {
  fail(`無法讀取 package.json: ${e.message}`);
}

// ---------- 3. manifest 欄位 ----------
console.log("\n📋 檢查 manifest.json...");
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  for (const field of ["id", "name", "version", "minAppVersion", "description"]) {
    if (manifest[field]) {
      ok(`${field}: ${manifest[field]}`);
    } else {
      fail(`manifest 缺少欄位: ${field}`);
    }
  }
} catch (e) {
  fail(`無法讀取 manifest.json: ${e.message}`);
}

// ---------- 4. 版本一致性 ----------
console.log("\n🔢 檢查版本一致性...");
try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest && pkg.version !== manifest.version) {
    fail(`版本不一致：package.json=${pkg.version} vs manifest.json=${manifest.version}`);
  } else if (manifest) {
    ok(`package.json ↔ manifest.json: ${pkg.version}`);
  }

  if (existsSync(join(root, "versions.json"))) {
    const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
    if (manifest && versions[manifest.version] === undefined) {
      fail(`versions.json 缺少目前版本 ${manifest.version} 的 minAppVersion 條目`);
    } else if (manifest) {
      const mapped = versions[manifest.version];
      if (mapped !== manifest.minAppVersion) {
        fail(`versions.json[${manifest.version}]=${mapped} 與 manifest.minAppVersion=${manifest.minAppVersion} 不一致`);
      } else {
        ok(`versions.json[${manifest.version}] = ${mapped}`);
      }
    }
  } else {
    fail("缺少 versions.json");
  }
} catch (e) {
  fail(`版本檢查失敗: ${e.message}`);
}

// ---------- 5. TypeScript 型別檢查 ----------
console.log("\n🧪 TypeScript 型別檢查（tsc --noEmit --skipLibCheck）...");
{
  const tsc = resolve(root, "node_modules/typescript/bin/tsc");
  const r = spawnSync(process.execPath, [tsc, "--noEmit", "--skipLibCheck"], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status === 0) {
    ok("tsc 型別檢查通過");
  } else {
    fail(`tsc 型別檢查失敗（exit ${r.status ?? "signal"})`);
  }
}

// ---------- 6. shared engine 同步狀態 ----------
console.log("\n🔗 shared engine byte-identical 檢查（sync:popout-engine --check）...");
{
  const r = spawnSync(process.execPath, [join(root, "scripts/sync-popout-engine.mjs"), "--check"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status === 0) {
    ok("shared engine 與 ObsidianWindowSpaces 同步");
  } else {
    fail(`shared engine 不同步（exit ${r.status ?? "signal"}）；請執行 npm run sync:popout-engine`);
  }
}

// ---------- 總結 ----------
console.log("\n" + (failures === 0 ? "🎉 專案檢查全部通過！" : `❗ 專案檢查失敗：${failures} 項問題`));
process.exit(failures === 0 ? 0 : 1);