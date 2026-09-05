# Folder Spaces API 开发者文档

语言：[English](api.md) | [繁體中文](api.zh-TW.md) | **简体中文**

本文档说明 `folder-spaces` 提供给第三方 Obsidian 插件（例如 **Obsidian Window Spaces**）集成使用的公开 API。

## 访问 API

您可以从 Obsidian 的插件注册表中获取 API 实例：

```typescript
const folderSpaces = app.plugins.plugins["folder-spaces"] as { api?: FolderSpacesAPI } | undefined;
const api = folderSpaces?.api;
```

## TypeScript 类型定义

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

  /** 检查指定的 WorkspaceLeaf 或 View 是否为 Folder Space 实例 */
  isFolderSpaceView(target: unknown): boolean;

  /** 获取指定 WorkspaceLeaf 或 View 关联的文件夹路径 */
  getFolderPath(target: unknown): string | null;

  /** 获取当前工作区所有窗口与分割窗格中运行中的 Folder Space 实例 */
  getFolderSpaces(): FolderSpaceView[];

  /** 打开或切换至指定文件夹路径的 Folder Space 标签页 */
  openFolderSpace(
    folderPath: string,
    location?: "left-sidebar" | "right-sidebar" | "editor" | "window"
  ): Promise<WorkspaceLeaf | null>;
}
```

## API 方法说明

### 1. `isFolderSpaceView(target: unknown): boolean`
传入 `leaf` 或 `view` 对象，若其为 Folder Space 视图则返回 `true`，否则返回 `false`。

### 2. `getFolderPath(target: unknown): string | null`
获取指定 `leaf` 或 `view` 所设置的文件夹路径（例如 `"Projects/Active"`）；若非 Folder Space 则返回 `null`。

### 3. `getFolderSpaces(): FolderSpaceView[]`
返回当前工作区中（包含主窗口与所有弹出式窗口）所有运行中的 `FolderSpaceView` 实例数组。

### 4. `openFolderSpace(folderPath: string, location?: "left-sidebar" | "right-sidebar" | "editor" | "window"): Promise<WorkspaceLeaf | null>`
以编程式方式在指定位置（`"left-sidebar"`、`"right-sidebar"`、`"editor"` 或 `"window"`）打开指定路径 `folderPath` 的 Folder Space 标签页。返回所创建或重用的 `WorkspaceLeaf`。
