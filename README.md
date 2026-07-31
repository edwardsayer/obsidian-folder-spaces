# Folder Spaces

Language: English | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

Turn any folder into an independent, dockable File Explorer space in Obsidian.

Desktop only.

## Features

- Adds **Folder Spaces** submenu to folder context menus in Obsidian's default File Explorer with 4 opening options:
  - Open in left sidebar
  - Open in right sidebar
  - Open in editor area
  - Open in new window
- Opens dedicated folder-scoped explorer views without altering Obsidian's built-in full-vault File Explorer.
- Restores all Folder Space views upon restarting Obsidian.
- **Interactive Header Bar**:
  - Displays the current root folder path.
  - Left-click or right-click the root folder title to trigger the full native Obsidian folder context menu (`file-menu`).
  - `Up` button (`↑`): navigate to parent folder.
  - `Subfolder` dropdown button (`📥`): pick a subfolder to root into directly.
  - `More` button (`⋮`): open folder options.
  - Custom folder rename modal when renaming root folders.
- Searchable icon picker to customize Folder Space tab icons.
- Developer API for third-party plugin integration (e.g. Window Spaces).

## Usage

1. Open Obsidian's default File Explorer.
2. Right-click any folder.
3. Hover over `Folder Spaces` and select your target location (left sidebar, right sidebar, editor area, or new window).
4. Use the new Folder Space tab to browse that folder as its own file tree.

## Settings

- **Folder Space icon**: Choose the icon used by Folder Space tabs.

## Developer API

Third-party plugins can access the public API via:

```typescript
const api = app.plugins.plugins["folder-spaces"]?.api;
if (api) {
  const isFolderSpace = api.isFolderSpaceView(leaf);
  const folderPath = api.getFolderPath(leaf);
  const spaces = api.getFolderSpaces();
  await api.openFolderSpace("Projects/Active", "left-sidebar");
}
```

## License

MIT
