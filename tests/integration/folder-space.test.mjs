// Folder Space runtime 整合測試：以公開 API 開啟一個資料夾 scope，
// 驗證 leaf/view type、folderPath、view state（Tree/Flat）、整合 marker；
// 再開啟同 scope 驗證 dedupe（重用同一 leaf）。測試環境限定：開始與結束時
// 會移除 vault 中的所有 Folder Space view（含 popout），確保起始狀態確定。
// 執行：npm run test:integration（需先以 debug port 啟動 Obsidian）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  FS_VIEW_TYPE,
  pickMain,
  evalOn,
  closeAllPopouts,
  sleep,
  GET_ALL_LEAVES_EXPR,
} from "./helper.mjs";

let main;
let createdLeafId = null;

/** 移除所有 window（含 popout）的 Folder Space leaf，確保確定性起點。 */
async function resetFolderSpaceLeaves() {
  await closeAllPopouts(main);
  await evalOn(
    `(() => {
      let n = 0;
      app.workspace.iterateAllLeaves((l) => {
        if (l.getViewState().type === ${JSON.stringify(FS_VIEW_TYPE)} && typeof l.detach === "function") {
          l.detach();
          n++;
        }
      });
      return n;
    })()`,
    main
  );
  await sleep(600); // 等 layout 穩定
}

before(async () => {
  main = await pickMain();
  await resetFolderSpaceLeaves();
});

after(async () => {
  if (main) {
    await resetFolderSpaceLeaves();
  }
  console.log("cleanup: folder-space leaves removed");
});

/** 找一個既有非 root 資料夾當 scope（無資料夾時退回 root "/"）。 */
async function pickScopePath() {
  const path = await evalOn(
    `(() => {
      const folders = app.vault.getAllLoadedFiles().filter((f) => f.children !== undefined);
      const nonRoot = folders.filter((f) => f.path !== "" && f.path !== "/");
      if (nonRoot.length > 0) {
        const nonEmpty = nonRoot.filter((f) => f.children.length > 0);
        return (nonEmpty.length > 0 ? nonEmpty[0] : nonRoot[0]).path;
      }
      return "/";
    })()`,
    main
  );
  assert.equal(typeof path, "string");
  return path;
}

test("以公開 API 開啟 Folder Space（editor）並驗證 view state", async () => {
  const scopePath = await pickScopePath();
  console.log(`scope path: ${JSON.stringify(scopePath)}`);

  const beforeLeaves = (await evalOn(GET_ALL_LEAVES_EXPR, main)).filter(
    (l) => l.type === FS_VIEW_TYPE
  ).length;
  assert.equal(beforeLeaves, 0, "before() 已清空，起始應無 Folder Space leaf");

  const info = await evalOn(
    `(async () => {
      const api = app.plugins.plugins["folder-spaces"]?.api;
      if (!api) return { error: "no api" };
      const leaf = await api.openFolderSpace(${JSON.stringify(scopePath)}, "editor");
      if (!leaf) return { error: "openFolderSpace returned null" };
      const view = leaf.view;
      return {
        leafId: leaf.id,
        type: leaf.getViewState().type,
        folderPath: view.folderPath,
        viewMode: view.viewMode,
        depthMode: view.depthMode,
        contentMode: view.contentMode,
        hasBindingManager: !!view.bindingManager,
        hasApiMarker: view.isFolderSpace === true,
        title: view.getDisplayText?.() ?? "",
      };
    })()`,
    main
  );
  console.log(`opened: ${JSON.stringify(info)}`);
  if (info.error) {
    assert.fail(info.error);
  }
  assert.equal(info.type, FS_VIEW_TYPE, "leaf type 應為 folder-spaces-explorer");
  assert.equal(info.folderPath, scopePath, "view.folderPath 應等於 scope");
  assert.ok(info.viewMode === "tree" || info.viewMode === "flat", `viewMode 應為 tree/flat（got ${info.viewMode}）`);
  assert.equal(info.hasBindingManager, true, "view 應有 bindingManager（PanelBindingManager 已注入）");
  assert.equal(info.hasApiMarker, true, "view 應帶 isFolderSpace 整合標記");
  createdLeafId = info.leafId;

  const afterLeaves = (await evalOn(GET_ALL_LEAVES_EXPR, main)).filter(
    (l) => l.type === FS_VIEW_TYPE
  ).length;
  assert.equal(afterLeaves, 1, "clean 狀態下開啟應只新增 1 個 leaf");
});

test("同一 scope 再次開啟會重用既有 leaf（dedupe）", async () => {
  const scopePath = await pickScopePath();
  assert.ok(createdLeafId, "前一測試應已建立 leaf");

  const result = await evalOn(
    `(async () => {
      const api = app.plugins.plugins["folder-spaces"]?.api;
      const before = app.workspace.getLeavesOfType(${JSON.stringify(FS_VIEW_TYPE)}).length;
      const leaf = await api.openFolderSpace(${JSON.stringify(scopePath)}, "editor");
      const after = app.workspace.getLeavesOfType(${JSON.stringify(FS_VIEW_TYPE)}).length;
      return { countDelta: after - before, leafId: leaf?.id ?? null };
    })()`,
    main
  );
  console.log(`dedupe: ${JSON.stringify(result)}`);
  assert.equal(result.countDelta, 0, "同一位置重複開啟相同 folderPath 不應新增 leaf");
  assert.equal(result.leafId, createdLeafId, "應重用既有 leaf（id 相同）");
});