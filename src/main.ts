import {
  Menu,
  Plugin,
  TFolder,
  View,
  type WorkspaceLeaf,
  type WorkspaceParent,
  type WorkspaceSplit
} from "obsidian";

import {
  getFolderPath,
  getFolderSpaces,
  isFolderSpaceView,
  type FolderSpaceView,
  type FolderSpacesAPI
} from "./api.js";
import { FileExplorerCompatibilityBridge } from "./file-explorer-compatibility.js";
import { t } from "./i18n.js";
import {
  FOLDER_SPACES_VIEW_TYPE,
  createFolderSpaceViewWithOptions,
  disposePanelActivityTracker,
  makeNavigable
} from "./folder-space-explorer.js";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  resolveViewMode,
  resolveViewIcon,
  type FolderSpaceViewMode,
  type FolderSpacesSettings
} from "./settings.js";
import { FolderSpacesSettingTab } from "./ui/settings-tab.js";

type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";
const LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE = "folder-spaces-flat-explorer";
const FOLDER_SPACE_INITIAL_SPLIT_RATIO = 0.34;

interface MenuItemWithSubmenu {
  setSubmenu(): Menu;
}

export default class FolderSpacesPlugin extends Plugin {
  settings: FolderSpacesSettings = DEFAULT_SETTINGS;
  api!: FolderSpacesAPI;

  override async onload(): Promise<void> {
    await this.loadSettings();
    // Remove leaves created by the previous standalone Flat Explorer view.
    this.app.workspace.detachLeavesOfType(LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE);

    this.api = {
      version: this.manifest.version,
      viewType: FOLDER_SPACES_VIEW_TYPE,
      isFolderSpaceView: (leafOrView) => isFolderSpaceView(leafOrView),
      getFolderPath: (leafOrView) => getFolderPath(leafOrView),
      getFolderSpaces: () => getFolderSpaces(this.app),
      openFolderSpace: async (folderPath, location = "left-sidebar") => {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) {
          return this.openFolderSpace(folder, location);
        }
        return null;
      }
    };

    this.registerView(
      FOLDER_SPACES_VIEW_TYPE,
      (leaf) =>
        createFolderSpaceViewWithOptions(this.app, leaf, {
          getIcon: () => this.getFolderSpaceIcon(),
          getDefaultViewMode: () => this.settings.defaultViewMode,
          getFolderViewMode: (folderPath) => this.settings.folderViewModes[folderPath] ?? null,
          setFolderViewMode: (folderPath, viewMode) => {
            void this.setFolderViewMode(folderPath, viewMode);
          }
        })
    );

    this.addSettingTab(new FolderSpacesSettingTab(this.app, this));
    this.registerFolderMenu();
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.refreshFolderSpaceNavigation();
      })
    );
    new FileExplorerCompatibilityBridge(this).start();
  }

  override onunload(): void {
    disposePanelActivityTracker(this.app.workspace);
    this.app.workspace.detachLeavesOfType(FOLDER_SPACES_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE);
  }

  getFolderSpaceIcon(): string {
    return resolveViewIcon(this.settings.viewIcon);
  }

  async updateSettings(settings: FolderSpacesSettings): Promise<void> {
    this.settings = normalizeSettings(settings);
    await this.saveData(this.settings);
    this.refreshFolderSpaces();
  }

  private async setFolderViewMode(folderPath: string, viewMode: FolderSpaceViewMode): Promise<void> {
    const normalizedPath = folderPath.trim();
    if (!normalizedPath) {
      return;
    }

    await this.updateSettings({
      ...this.settings,
      folderViewModes: {
        ...this.settings.folderViewModes,
        [normalizedPath]: resolveViewMode(viewMode)
      }
    });
  }

  private async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  private registerFolderMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file, source) => {
        if (source !== "file-explorer-context-menu" || !(file instanceof TFolder) || file.isRoot()) {
          return;
        }

        menu.addItem((item) => {
          item.setSection("view").setTitle(t("menuFolderSpaces")).setIcon("lucide-folder-tree");
          const submenu = (item as unknown as MenuItemWithSubmenu).setSubmenu();

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesLeftSidebar"))
              .setIcon("lucide-panel-left-open")
              .onClick(() => {
              void this.openFolderSpace(file, "left-sidebar");
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesRightSidebar"))
              .setIcon("lucide-panel-right-open")
              .onClick(() => {
              void this.openFolderSpace(file, "right-sidebar");
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesEditor"))
              .setIcon("lucide-panel-top")
              .onClick(() => {
              void this.openFolderSpace(file, "editor");
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesWindow"))
              .setIcon("lucide-panels-top-left")
              .onClick(() => {
              void this.openFolderSpace(file, "window");
              });
          });
        });

      })
    );
  }

  private async openFolderSpace(
    folder: TFolder,
    location: FolderSpaceLocation
  ): Promise<WorkspaceLeaf> {
    if (location === "window") {
      return this.openFolderSpaceInNewWindow(folder);
    }

    const leaf =
      this.findExistingFolderSpaceLeaf(folder.path, location) ?? this.createFolderSpaceLeaf(location);
    makeNavigable(leaf);

    if (leaf.getViewState().type !== FOLDER_SPACES_VIEW_TYPE) {
      await leaf.setViewState({
        type: FOLDER_SPACES_VIEW_TYPE,
        active: true,
        state: { folderPath: folder.path }
      });
    }

    makeNavigable(leaf);
    makeNavigable(leaf.view);

    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await this.app.workspace.requestSaveLayout();
    refreshLeafHeader(leaf);
    return leaf;
  }

  private async openFolderSpaceInNewWindow(folder: TFolder): Promise<WorkspaceLeaf> {
    const workspace = this.app.workspace;
    const existingLeaf = this.findExistingFolderSpaceLeaf(folder.path, "window");
    if (existingLeaf) {
      makeNavigable(existingLeaf);
      makeNavigable(existingLeaf.view);
      await workspace.revealLeaf(existingLeaf);
      workspace.setActiveLeaf(existingLeaf, { focus: true });
      return existingLeaf;
    }

    const folderSpaceLeaf = workspace.openPopoutLeaf();
    makeNavigable(folderSpaceLeaf);

    await folderSpaceLeaf.setViewState({
      type: FOLDER_SPACES_VIEW_TYPE,
      active: false,
      state: { folderPath: folder.path }
    });

    makeNavigable(folderSpaceLeaf);
    makeNavigable(folderSpaceLeaf.view);

    const editorLeaf = workspace.createLeafBySplit(folderSpaceLeaf, "vertical", false);
    makeNavigable(editorLeaf);
    await editorLeaf.setViewState({ type: "empty", active: true });

    scheduleInitialFolderSpaceSplitSizing(folderSpaceLeaf, editorLeaf);

    await workspace.revealLeaf(editorLeaf);
    workspace.setActiveLeaf(editorLeaf, { focus: true });
    await workspace.requestSaveLayout();
    refreshLeafHeader(folderSpaceLeaf);
    return folderSpaceLeaf;
  }

  private findExistingFolderSpaceLeaf(
    folderPath: string,
    location: FolderSpaceLocation
  ): WorkspaceLeaf | null {
    let existingLeaf: WorkspaceLeaf | null = null;

    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!isFolderSpaceLeafInLocation(leaf, location, this.app.workspace)) {
        return;
      }

      const state = leaf.getViewState();
      if (state.type === FOLDER_SPACES_VIEW_TYPE && state.state?.folderPath === folderPath) {
        // Workspace iteration follows layout order, so the last match is in
        // the last matching split when duplicate Folder Space views exist.
        existingLeaf = leaf;
      }
    });

    return existingLeaf;
  }

  private createFolderSpaceLeaf(
    location: Exclude<FolderSpaceLocation, "window">
  ): WorkspaceLeaf {
    const workspace = this.app.workspace;
    let leaf: WorkspaceLeaf;

    if (location === "editor") {
      leaf = createTabInLastSplit(workspace, workspace.rootSplit, () => workspace.getLeaf("tab"));
    } else if (location === "left-sidebar") {
      leaf = createTabInLastSplit(
        workspace,
        workspace.leftSplit,
        () => workspace.getLeftLeaf(false) ?? workspace.getLeaf("tab")
      );
    } else {
      leaf = createTabInLastSplit(
        workspace,
        workspace.rightSplit,
        () => workspace.getRightLeaf(false) ?? workspace.getLeaf("tab")
      );
    }

    makeNavigable(leaf);
    return leaf;
  }

  private refreshFolderSpaces(): void {
    const icon = this.getFolderSpaceIcon();
    for (const leaf of this.app.workspace.getLeavesOfType(FOLDER_SPACES_VIEW_TYPE)) {
      const view = leaf.view as { icon?: string };
      view.icon = icon;
      refreshLeafHeader(leaf);
    }
  }

  private refreshFolderSpaceNavigation(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOLDER_SPACES_VIEW_TYPE)) {
      makeNavigable(leaf);
      makeNavigable(leaf.view);
    }
  }
}

function createTabInLastSplit(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  root: WorkspaceParent,
  createFirstLeaf: () => WorkspaceLeaf
): WorkspaceLeaf {
  const lastLeaf = getLastLeafInRoot(workspace, root);
  return lastLeaf
    ? workspace.createLeafInParent(lastLeaf.parent as WorkspaceSplit, -1)
    : createFirstLeaf();
}

function getLastLeafInRoot(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  root: WorkspaceParent
): WorkspaceLeaf | null {
  let lastLeaf: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (leaf.getRoot() === root) {
      lastLeaf = leaf;
    }
  });
  return lastLeaf;
}

function isFolderSpaceLeafInLocation(
  leaf: WorkspaceLeaf,
  location: FolderSpaceLocation,
  workspace: FolderSpacesPlugin["app"]["workspace"]
): boolean {
  const root = leaf.getRoot();

  if (location === "left-sidebar") {
    return root === workspace.leftSplit;
  }

  if (location === "right-sidebar") {
    return root === workspace.rightSplit;
  }

  if (location === "editor") {
    return root === workspace.rootSplit;
  }

  return root !== workspace.leftSplit && root !== workspace.rightSplit && root !== workspace.rootSplit;
}

function refreshLeafHeader(leaf: WorkspaceLeaf): void {
  const leafWithHeader = leaf as WorkspaceLeaf & { updateHeader?: () => void };
  leafWithHeader.updateHeader?.();
}

function scheduleInitialFolderSpaceSplitSizing(
  folderSpaceLeaf: WorkspaceLeaf,
  editorLeaf: WorkspaceLeaf
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyInitialFolderSpaceSplitSizing(folderSpaceLeaf, editorLeaf);
    });
  });
}

function applyInitialFolderSpaceSplitSizing(
  folderSpaceLeaf: WorkspaceLeaf,
  editorLeaf: WorkspaceLeaf
): void {
  const folderSpaceContainer = getViewContainer(folderSpaceLeaf);
  const editorContainer = getViewContainer(editorLeaf);
  if (!folderSpaceContainer || !editorContainer) {
    return;
  }

  const split = folderSpaceContainer.closest<HTMLElement>(".workspace-split.mod-vertical");
  if (!split || !split.contains(editorContainer)) {
    return;
  }

  const folderSpacePane = getDirectSplitChild(split, folderSpaceContainer);
  const editorPane = getDirectSplitChild(split, editorContainer);
  if (!folderSpacePane || !editorPane || folderSpacePane === editorPane) {
    return;
  }

  folderSpacePane.style.flex = `0 0 ${FOLDER_SPACE_INITIAL_SPLIT_RATIO * 100}%`;
  editorPane.style.flex = "1 1 0%";
}

function getViewContainer(leaf: WorkspaceLeaf): HTMLElement | null {
  const view = leaf.view as View & { containerEl?: HTMLElement };
  return view.containerEl instanceof HTMLElement ? view.containerEl : null;
}

function getDirectSplitChild(split: HTMLElement, element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== split) {
    current = current.parentElement;
  }
  return current;
}

