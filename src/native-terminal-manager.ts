import { debounce, type Plugin } from "obsidian";
import { readFolderNotesSettings, type FolderNotesPluginSettings } from "./folder-note-compat.js";
import {
  type TreeItemLike,
  updateNativeFileItemsTerminalIndicators,
  clearTerminalIndicators
} from "./terminal-folder-helpers.js";

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

export interface NativeExplorerViewLike {
  containerEl?: HTMLElement;
  navFileContainerEl?: HTMLElement;
  fileItems?: Record<string, TreeItemLike | undefined>;
}

/**
 * NativeTerminalManager
 *
 * 專責在原生 File Explorer 視圖中，為空資料夾或無法展開／展開後無內容的資料夾
 * 掛載 `.is-terminal-folder` 樣式標記，將原生無效的 chevron 箭頭替換為細緻的小方點。
 */
export class NativeTerminalManager {
  private readonly observersByContainer = new Map<HTMLElement, MutationObserver>();
  private readonly debouncedUpdate = debounce(() => this.updateAll(), 50, true);

  constructor(private readonly plugin: Plugin) {}

  start(): void {
    this.plugin.app.workspace.onLayoutReady(() => {
      this.refreshObservers();
      this.debouncedUpdate();
    });

    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.refreshObservers();
        this.debouncedUpdate();
      })
    );

    this.plugin.registerEvent(this.plugin.app.vault.on("create", () => this.debouncedUpdate()));
    this.plugin.registerEvent(this.plugin.app.vault.on("delete", () => this.debouncedUpdate()));
    this.plugin.registerEvent(this.plugin.app.vault.on("rename", () => this.debouncedUpdate()));
  }

  updateAll(): void {
    const views = this.getNativeExplorerViews();
    if (views.length === 0) {
      return;
    }

    const folderNotesSettings = readFolderNotesSettings(this.plugin.app);

    for (const view of views) {
      this.updateView(view, folderNotesSettings);
    }
  }

  updateView(
    view: NativeExplorerViewLike,
    folderNotesSettings: FolderNotesPluginSettings | null = readFolderNotesSettings(this.plugin.app)
  ): void {
    if (!view.fileItems) {
      return;
    }

    updateNativeFileItemsTerminalIndicators(view.fileItems, {
      folderNotesSettings,
      app: this.plugin.app
    });
  }

  refreshObservers(): void {
    const views = this.getNativeExplorerViews();
    const currentContainers = new Set(
      views
        .map((v) => v.navFileContainerEl || v.containerEl)
        .filter((el): el is HTMLElement => el?.instanceOf(HTMLElement) ?? false)
    );

    for (const [container, observer] of this.observersByContainer) {
      if (!currentContainers.has(container)) {
        observer.disconnect();
        this.observersByContainer.delete(container);
      }
    }

    for (const container of currentContainers) {
      if (this.observersByContainer.has(container)) {
        continue;
      }

      const observer = new MutationObserver((mutations) => {
        const hasRelevant = mutations.some((m) => m.type === "childList");
        if (hasRelevant) {
          this.debouncedUpdate();
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true
      });
      this.observersByContainer.set(container, observer);
    }
  }

  destroy(): void {
    this.debouncedUpdate.cancel();
    for (const observer of this.observersByContainer.values()) {
      observer.disconnect();
    }
    this.observersByContainer.clear();

    const views = this.getNativeExplorerViews();
    for (const view of views) {
      if (view.fileItems) {
        clearTerminalIndicators(view.fileItems);
      }
    }
  }

  private getNativeExplorerViews(): NativeExplorerViewLike[] {
    const views: NativeExplorerViewLike[] = [];
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getViewState().type !== FILE_EXPLORER_VIEW_TYPE) {
        return;
      }
      const view = leaf.view as NativeExplorerViewLike;
      if (view && typeof view === "object" && Boolean(view.fileItems)) {
        views.push(view);
      }
    });
    return views;
  }
}
