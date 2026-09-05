# Folder Spaces API 開發者文件

語言：[English](api.md) | **繁體中文** | [簡體中文](api.zh-CN.md)

本文件說明 `folder-spaces` 提供給第三方 Obsidian 外掛（例如 **Obsidian Window Spaces**）整合使用的公開 API。

## 存取 API

您可以從 Obsidian 的外掛註冊表中取得 API 實例：

```typescript
const folderSpaces = app.plugins.plugins["folder-spaces"] as { api?: FolderSpacesAPI } | undefined;
const api = folderSpaces?.api;
```

## TypeScript 型別定義

```typescript
import type { View, WorkspaceLeaf } from "obsidian";

export interface FolderSpaceView extends View {
  readonly isFolderSpace: true;
  readonly folderPath: string | null;
  getFolderPath(): string | null;
}

export interface FolderSpacesAPI {
  readonly version: string;
  readonly viewType: string;

  /** 檢查指定的 WorkspaceLeaf 或 View 是否為 Folder Space 實例 */
  isFolderSpaceView(target: unknown): boolean;

  /** 取得指定 WorkspaceLeaf 或 View 關聯的資料夾路徑 */
  getFolderPath(target: unknown): string | null;

  /** 取得目前工作空間所有視窗與分割窗格中開啟中的 Folder Space 實例 */
  getFolderSpaces(): FolderSpaceView[];

  /** 開啟或切換至指定資料夾路徑的 Folder Space 頁籤 */
  openFolderSpace(
    folderPath: string,
    location?: "left-sidebar" | "right-sidebar" | "editor" | "window"
  ): Promise<WorkspaceLeaf | null>;
}
```

## API 方法說明

### 1. `isFolderSpaceView(target: unknown): boolean`
傳入 `leaf` 或 `view` 物件，若其為 Folder Space 檢視則回傳 `true`，否則回傳 `false`。

### 2. `getFolderPath(target: unknown): string | null`
取得指定 `leaf` 或 `view` 所設定的資料夾路徑（例如 `"Projects/Active"`）；若非 Folder Space 則回傳 `null`。

### 3. `getFolderSpaces(): FolderSpaceView[]`
回傳目前工作空間中（包含主視窗與所有彈出式視窗）所有運作中的 `FolderSpaceView` 實例陣列。

### 4. `openFolderSpace(folderPath: string, location?: "left-sidebar" | "right-sidebar" | "editor" | "window"): Promise<WorkspaceLeaf | null>`
以程式化方式在指定位置（`"left-sidebar"`、`"right-sidebar"`、`"editor"` 或 `"window"`）開啟指定路徑 `folderPath` 的 Folder Space 頁籤。回傳所建立或重用的 `WorkspaceLeaf`。
