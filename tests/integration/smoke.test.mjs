// 冒煙測試：確認 Obsidian debug port 可連、vault 存在、folder-spaces plugin 已載入、
// view type 已註冊、workspace leaves 可列舉。
// 執行：npm run test:integration（需先以 debug port 啟動 Obsidian）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PORT,
  FS_VIEW_TYPE,
  listTargets,
  pickMain,
  evalOn,
  GET_ALL_LEAVES_EXPR,
} from "./helper.mjs";

test("debug port 可連且至少有 page target", async () => {
  const targets = await listTargets();
  assert.ok(targets.length > 0, `應至少有 1 個 page target（現有 ${targets.length}）`);
  console.log(`targets: ${targets.map((t) => t.title).join(" | ")}`);
});

test("主視窗 target 存在且 vault 名稱正確", async () => {
  const main = await pickMain();
  const vault = await evalOn("app.vault.getName()", main);
  assert.ok(typeof vault === "string" && vault.length > 0, `vault name 應為非空字串（got: ${vault}）`);
  console.log(`vault: ${vault}`);
});

test("folder-spaces plugin 已載入且版本正確", async () => {
  const main = await pickMain();
  const loaded = await evalOn('!!app.plugins.plugins["folder-spaces"]', main);
  assert.equal(loaded, true, "folder-spaces plugin 應已載入");
  const version = await evalOn('app.plugins.plugins["folder-spaces"].manifest?.version', main);
  assert.ok(typeof version === "string" && version.length > 0, "plugin version 應存在");
  console.log(`folder-spaces version: ${version}`);
});

test("Folder Space view type 已註冊", async () => {
  const main = await pickMain();
  const viewType = await evalOn(`(() => {
    const p = app.plugins.plugins["folder-spaces"];
    const api = p?.api;
    return {
      apiViewType: api?.viewType ?? null,
      leaves: app.workspace.getLeavesOfType?.(${JSON.stringify(FS_VIEW_TYPE)})?.length ?? -1,
    };
  })()`, main);
  assert.equal(viewType.apiViewType, FS_VIEW_TYPE, `API viewType 應為 ${FS_VIEW_TYPE}`);
  console.log(`leaves of type ${FS_VIEW_TYPE}: ${viewType.leaves}`);
});

test("workspace 有 leaves 且可列舉（iterateAllLeaves）", async () => {
  const main = await pickMain();
  const leaves = await evalOn(GET_ALL_LEAVES_EXPR, main);
  console.log(`leaves: ${leaves.length}（例: ${leaves.slice(0, 3).map((l) => l.type).join(", ")}）`);
  assert.ok(leaves.length > 0, "workspace 應有 leaves");
});

test("debug port 環境參數與 README 一致", () => {
  console.log(`connecting to port ${PORT}（FOLDER_SPACES_DEBUG_PORT 或預設 9223）`);
});