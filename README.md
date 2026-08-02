# Folder Spaces

Turn any folder into an independent, dockable File Explorer space in Obsidian — so you can focus on one context at a time.

Language: English | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

Desktop only.

## Why Folder Spaces?

Obsidian's default File Explorer shows your entire vault at once. As a vault grows into multiple projects, topics, and archives, the explorer becomes a crowded map where every folder competes for attention — even when you only care about one.

Folder Spaces lets you detach any folder into its own scoped explorer, so you see only the context you are working on:

- 🎯 **One context at a time** — Right-click any folder and open it as an independent file tree. Unrelated folders disappear from view, leaving only the project, topic, or task you care about. You keep the benefits of a single vault (links, search, and tags across everything) while working in a visually isolated space.
- 🧹 **Flat view** — One click flattens the folder tree into a clean, single-level list. Every subfolder becomes a row labeled with its relative path, so you can scan the whole structure at a glance without drilling into nested levels.
- 🪟 **Distraction-free windows** — Open a Folder Space in its own popout window to separate a task from the main workspace's sidebars and tabs. Work in a clean window without visual noise, and keep it on a second monitor if you like.
- 📚 **Not just the File Explorer** — you can now open Obsidian's other sidebar views too — outline, backlinks, outgoing links, search, tags, properties, and more (not limited to these) — in a new/popout window, not just folder-scoped explorers.
- 🔗 **Composable with Window Spaces** — Pair Folder Spaces with [Window Spaces](https://github.com/edwardsayer/obsidian-window-spaces) to save and restore these layouts. Together, they turn Obsidian into a **single-vault, multi-project, multi-theme workspace**: one vault, many independent focus windows, each arranged around its own folder context.

## Features

- **Folder context-menu integration**: right-click any folder and open a Folder Space from the `Folder Spaces` submenu:
  - Open in default location
  - Open in left sidebar
  - Open in right sidebar
  - Open in editor area
  - Open in new window
- **Independent scoped views**: dedicated folder-scoped explorer views that never alter Obsidian's built-in full-vault File Explorer.
- **Tree & Flat view modes**: toggle between a nested tree and a clean flat list per folder; the view mode is remembered for each folder.
- **Workspace restore**: all Folder Space views are restored automatically when Obsidian restarts.
- **Interactive Header Bar**:
  - Shows the current root folder path.
  - Click the root folder title to open a searchable picker over all vault folders to switch the root — use it to navigate up to the parent folder or down into any subfolder.
  - Right-click the root folder title to trigger the full native Obsidian folder context menu (`file-menu`).
  - `View mode` button: toggle between Tree and Flat view for the current folder.
  - `Folder icon` button: set a custom icon for the current root folder (overrides the global icon).
  - `More` button (`⋮`): open folder options.
  - Safe rename modal when renaming the root folder.
- **Searchable icon picker**: customize Folder Space tab icons — a global icon in settings, or a custom icon per root folder from the header bar.
- **Quick open**: use the ribbon icon or the `Open Folder Space` command to pick a folder and open it in the default location.
- **Popout-aware opening**: run the `Open Folder Space` command or the `Folder Spaces` context-menu submenu from inside a popout window and the new Folder Space opens in that same popout window — reusing or creating a full-height left/right sidebar pane, or opening in the popout's editor area — instead of jumping back to the main window.
- **Search in the same window**: when a Folder Space lives in a popout window, the native *Search in folder* context-menu action shows its results in that same popout window rather than the main window.
- **Sidebar views in popouts** (not just the File Explorer): open any native sidebar view — Tags, Outline, Backlinks, Outgoing links, Properties, Search, and more — in a popout window, draggable between splits and tab groups.
- **Panels are never replaced**: inside a popout window, sidebar panels (backlink, outline, outgoing links, search, ...) and Folder Space explorers are never replaced by an opened note — the note opens on the previously active note tab, or as a new tab in that tab group, while unpinned note tabs keep the normal open-in-current-tab behavior.
- **Developer API**: public API for third-party plugins (e.g. Window Spaces).

## Usage

1. Open Obsidian's default File Explorer.
2. Right-click any folder.
3. Hover over `Folder Spaces` and choose where to open it: default location, left sidebar, right sidebar, editor area, or new window.
4. Browse that folder as its own file tree. Click the folder title in the header bar to switch the root via the folder picker, and toggle between Tree and Flat view.

## Use Cases & Workflows

Think of each Folder Space as a **focus room** for one project, topic, or workflow. Instead of navigating the whole vault, you step into just the folder you need:

- **Project workbench** (`Projects/<name>`): root a Folder Space at the active project. Every spec, note, and resource of that project is one tree away, while unrelated projects stay out of view.
- **Writing & content** (`Writing/`): open the writing folder in its own space — use Flat view to see all drafts and notes as a single clean list.
- **Research & literature** (`Research/`): isolate a literature or topic folder so reading notes and sources stay in one focused context.
- **Flat-structure scanning**: for deeply nested folders, switch to Flat view to see every subfolder (labeled with its relative path) and its files in one glance.
- **Distraction-free deep work**: open a Folder Space in a new window, positioned on a second monitor, to keep a task context fully separated from the main workspace.
- **Single-vault, multi-project workspace**: combine Folder Spaces with Window Spaces. Each project gets a folder-scoped explorer; Window Spaces saves each project's window arrangement, so you can switch between project "rooms" — each with its own folder context and its own theme.

## Settings

- **Folder Space icon**: choose the icon used by Folder Space tabs.
- **Default folder view**: choose the view mode (Tree or Flat) used by folders that do not have their own saved mode.
- **Default open location**: choose where new Folder Spaces appear — set separately for the main window and for popout windows (left sidebar, right sidebar, editor area, or new window).

## Compatibility

- **Obsidian version**: `v1.0.0+`
- **Platform**: Desktop only (Windows, macOS, Linux)

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
