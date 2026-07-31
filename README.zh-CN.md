# Folder Spaces

语言：[English](README.md) | [繁體中文](README.zh-TW.md) | 简体中文

将任意文件夹变成 Obsidian 中独立且可停靠的文件管理器工作空间。

仅支持桌面端 (Desktop only)。

## 主要功能

- **文件夹右键菜单集成**：右键点击默认文件管理器中的任意文件夹，可通过 `Folder Spaces` 菜单打开：
  - 在左侧边栏打开
  - 在右侧边栏打开
  - 在编辑区打开
  - 在新窗口打开
- **完全独立的文件夹视图**：打开专属的 Folder Space 视图标签页，完全不影响 Obsidian 原生的全库文件管理器。
- **工作区布局恢复**：重启 Obsidian 后自动恢复已打开的 Folder Space 标签页。
- **交互式 Header 工具栏**：
  - 显示当前根目录路径。
  - 点击左键或右键点击标题文字，直接调用 Obsidian **原生文件夹右键菜单 (`file-menu`)**。
  - `返回上层` 按钮 (`↑`)：快速向上导航至父文件夹。
  - `进入子文件夹` 下拉按钮 (`📥`)：快速选择并切换至子文件夹。
  - `更多选项` 按钮 (`⋮`)：触发文件夹操作菜单。
  - 重命名根文件夹时自动弹出安全重命名对话框并同步更新工作区。
- **自定义标签页图标**：提供可搜索的图标选择器，轻松设置 Folder Space 标签页图标。
- **开发者 Public API**：供第三方插件（如 Window Spaces）集成与联动。

## 使用方式

1. 打开 Obsidian 默认文件管理器。
2. 右键点击任意文件夹。
3. 选择 `Folder Spaces` 并选择打开位置（左侧边栏、右侧边栏、编辑区或新窗口）。
4. 在新打开的 Folder Space 标签页中，将该文件夹作为独立树状图进行浏览与操作。

## 设置选项

- **Folder Space 视图图标**：自定义 Folder Space 标签页所使用的图标。

## 开发者 API (Developer API)

第三方插件可通过以下方式访问 API：

```typescript
const api = app.plugins.plugins["folder-spaces"]?.api;
if (api) {
  const isFolderSpace = api.isFolderSpaceView(leaf);
  const folderPath = api.getFolderPath(leaf);
  const spaces = api.getFolderSpaces();
  await api.openFolderSpace("Projects/Active", "left-sidebar");
}
```

## 许可证

MIT
