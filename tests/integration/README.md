# Integration Tests（CDP runtime 驗證）

整合測試透過 Chrome DevTools Protocol 連到**真實 Obsidian** 驗證 runtime 行為
（unit tests 的 mock 無法覆蓋的部分）。架構比照
`ObsidianWindowSpaces/tests/integration/`（同作者專案），取代過去散落的
一次性 `cdp-eval*.mjs` script。

## 前提

1. Obsidian 需以 debug port 啟動：

   ```bash
   npm run obsidian:debug
   ```

   （預設 port **9223**，與 `opencode.json` 的 chrome-devtools MCP 一致；可用
   `FOLDER_SPACES_DEBUG_PORT` 或 `npm run obsidian:debug -- <port>` 指定）
2. 確認 Obsidian 已載入 folder-spaces plugin（建議在測試 vault，例如
   `E:\vaults\quartz-vault` 執行）。

## 執行

```bash
npm run test:integration
```

或指定單一檔案：

```bash
node --test tests/integration/folder-space.test.mjs
```

## 與 unit tests 的區別

| | unit tests (`npm test`) | integration tests (`npm run test:integration`) |
|---|---|---|
| 環境 | jsdom + obsidian mock（tsc 編譯後以 node:test 執行） | 真實 Obsidian（debug port） |
| 依賴 | 無 | 需 Obsidian 啟動中 |
| 驗證範圍 | 純邏輯（routing/i18n/settings/panel-binding…） | runtime DOM、view type、popout、plugin 實例 |

## 檔案結構

- `helper.mjs` — CDP bridge（連線、選 target、evaluate、斷言、清理）
- `smoke.test.mjs` — 冒煙：port 可連、vault 名稱、plugin 載入、view type 註冊、leaves
- `folder-space.test.mjs` — Folder Space runtime：以公開 API 開 scope、驗證 leaf/view state、同 scope dedupe、清理
- `popout.test.mjs` — popout 場景：開 Popout Folder Space、plugin 在 popout 內可存取、清理

> 注意：`folder-space.test.mjs` 在 `before`/`after` 會**移除 vault 中的所有
> Folder Space view（含 popout）**，以確保起始狀態確定（僅限開發測試環境）。

## 新增測試場景

1. 在 `tests/integration/` 建 `xxx.test.mjs`，import
   `{ pickMain, pickPopout, evalOn, closeAllPopouts, waitForNewTarget, FS_VIEW_TYPE, GET_ALL_LEAVES_EXPR }`。
2. 動作寫成 async expression（`awaitPromise: true` 自動套用），斷言用 `node:assert`。
3. 會開 popout 的測試務必在 `after` 中 `closeAllPopouts(main)` 清理。

## Security

測試會真實操控 Obsidian（開/關 Folder Space leaf 與 popout 視窗）。僅限開發環境執行；
結束後請關閉 Obsidian（`taskkill //IM Obsidian.exe //F`）。