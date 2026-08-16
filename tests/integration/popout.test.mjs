// Popout 場景整合測試：以公開 API 在「新視窗」開啟 Folder Space → 等新 popout target
// 出現 → 驗證 popout 內有 folder-spaces-explorer leaf 且 plugin 可存取 → 清理。
// 執行：npm run test:integration（需先以 debug port 啟動 Obsidian）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  FS_VIEW_TYPE,
  listTargets,
  pickMain,
  evalOn,
  closeAllPopouts,
  waitForNewTarget,
  GET_ALL_LEAVES_EXPR,
} from "./helper.mjs";

let main;

before(async () => {
  main = await pickMain();
  await closeAllPopouts(main); // 確保乾淨起點
});

after(async () => {
  if (main) await closeAllPopouts(main);
  console.log("cleanup: popouts closed");
});

test("openFolderSpace(location: window) 會建立 popout 且內含 Folder Space leaf", async () => {
  const beforeTargets = await listTargets();
  const exceptIds = new Set(beforeTargets.map((t) => t.id));

  const opened = await evalOn(
    `(async () => {
      const api = app.plugins.plugins["folder-spaces"]?.api;
      if (!api) return { error: "no api" };
      const folders = app.vault.getAllLoadedFiles().filter((f) => f.children !== undefined && f.children.length > 0);
      const scopePath = folders.length > 0 ? folders[0].path : "";
      const leaf = await api.openFolderSpace(scopePath, "window");
      if (!leaf) return { error: "openFolderSpace(window) returned null", scopePath };
      return { leafId: leaf.id, scopePath };
    })()`,
    main
  );
  console.log(`opened (window): ${JSON.stringify(opened)}`);
  if (opened.error) assert.fail(opened.error);

  const popout = await waitForNewTarget(exceptIds);
  console.log(`popout target: ${popout.title} (${popout.url})`);

  const info = await evalOn(
    `(() => {
      const p = app.plugins.plugins["folder-spaces"];
      const leaves = ${GET_ALL_LEAVES_EXPR};
      return {
        pluginLoaded: !!p,
        hasApi: !!p?.api,
        fsLeaves: leaves.filter((l) => l.type === ${JSON.stringify(FS_VIEW_TYPE)}),
      };
    })()`,
    popout
  );
  console.log(`popout 內 plugin/leaves: ${JSON.stringify(info)}`);
  assert.equal(info.pluginLoaded, true, "popout 中 folder-spaces plugin 應可存取（app 共用）");
  assert.equal(info.hasApi, true, "popout 中 api 應存在");
  assert.ok(
    info.fsLeaves.length > 0,
    `popout 內應有 ${FS_VIEW_TYPE} leaf（got: ${JSON.stringify(info.fsLeaves)}）`
  );
});