# Folder Spaces

將任意資料夾變成 Obsidian 中獨立且可停駐的檔案總管工作空間，讓你一次專注於單一上下文。

語言：[English](README.md) | 繁體中文 | [簡體中文](README.zh-CN.md)

僅支援桌面端 (Desktop only)。

## 為什麼需要 Folder Spaces？

Obsidian 的預設檔案總管會一次顯示整個 Vault。當 Vault 成長為多個專案、主題與封存資料夾時，檔案總管會變成一張擁擠的地圖——即使你只在乎其中一個資料夾，所有資料夾仍同時爭奪你的注意力。

Folder Spaces 讓你將任意資料夾抽離成獨立的 scoped 檔案總管，只看得到目前正在處理的上下文：

- 🎯 **一次只專注一個上下文** — 對任意資料夾按右鍵，即可將其作為獨立的檔案樹開啟。無關的資料夾從視野中消失，只剩下你在乎的專案、主題或任務。你同時享有單一 Vault 的優勢（跨所有內容的連結、搜尋與標籤），又能在視覺上隔離的工作空間中專注作業。
- 🧹 **扁平檢視 (Flat View)** — 一鍵將資料夾樹壓平為乾淨的單層清單。每個子資料夾成為一個標示相對路徑的列，讓你一眼掃過整個結構，不必一層層展開。
- 🪟 **無干擾的新視窗** — 在獨立彈出視窗中開啟 Folder Space，將任務與主工作區的側邊欄、分頁區隔開來。在乾淨的視窗中作業，免除視覺干擾，也可放到副螢幕使用。
- 🔗 **與 Window Spaces 搭配** — 搭配 [Window Spaces](https://github.com/edwardsayer/obsidian-window-spaces) 保存與還原這些佈局。兩者配合可將 Obsidian 打造成 **單庫、多專案、多主題的工作空間**：一個 Vault、多個獨立的專注視窗，各自圍繞自己的資料夾上下文排列。

## 主要功能

- **資料夾右鍵選單整合**：對預設檔案總管中的任意資料夾按右鍵，即可透過 `Folder Spaces` 選單開啟：
  - 在預設位置開啟
  - 在左側邊欄開啟
  - 在右側邊欄開啟
  - 在編輯區開啟
  - 在新視窗開啟
- **完全獨立的資料夾視圖**：開啟專屬的 Folder Space 檢視頁籤，完全不影響 Obsidian 原生全庫檔案總管。
- **樹狀與扁平檢視模式**：每個資料夾可獨立切換巢狀樹狀與乾淨的扁平清單，並個別記住各資料夾的檢視模式。
- **工作區佈局還原**：重啟 Obsidian 後自動恢復所有已開啟的 Folder Space 頁籤。
- **互動式 Header 工具列**：
  - 顯示目前根目錄路徑。
  - 點擊根目錄標題，開啟可搜尋的資料夾選擇器來切換根目錄——可用來返回上層資料夾，或直接跳到任一子資料夾。
  - 對標頭文字按右鍵，呼叫 Obsidian 原生資料夾右鍵選單 (`file-menu`)。
  - `檢視模式` 按鈕：切換目前資料夾的樹狀／扁平檢視。
  - `資料夾圖示` 按鈕：為目前根資料夾設定自訂圖示（覆蓋全域圖示）。
  - `更多選項` 按鈕 (`⋮`)：觸發資料夾動作選單。
  - 重新命名根資料夾時自動彈出安全重命名對話框並同步更新工作區。
- **自訂頁籤圖示**：提供可搜尋的圖示選擇器，輕鬆設定 Folder Space 標籤圖示——可在設定中設定全域圖示，也可從 Header 工具列為每個根資料夾單獨設定圖示。
- **快速開啟**：透過側邊欄功能區圖示或 `開啟 Folder Space` 指令選擇資料夾，並在預設位置開啟。
- **Popout 視窗感知的開啟**：在 popout 視窗內執行 `開啟 Folder Space` 指令或 `Folder Spaces` 右鍵子選單時，新的 Folder Space 會在**同一個 popout 視窗**內開啟——重用或建立全高左／右側欄，或開啟在 popout 的編輯區——而不會跳回主視窗。
- **同視窗搜尋**：當 Folder Space 位於 popout 視窗時，原生 *Search in folder* 右鍵動作會在該 popout 視窗內顯示搜尋結果，而非主視窗。
- **popout 中的側邊欄 view**：在 popout 視窗內執行原生側邊欄 view 的指令（標籤、大綱、反向連結、屬性、搜尋等），會在**同一個 popout 視窗**內開啟，並可在 split／tab group 之間拖曳。
- **面板不會被取代**：在 popout 視窗中，側邊欄面板（backlink、outline、outgoing links、search 等）與 Folder Space explorer 不會被新開啟的 note 取代——note 會開在先前 active 的 note tab 上，或在其 tab group 開新 tab；未 pin 的 note tab 仍維持「開在目前 tab」的一般行為。
- **開發者 Public API**：供第三方外掛（如 Window Spaces）整合與連動。

## 使用方式

1. 開啟 Obsidian 預設檔案總管。
2. 對任意資料夾按右鍵。
3. 選擇 `Folder Spaces` 並挑選開啟位置（預設位置、左側邊欄、右側邊欄、編輯區或新視窗）。
4. 在新開啟的 Folder Space 頁籤中，將該資料夾作為獨立樹狀圖進行瀏覽與操作。點擊 Header 工具列的根目錄標題即可透過資料夾選擇器切換根目錄，並在樹狀／扁平檢視之間切換。

## 使用情境與工作流

把每個 Folder Space 視為一個**專注空間 (Focus Room)**，用於單一專案、主題或工作流程。不必在整個 Vault 中導覽，直接走進你需要的資料夾：

- **專案工作區** (`Projects/<name>`)：將 Folder Space 根目錄設為目前專案。該專案的所有規格、筆記與資源盡在一棵樹中，無關的專案完全不出現在視野中。
- **寫作與內容製作** (`Writing/`)：在自己的空間中開啟寫作資料夾——使用扁平檢視即可將所有草稿與筆記以單一乾淨清單呈現。
- **研究與文獻** (`Research/`)：將文獻或主題資料夾獨立出來，讓閱讀筆記與來源資料保持在單一專注的上下文。
- **扁平結構掃描**：對深度巢狀的資料夾，切換到扁平檢視即可一眼看到所有子資料夾（標示相對路徑）與其中的檔案。
- **無干擾的深度工作**：在新視窗中開啟 Folder Space 並置於副螢幕，讓任務上下文完全與主工作區分離。
- **單庫多專案工作空間**：將 Folder Spaces 與 Window Spaces 結合。每個專案擁有資料夾範圍的檔案總管；Window Spaces 保存每個專案的視窗排列，讓你隨意在專案「房間」之間切換——每個房間都有各自的資料夾上下文與主題。

## 設定選項

- **Folder Space 檢視圖示**：自訂 Folder Space 頁籤所使用的圖示。
- **預設資料夾檢視**：選擇尚未儲存個別模式的資料夾要使用的檢視模式（樹狀或扁平）。
- **預設開啟位置**：選擇新 Folder Space 開啟的位置——主視窗與彈出視窗可分別設定（左側邊欄、右側邊欄、編輯區或新視窗）。

## 相容性

- **Obsidian 版本**: `v1.0.0+`
- **支援平台**: 僅限桌面版 (Windows, macOS, Linux)

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
