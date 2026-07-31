# Folder Spaces

語言：[English](README.md) | 繁體中文 | [簡體中文](README.zh-CN.md)

將任意資料夾變成 Obsidian 中獨立且可停駐的檔案總管工作空間。

僅支援桌面端 (Desktop only)。

## 主要功能

- **資料夾右鍵選單整合**：對預設檔案總管中的任意資料夾按右鍵，即可透過 `Folder Spaces` 選單開啟：
  - 在左側邊欄開啟
  - 在右側邊欄開啟
  - 在編輯區開啟
  - 在新視窗開啟
- **完全獨立的資料夾視圖**：開啟專屬的 Folder Space 檢視頁籤，完全不影響 Obsidian 原生全庫檔案總管。
- **工作區佈局還原**：重啟 Obsidian 後自動恢復所有已開啟的 Folder Space 頁籤。
- **互動式 Header 工具列**：
  - 顯示目前根目錄路徑。
  - 對標頭文字點擊左鍵或按右鍵，直接呼叫 Obsidian **原生資料夾右鍵選單 (`file-menu`)**。
  - `返回上層` 按鈕 (`↑`)：快速向上導航至父資料夾。
  - `進入子資料夾` 下拉按鈕 (`📥`)：快速選擇並切換至子資料夾。
  - `更多選項` 按鈕 (`⋮`)：觸發資料夾動作選單。
  - 重新命名根資料夾時自動彈出安全重命名對話框並同步更新工作區。
- **自訂頁籤圖示**：提供可搜尋的圖示選擇器，輕鬆設定 Folder Space 標籤圖示。
- **開發者 Public API**：供第三方外掛（如 Window Spaces）整合與連動。

## 使用方式

1. 開啟 Obsidian 預設檔案總管。
2. 對任意資料夾按右鍵。
3. 選擇 `Folder Spaces` 並挑選開啟位置（左側邊欄、右側邊欄、編輯區或新視窗）。
4. 在新開啟的 Folder Space 頁籤中，將該資料夾作為獨立樹狀圖進行瀏覽與操作。

## 設定選項

- **Folder Space 檢視圖示**：自訂 Folder Space 頁籤所使用的圖示。

## 開發者 API (Developer API)

第三方外掛可透過以下方式存取 API：

```typescript
const api = app.plugins.plugins["folder-spaces"]?.api;
if (api) {
  const isFolderSpace = api.isFolderSpaceView(leaf);
  const folderPath = api.getFolderPath(leaf);
  const spaces = api.getFolderSpaces();
  await api.openFolderSpace("Projects/Active", "left-sidebar");
}
```

## 授權條款

MIT
