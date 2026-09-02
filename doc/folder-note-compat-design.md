# Folder Note 相容性與名稱底線整合設計 (Folder Note Compatibility & Underline Integration)

> **版本**：v2.0 (2026-09-02)  
> **狀態**：設計已定稿（名稱文字底線提示 + 點擊三段分流，取消獨立 note 圖示）  
> **關聯模組**：`src/folder-note-compat.ts`、`src/folder-space-explorer.ts`（渲染與點擊分流）、`src/main.ts`、`doc/cascade-panel-and-view-presets-design.md`（§2 智慧點擊分流）

---

## 1. 背景與設計原則

第三方 Folder Notes 插件（`folder-notes`）與社群主流外掛（如 `Notebook Navigator`）最為人稱道的互動習慣是：
- **名稱文字懸停底線（Hover Underline）**：當資料夾擁有 Folder Note 時，名稱文字在 hover 時呈現底線（`text-decoration: underline`），清晰傳達「點擊名稱即可開啟筆記」的語意。
- **點擊語意三段分流**：
  - **點 Chevron**：一律開合目錄。
  - **點 Name 文字**：有 Note 則開 Note；無 Note 時若有連動子面板則連動，無連動子面板則開合（完全等同原生 File Explorer）。
  - **點 Row 背景**：有連動子面板則連動，無連動子面板則**立即就地下鑽（In-place Drill-down）**。

這取代了原先在資料夾右側附加獨立小圖示（`.folder-spaces-note-icon`）的設計，回歸社群最自然的桌面應用操作直覺。

---

## 2. Folder Note 偵測規則 (Detection Rules)

### 2.1 設計原則

- **以 folder-notes plugin 自己的設定為準**，不自行猜測。
- **plugin 未安裝時**以放寬慣例偵測，且**傾向顯示而非隱藏**（fail-open）。
- 偵測結果用於兩個用途：**是否隱藏檔案**（follow `hideFolderNote`）與**是否掛載底線樣式與開 note 語意**。

### 2.2 偵測來源層級（依優先序）

| 層級 | 規則 | 說明 |
| :--- | :--- | :--- |
| **A. plugin 設定** | 讀 `app.plugins.plugins["folder-notes"]?.settings` | 依 `folderNoteName`（模板）、`storageLocation`（inside/outside）、`folderNoteType`（`.md`/`.canvas`）、`excludeFolders`/`whitelistFolders`（含 `detachedFilePath`、`showFolderNote`、`disableFolderNote`）解析出該資料夾的 folder note 路徑。 |
| **B. 無 plugin 慣例** | `資料夾名.*`（任何副檔名） | 僅在 plugin 未安裝時使用；多檔符合時依副檔名優先序取第一個（見 §2.3）。 |
| **C. 顯示信號** | 資料夾 title 上的 `has-folder-note` class | folder-notes 在有 note 的資料夾 title 加此 class。作為**輔助驗證**：與 A/B 解析結果一致才確信「有 note」。 |

> **plugin 存在但解析失敗（A 層回傳 null）時**：不自動降級到 B（因為 plugin 可能刻意用非慣例設定）。此時以 C 的 `has-folder-note` class 為唯一信號；class 也沒有 → 視為無 note（不隱藏、無底線提示）。

### 2.3 無 plugin 慣例的副檔名優先序

`資料夾名.*` 多檔符合時，依以下順序取第一個作為 folder note：

1. `.md`（Markdown，與 folder-notes 預設一致）
2. 其餘副檔名依**字母順序**（`.canvas` < `.txt` < ...）

**其餘符合檔一律正常顯示在檔案樹中**（不隱藏、不視為 folder note）。

### 2.4 隱藏行為（檔案是否顯示在樹中）

| 情境 | 檔案顯示 | 說明 |
| :--- | :--- | :--- |
| 無 plugin | folder note **正常顯示** | 無 `hideFolderNote` 概念，一律顯示。 |
| 有 plugin，`hideFolderNote: true` | folder note **隱藏** | 由 Folder Spaces 自行補掛 `.is-folder-note` class（見 §4），CSS 隱藏。 |
| 有 plugin，`hideFolderNote: false` | folder note **正常顯示** | 尊重 plugin 設定。 |
| 有 plugin，`disableFolderNote` / 排除資料夾 | 依 plugin 設定 | 該資料夾不視為有 note；不隱藏、不加底線。 |

---

## 3. 名稱底線視覺提示與點擊分流 (Underline & Click Semantics)

### 3.1 視覺呈現

- 當資料夾**具備** Folder Note 時，為該資料夾的 `.nav-folder-title-content` 加上 `has-folder-note` class（或於 `.nav-folder-title` 加上 `data-has-folder-note="true"`）。
- CSS 樣式：
  ```css
  .is-folder-space .nav-folder-title-content.has-folder-note:hover,
  .is-folder-space .nav-folder-title[data-has-folder-note="true"] .nav-folder-title-content:hover {
    text-decoration: underline;
    cursor: pointer;
  }
  ```
- 當資料夾**無** Folder Note 時，hover 維持預設，不顯示底線。

### 3.2 點擊行為總覽

| 點擊區域 | 有 Folder Note | 無 Folder Note |
| :--- | :--- | :--- |
| **Chevron 箭頭** | **一律開合** | **一律開合** |
| **Name 文字區** | **開啟 Folder Note** | • **有連動子面板**：連動子面板<br>• **無連動子面板**：**開合目錄**（原生行為） |
| **Row 背景空白處** | • **有連動子面板**：連動子面板<br>• **無連動子面板**：**就地下鑽** | • **有連動子面板**：連動子面板<br>• **無連動子面板**：**就地下鑽** |

---

## 4. 與 folder-notes 隱藏的整合 (Hide Integration)

當 `hideFolderNote: true`（且 Folder Spaces 判定該資料夾有 note）時，Folder Spaces 需自行補掛 `.is-folder-note` class 到 Folder Space 樹中的 folder note node：

- **時機**：`renderChildren` / `sort()` 渲染後，對 folder note 檔案 node 加 class（與 `updateTerminalFolderIndicators` 同週期）。
- **CSS**：沿用 folder-notes 的規則 `body.hide-folder-note .is-folder-note { display:none }`（已實測對 Folder Space 樹生效），無需新增樣式。
- **風險**：若 folder-notes 的 `body.hide-folder-note` class 未掛（例如插件未啟用），CSS 不生效，檔案正常顯示——fail-open 安全。

---

## 5. 架構與實作建議

### 5.1 新模組 `src/folder-note-compat.ts`

```typescript
export interface FolderNoteInfo {
  /** 解析出的 folder note 檔案路徑 */
  notePath: string | null;
  /** 是否確定有 note（A/B 解析成功，或 C class 出現） */
  hasNote: boolean;
  /** 是否應隱藏 folder note 檔案（follow plugin hideFolderNote） */
  shouldHide: boolean;
}

export interface FolderNoteResolverOptions {
  /** folder-notes plugin 的 settings（未安裝時為 null） */
  folderNotesSettings: unknown | null;
  /** 資料夾 title 是否帶 has-folder-note class（輔助信號） */
  hasFolderNoteClass: boolean;
}

/** 解析某資料夾的 folder note（純函數、可單元測試） */
export function resolveFolderNote(
  folder: TFolder,
  options: FolderNoteResolverOptions
): FolderNoteInfo;
```

- **純函數設計**：傳入 `folder` + `settings`，回傳 `FolderNoteInfo`；不依賴 plugin 內部函數（bundle 私有、不可存取）。
- **可單元測試**：以 mock `settings` 覆蓋 §2.2 各層級、§2.3 副檔名排序、§2.4 隱藏決策。

### 5.2 與現有程式碼的整合點

| 位置 | 變更 | 狀態 |
| :--- | :--- | :--- |
| `src/folder-note-compat.ts` | `resolveFolderNote`、`readFolderNotesSettings` | ✅ |
| `src/folder-space-explorer.ts` `updateFolderNoteIndicators`（`sort()` 後呼叫） | 補掛 `.is-folder-note` class（檔案隱藏）、掛載 `.has-folder-note` class 至 `.nav-folder-title-content`（底線提示） | 待更新 |
| `src/folder-space-explorer.ts` 點擊處理 (`handleClick`) | 依 §3.2 執行三段分流（Chevron 開合、Name 開 note/開合/連動、Row 背景下鑽/連動） | 待更新 |
| `src/main.ts` | `getFolderNotesSettings` 提供 plugin settings | ✅ |
| `styles.css` | 移除 `.folder-spaces-note-icon` 樣式，新增 `.has-folder-note:hover` 底線樣式 | 待更新 |

---

## 6. 驗收標準 (Acceptance Criteria)

1. **偵測正確性**：
   - 無 plugin：`Project` 內 `Project.md` + `Project.canvas` + `Project.txt` → folder note = `Project.md`；`Project.canvas`、`Project.txt` 正常顯示。
   - 有 plugin 且 `folderNoteName` 模板不同（如 `{{folder_name}}_note`）：依模板解析出 `Project_note.md`。
   - 有 plugin 且 `storageLocation: "outsideFolder"`：note 在資料夾外，解析正確。
2. **名稱底線與點擊分流**：
   - 有 note 的資料夾名稱在滑鼠懸停時出現底線；點擊名稱直接開啟該 folder note。
   - 點擊名稱開啟 note 時，不觸發目錄開合、不觸發下鑽、不下傳子面板。
   - 無 note 的資料夾名稱在滑鼠懸停時無底線；點擊名稱依連動狀態執行「開合」或「連動子面板」。
   - 點擊 Chevron 箭頭一律開合目錄。
   - 點擊 Row 背景空白處在無子面板時執行就地下鑽，在有子面板時執行連動。
3. **隱藏行為**：
   - 有 plugin、`hideFolderNote: true`：folder note 在 Folder Space 樹中隱藏（`.is-folder-note` 補掛生效）。
   - 有 plugin、`hideFolderNote: false`：folder note 正常顯示。
   - 無 plugin：folder note 正常顯示。
4. **品質門禁**：
   - `npm run lint` 0 error 0 warning、`npm test` 全數通過、`npm run check:project` 通過。
