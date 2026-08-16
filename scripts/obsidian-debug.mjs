#!/usr/bin/env node

/**
 * 以遠端偵錯模式啟動 Obsidian（開啟 Chrome DevTools Protocol port），
 * 讓 AI agent 可以透過 chrome-devtools-mcp 連接、檢視 Obsidian runtime 與元素 style。
 *
 * 用法：
 *   npm run obsidian:debug
 *   npm run obsidian:debug -- 9223
 *   OBSIDIAN_EXE="<路徑>" npm run obsidian:debug
 *
 * 預設 debug port 為 9223（與 opencode.json 的 chrome-devtools MCP 設定一致），
 * 可用 `-- <port>` 或環境變數 FOLDER_SPACES_DEBUG_PORT 覆寫。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { get } from "node:http";
import { join } from "node:path";
import { platform } from "node:os";

const rawArgs = process.argv.slice(2);
const portArg = rawArgs.find((a) => /^\d+$/.test(a));
const PORT = Number(portArg || process.env.FOLDER_SPACES_DEBUG_PORT || 9223);
const vaultIdx = rawArgs.indexOf("--vault");
const VAULT_PATH = vaultIdx >= 0 ? rawArgs[vaultIdx + 1] : null;

/** 依平台找出 Obsidian 執行檔。 */
function resolveObsidianExe() {
  if (process.env.OBSIDIAN_EXE) {
    return process.env.OBSIDIAN_EXE;
  }
  if (platform() === "win32") {
    const candidates = [
      join(process.env.LOCALAPPDATA || "", "Programs", "Obsidian", "Obsidian.exe"),
      join(process.env.LOCALAPPDATA || "", "Obsidian", "Obsidian.exe"),
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
  }
  if (platform() === "darwin") {
    return "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
  }
  return "obsidian";
}

function endpointUp() {
  return new Promise((resolve) => {
    const req = get(`http://127.0.0.1:${PORT}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForEndpoint(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await endpointUp()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

(async () => {
  console.log("🚀 Folder Spaces Obsidian 偵錯啟動");
  const exe = resolveObsidianExe();
  console.log(`🖥️  Obsidian: ${exe}`);
  console.log(`🔌  Debug port: ${PORT}`);

  if (await endpointUp()) {
    console.log(`✅ Obsidian 已帶 debug port 執行中：http://127.0.0.1:${PORT}`);
    console.log(`   可開啟 http://127.0.0.1:${PORT}/json 檢視各視窗 target。`);
    return;
  }

  if (!existsSync(exe) && platform() !== "linux") {
    console.error('❌ 找不到 Obsidian 執行檔。可用環境變數指定：OBSIDIAN_EXE="<路徑>"');
    process.exit(1);
  }

  console.log("⏳ 啟動 Obsidian（若已有一般執行中的 Obsidian，請先完全退出）...");
  const launchArgs = [`--remote-debugging-port=${PORT}`];
  if (VAULT_PATH) {
    console.log(`📁 Vault: ${VAULT_PATH}`);
    launchArgs.push(VAULT_PATH);
  }
  const child = spawn(exe, launchArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (await waitForEndpoint(8000)) {
    console.log(`✅ Obsidian 偵錯模式已啟動：http://127.0.0.1:${PORT}`);
    console.log(`   - 每個視窗（主視窗 / popout）各自是獨立 target：http://127.0.0.1:${PORT}/json`);
    console.log("   - opencode 的 chrome-devtools MCP 已設定連線到此 port。");
  } else {
    console.warn("⚠️  無法確認 debug port 已開啟（可能 Obsidian 已在執行且未帶此參數）。");
    console.warn("   請完全退出 Obsidian 後，再執行 npm run obsidian:debug。");
  }

  console.log("   ⚠️  安全注意：此 port 讓本機任何程式都能控制 Obsidian，僅開發時使用。");
})().catch((err) => {
  console.error("❌ 啟動失敗:", err);
  process.exit(1);
});
