import type { App, TFolder } from "obsidian";
import type { FolderNotesPluginSettings } from "./folder-note-compat.js";
import { isNoteFileTypeSupported, resolveFolderNote } from "./folder-note-compat.js";

export interface AbstractFileLike {
  path: string;
  name?: string;
  children?: AbstractFileLike[];
  isRoot?: () => boolean;
}

export interface ElementWithClassList {
  classList: {
    toggle(cls: string, force?: boolean): boolean;
    remove(cls: string): void;
    add(cls: string): void;
    contains(cls: string): boolean;
  };
}

export interface TreeItemLike {
  file?: AbstractFileLike;
  selfEl?: ElementWithClassList;
}

export interface TerminalFolderOptions {
  folderNotesSettings?: FolderNotesPluginSettings | null;
  app?: App;
}

export function isFileSupported(file: AbstractFileLike, app?: App): boolean {
  if (file.children !== undefined) {
    return true; // 資料夾永遠支援展示
  }

  const name = file.name || file.path.split("/").pop() || "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }
  const ext = name.slice(dotIndex + 1).toLowerCase();

  return isNoteFileTypeSupported(ext, app);
}

/**
 * 判定給定資料夾在原生總管（或通用樹狀結構）下是否為端點：
 * 1. 根目錄（Root）永遠非端點
 * 2. 內部無任何子項目（children 為空）
 * 3. 若未啟用 showUnsupportedFiles，且所有內部項目均為不支援的檔案副檔名
 * 4. 若啟用 hideFolderNote，且所有可展示項目均為被隱藏的 Folder Note
 */
export function isNativeTerminalFolder(
  folder: AbstractFileLike,
  options?: TerminalFolderOptions | FolderNotesPluginSettings | null
): boolean {
  if (typeof folder.isRoot === "function" && folder.isRoot()) {
    return false;
  }

  const children = folder.children;
  if (!children || children.length === 0) {
    return true;
  }

  const folderNotesSettings =
    options && "hideFolderNote" in options
      ? (options as FolderNotesPluginSettings)
      : options && "folderNotesSettings" in options
      ? options.folderNotesSettings
      : null;
  const app = options && "app" in options ? options.app : undefined;

  // 1. 過濾出當前環境下實際支援展示的項目（資料夾或已註冊副檔名之檔案）
  const supportedChildren = children.filter((child) => isFileSupported(child, app));
  if (supportedChildren.length === 0) {
    return true;
  }

  // 2. 檢查 Folder Note：若所有可展示項目僅包含該被隱藏的 folder note
  if (folderNotesSettings) {
    const info = resolveFolderNote(folder as TFolder, {
      folderNotesSettings,
      hasFolderNoteClass: false
    });
    if (info.shouldHide && info.notePath) {
      const visibleChildren = supportedChildren.filter((child) => child.path !== info.notePath);
      if (visibleChildren.length === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 遍歷並更新 fileItems 集合中的端點標記
 */
export function updateNativeFileItemsTerminalIndicators(
  fileItems: Record<string, TreeItemLike | undefined>,
  options?: TerminalFolderOptions | FolderNotesPluginSettings | null
): void {
  for (const item of Object.values(fileItems)) {
    if (!item?.file || !item.file.children) {
      continue;
    }

    const isTerminal = isNativeTerminalFolder(item.file, options);
    item.selfEl?.classList.toggle("is-terminal-folder", isTerminal);
  }
}

/**
 * 清除所有已掛載的 .is-terminal-folder 標記
 */
export function clearTerminalIndicators(fileItems: Record<string, TreeItemLike | undefined>): void {
  for (const item of Object.values(fileItems)) {
    item?.selfEl?.classList.remove("is-terminal-folder");
  }
}
