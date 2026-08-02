import {
  Menu,
  Plugin,
  TFolder,
  View,
  setIcon,
  type App,
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
  FolderPickerModal,
  createFolderSpaceViewWithOptions,
  disposePanelActivityTracker,
  makeDockable,
  makeFolderSpaceLeafProtected,
  makeLeafUnreusable,
  makeNavigable,
  makePopoutViewsProtected
} from "./folder-space-explorer.js";
import {
  collectPopoutColumns,
  findTrueLeftSidebar,
  findTrueRightSidebar,
  getTopLevelNodeInWindow,
  getWindowOfLeaf,
  isPopoutWindow,
  pickCenterPopoutPane,
  type PopoutColumn,
  type PopoutPane
} from "./popout-sidebar.js";
import {
  DEFAULT_SETTINGS,
  getDefaultOpenLocation,
  normalizeSettings,
  resolveViewIcon,
  resolveViewMode,
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

interface FolderSpaceWindowContext {
  win: Window;
  workspace: FolderSpacesPlugin["app"]["workspace"];
  isPopout: boolean;
}

export default class FolderSpacesPlugin extends Plugin {
  settings: FolderSpacesSettings = DEFAULT_SETTINGS;
  api!: FolderSpacesAPI;
  private ribbonIconEl: HTMLElement | null = null;

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
          getFolderIcon: (folderPath) => this.getFolderSpaceIcon(folderPath),
          getDefaultViewMode: () => this.settings.defaultViewMode,
          getFolderViewMode: (folderPath) => this.settings.folderViewModes[folderPath] ?? null,
          setFolderViewMode: (folderPath, viewMode) => {
            void this.setFolderViewMode(folderPath, viewMode);
          },
          setFolderIcon: (folderPath, icon) => {
            void this.setFolderIcon(folderPath, icon);
          }
        })
    );

    this.addSettingTab(new FolderSpacesSettingTab(this.app, this));
    this.registerFolderMenu();
    this.registerOpenFolderSpaceCommand();
    this.registerOpenFolderSpaceRibbon();
    this.patchEnsureSideLeaf();
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.refreshFolderSpaceNavigation();
        makePopoutViewsProtected(this.app.workspace);
      })
    );
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        makePopoutViewsProtected(this.app.workspace);
      })
    );
    new FileExplorerCompatibilityBridge(this).start();
  }

  override onunload(): void {
    restoreEnsureSideLeaf(this.app.workspace);
    disposePanelActivityTracker(this.app.workspace);
    this.app.workspace.detachLeavesOfType(FOLDER_SPACES_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE);
  }

  getFolderSpaceIcon(folderPath?: string | null): string {
    if (folderPath) {
      const folderIcon = this.settings.folderIcons[folderPath];
      if (folderIcon) {
        return resolveViewIcon(folderIcon);
      }
    }
    return resolveViewIcon(this.settings.viewIcon);
  }

  async updateSettings(settings: FolderSpacesSettings): Promise<void> {
    this.settings = normalizeSettings(settings);
    await this.saveData(this.settings);
    this.refreshFolderSpaces();
    this.refreshRibbonIcon();
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

  private async setFolderIcon(folderPath: string, icon: string): Promise<void> {
    const normalizedPath = folderPath.trim();
    if (!normalizedPath) {
      return;
    }

    const folderIcons = { ...this.settings.folderIcons };
    const resolvedIcon = resolveViewIcon(icon);
    if (!resolvedIcon || resolvedIcon === this.getFolderSpaceIcon()) {
      delete folderIcons[normalizedPath];
    } else {
      folderIcons[normalizedPath] = resolvedIcon;
    }

    await this.updateSettings({
      ...this.settings,
      folderIcons
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
          item.setSection("view").setTitle(t("menuFolderSpaces")).setIcon(this.getFolderSpaceIcon());
          const submenu = (item as unknown as MenuItemWithSubmenu).setSubmenu();

          const context = this.getActiveWindowContext();

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesDefault"))
              .setIcon(getLocationIcon(getDefaultOpenLocation(this.settings, context.isPopout)))
              .onClick(() => {
                void this.openFolderSpace(
                  file,
                  getDefaultOpenLocation(this.settings, context.isPopout),
                  context
                );
              });
          });

          submenu.addSeparator();

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesLeftSidebar"))
              .setIcon("lucide-panel-left-open")
              .onClick(() => {
                void this.openFolderSpace(file, "left-sidebar", context);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesRightSidebar"))
              .setIcon("lucide-panel-right-open")
              .onClick(() => {
                void this.openFolderSpace(file, "right-sidebar", context);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesEditor"))
              .setIcon("lucide-panel-top")
              .onClick(() => {
                void this.openFolderSpace(file, "editor", context);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesWindow"))
              .setIcon("lucide-panels-top-left")
              .onClick(() => {
                void this.openFolderSpace(file, "window", context);
              });
          });
        });

      })
    );
  }

  private registerOpenFolderSpaceCommand(): void {
    this.addCommand({
      id: "open-folder-space",
      name: t("commandOpenFolderSpace"),
      callback: () => this.promptOpenFolderSpace()
    });
  }

  private registerOpenFolderSpaceRibbon(): void {
    const ribbonIcon = this.addRibbonIcon(this.getFolderSpaceIcon(), t("commandOpenFolderSpace"), () => {
      this.promptOpenFolderSpace();
    });
    ribbonIcon.addClass("folder-spaces-ribbon");
    this.ribbonIconEl = ribbonIcon;
  }

  private refreshRibbonIcon(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.empty();
      setIcon(this.ribbonIconEl, this.getFolderSpaceIcon());
    }
  }

  private promptOpenFolderSpace(): void {
    const context = this.getActiveWindowContext();
    new FolderPickerModal(this.app, (folder) => {
      void this.openFolderSpace(
        folder,
        getDefaultOpenLocation(this.settings, context.isPopout),
        context
      );
    }).open();
  }

  private getActiveWindowContext(): FolderSpaceWindowContext {
    const win = typeof activeWindow !== "undefined" ? activeWindow : window;
    return {
      win,
      workspace: this.app.workspace,
      isPopout: isPopoutWindow(win)
    };
  }

  /**
   * All native sidebar views (tag, outline, backlink, properties, search, ...)
   * open through `Workspace.ensureSideLeaf`, which always targets the main
   * window's left/right sidebar. Patch it once so that when such a command is
   * executed inside a popout window, the view opens in that popout window
   * following the same mechanism Folder Spaces uses, instead of jumping back
   * to the main window.
   */
  private patchEnsureSideLeaf(): void {
    const workspace = this.app.workspace;
    const original = workspace.ensureSideLeaf.bind(workspace);

    const patched = (
      viewType: string,
      side: "left" | "right",
      options?: { active?: boolean; split?: boolean; reveal?: boolean; state?: Record<string, unknown> }
    ): Promise<WorkspaceLeaf> => {
      const win = typeof activeWindow !== "undefined" ? activeWindow : window;
      if (isPopoutWindow(win)) {
        return openSidebarViewInPopout(workspace, viewType, side, options ?? {}, win);
      }
      return original(viewType, side, options);
    };

    storeEnsureSideLeafOriginal(workspace, original);
    (workspace as unknown as { ensureSideLeaf: typeof patched }).ensureSideLeaf = patched;
  }

  private async openFolderSpace(
    folder: TFolder,
    location: FolderSpaceLocation,
    context?: FolderSpaceWindowContext
  ): Promise<WorkspaceLeaf> {
    if (location === "window") {
      return this.openFolderSpaceInNewWindow(folder);
    }

    const ctx = context ?? this.getActiveWindowContext();

    if (ctx.isPopout && ctx.win) {
      return this.openFolderSpaceInPopout(folder, location, ctx);
    }

    const leaf =
      this.findExistingFolderSpaceLeaf(folder.path, location, ctx) ??
      this.createFolderSpaceLeaf(location, ctx);
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

    await ctx.workspace.revealLeaf(leaf);
    ctx.workspace.setActiveLeaf(leaf, { focus: true });
    await ctx.workspace.requestSaveLayout();
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
    location: FolderSpaceLocation,
    context?: FolderSpaceWindowContext
  ): WorkspaceLeaf | null {
    let existingLeaf: WorkspaceLeaf | null = null;
    const workspace = context?.workspace ?? this.app.workspace;

    workspace.iterateAllLeaves((leaf) => {
      if (!isFolderSpaceLeafInLocation(leaf, location, workspace)) {
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
    location: Exclude<FolderSpaceLocation, "window">,
    context?: FolderSpaceWindowContext
  ): WorkspaceLeaf {
    const workspace = context?.workspace ?? this.app.workspace;
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

  /**
   * Obsidian popout windows have no native left/right sidebar. When a Folder
   * Space is opened from a popout window context (command or context-menu
   * submenu), route the new view into that same popout window: reuse an
   * existing full-height sidebar pane as the left/right sidebar equivalent,
   * or create one from the popout's root split when it does not exist yet.
   * Editor location opens in the popout's central editor area.
   */
  private async openFolderSpaceInPopout(
    folder: TFolder,
    location: Exclude<FolderSpaceLocation, "window">,
    context: FolderSpaceWindowContext
  ): Promise<WorkspaceLeaf> {
    const workspace = context.workspace;
    const win = context.win;
    const columns = collectPopoutColumns(win, workspace);

    if (location === "left-sidebar" || location === "right-sidebar") {
      const sidebar =
        location === "left-sidebar"
          ? findTrueLeftSidebar(win, columns)
          : findTrueRightSidebar(win, columns);

      if (sidebar) {
        return this.openFolderSpaceInTabs(sidebar.tabs, folder, context);
      }

      let editorLeaf = getActiveLeafInWindow(workspace, win) ?? getLastLeafInWindow(workspace, win);
      if (editorLeaf && isFolderSpaceLeaf(editorLeaf)) {
        let otherLeaf: WorkspaceLeaf | null = null;
        workspace.iterateAllLeaves((leaf) => {
          if (!otherLeaf && getWindowOfLeaf(leaf) === win && !isFolderSpaceLeaf(leaf)) {
            otherLeaf = leaf;
          }
        });
        if (otherLeaf) {
          editorLeaf = otherLeaf;
        }
      }

      if (!editorLeaf) {
        return this.openFolderSpaceInPopoutEditor(folder, context, columns);
      }

      const targetNode = getTopLevelNodeInWindow(editorLeaf) || editorLeaf;
      const isParentNode =
        targetNode !== editorLeaf &&
        Boolean((targetNode as unknown as { children?: unknown }).children);
      const before = location === "left-sidebar" ? !isParentNode : isParentNode;

      const panelLeaf = workspace.createLeafBySplit(targetNode as unknown as WorkspaceLeaf, "vertical", before);
      makeNavigable(panelLeaf);

      await panelLeaf.setViewState({
        type: FOLDER_SPACES_VIEW_TYPE,
        active: false,
        state: { folderPath: folder.path }
      });

      makeNavigable(panelLeaf);
      makeNavigable(panelLeaf.view);
      scheduleInitialFolderSpaceSplitSizing(panelLeaf, editorLeaf);

      await workspace.revealLeaf(panelLeaf);
      workspace.setActiveLeaf(panelLeaf, { focus: true });
      await workspace.requestSaveLayout();
      refreshLeafHeader(panelLeaf);
      return panelLeaf;
    }

    return this.openFolderSpaceInPopoutEditor(folder, context, columns);
  }

  private async openFolderSpaceInTabs(
    tabs: WorkspaceParent | null | undefined,
    folder: TFolder,
    context: FolderSpaceWindowContext
  ): Promise<WorkspaceLeaf> {
    const workspace = context.workspace;

    const existing = findFolderSpaceInTabs(tabs, folder.path);
    if (existing) {
      makeNavigable(existing);
      makeNavigable(existing.view);
      await workspace.revealLeaf(existing);
      workspace.setActiveLeaf(existing, { focus: true });
      await workspace.requestSaveLayout();
      return existing;
    }

    if (!tabs) {
      const fallback = workspace.getLeaf("tab");
      makeNavigable(fallback);
      await fallback.setViewState({
        type: FOLDER_SPACES_VIEW_TYPE,
        active: true,
        state: { folderPath: folder.path }
      });
      makeNavigable(fallback);
      makeNavigable(fallback.view);
      await workspace.revealLeaf(fallback);
      workspace.setActiveLeaf(fallback, { focus: true });
      await workspace.requestSaveLayout();
      refreshLeafHeader(fallback);
      return fallback;
    }

    const children = ((tabs as unknown as { children?: WorkspaceLeaf[] })?.children ?? []) as WorkspaceLeaf[];
    const leaf = workspace.createLeafInParent(tabs as unknown as WorkspaceSplit, children.length);
    makeNavigable(leaf);

    await leaf.setViewState({
      type: FOLDER_SPACES_VIEW_TYPE,
      active: true,
      state: { folderPath: folder.path }
    });

    makeNavigable(leaf);
    makeNavigable(leaf.view);
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    await workspace.requestSaveLayout();
    refreshLeafHeader(leaf);
    return leaf;
  }

  private async openFolderSpaceInPopoutEditor(
    folder: TFolder,
    context: FolderSpaceWindowContext,
    columns?: PopoutColumn[]
  ): Promise<WorkspaceLeaf> {
    const workspace = context.workspace;
    const win = context.win;
    const resolvedColumns = columns ?? collectPopoutColumns(win, workspace);

    const existing = this.findFolderSpaceInPopoutEditor(folder.path, win, workspace, resolvedColumns);
    if (existing) {
      makeNavigable(existing);
      makeNavigable(existing.view);
      await workspace.revealLeaf(existing);
      workspace.setActiveLeaf(existing, { focus: true });
      await workspace.requestSaveLayout();
      return existing;
    }

    const allPanes = resolvedColumns.reduce((acc, col) => acc.concat(col.panes), [] as PopoutPane[]);
    const targetPane = pickCenterPopoutPane(allPanes, win);
    if (targetPane) {
      return this.openFolderSpaceInTabs(targetPane.tabs, folder, context);
    }

    const baseLeaf = getActiveLeafInWindow(workspace, win) ?? getLastLeafInWindow(workspace, win);
    return this.openFolderSpaceInTabs(baseLeaf?.parent, folder, context);
  }

  private findFolderSpaceInPopoutEditor(
    folderPath: string,
    win: Window,
    workspace: FolderSpacesPlugin["app"]["workspace"],
    columns: PopoutColumn[]
  ): WorkspaceLeaf | null {
    const leftSidebar = findTrueLeftSidebar(win, columns);
    const rightSidebar = findTrueRightSidebar(win, columns);
    const sidebarTabs = new Set<WorkspaceParent>([
      leftSidebar?.tabs,
      rightSidebar?.tabs
    ].filter((tabs): tabs is WorkspaceParent => Boolean(tabs)));

    let found: WorkspaceLeaf | null = null;
    workspace.iterateAllLeaves((leaf) => {
      if (found || !leaf.parent) {
        return;
      }
      if (getWindowOfLeaf(leaf) !== win || sidebarTabs.has(leaf.parent)) {
        return;
      }
      const state = leaf.getViewState();
      if (state.type === FOLDER_SPACES_VIEW_TYPE && state.state?.folderPath === folderPath) {
        found = leaf;
      }
    });
    return found;
  }

  private refreshFolderSpaces(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOLDER_SPACES_VIEW_TYPE)) {
      const view = leaf.view as View & { folderPath?: string | null; folderIconButtonEl?: HTMLElement };
      const folderPath = view.folderPath ?? null;
      const icon = this.getFolderSpaceIcon(folderPath);
      view.icon = icon;
      refreshLeafHeader(leaf);
      if (view.folderIconButtonEl) {
        view.folderIconButtonEl.empty();
        setIcon(view.folderIconButtonEl, icon);
      }
    }
  }

  private refreshFolderSpaceNavigation(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOLDER_SPACES_VIEW_TYPE)) {
      makeFolderSpaceLeafProtected(leaf);
      makeNavigable(leaf.view);
    }
  }
}

const ensureSideLeafOriginals = new WeakMap<App["workspace"], App["workspace"]["ensureSideLeaf"]>();

function storeEnsureSideLeafOriginal(
  workspace: App["workspace"],
  original: App["workspace"]["ensureSideLeaf"]
): void {
  if (!ensureSideLeafOriginals.has(workspace)) {
    ensureSideLeafOriginals.set(workspace, original);
  }
}

function restoreEnsureSideLeaf(workspace: App["workspace"]): void {
  const original = ensureSideLeafOriginals.get(workspace);
  if (original) {
    (workspace as unknown as { ensureSideLeaf: App["workspace"]["ensureSideLeaf"] }).ensureSideLeaf = original;
    ensureSideLeafOriginals.delete(workspace);
  }
}

/**
 * Opens a native sidebar view (search, tag, outline, backlink, ...) inside a
 * popout window, mirroring the Folder Space mechanism: reuse an existing leaf
 * of that type in the window, reuse or create a full-height left/right sidebar
 * pane, or fall back to the editor area. The view is made dockable so it can
 * be dragged between splits/tab groups.
 */
async function openSidebarViewInPopout(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  viewType: string,
  side: "left" | "right",
  options: { active?: boolean; split?: boolean; reveal?: boolean; state?: Record<string, unknown> },
  win: Window
): Promise<WorkspaceLeaf> {
  const reveal = options.reveal !== false;

  const existing = workspace.getLeavesOfType(viewType).find((leaf) => getWindowOfLeaf(leaf) === win) ?? null;
  if (existing) {
    if (options.state) {
      await existing.setViewState({ type: viewType, state: options.state });
    }
    await existing.loadIfDeferred();
    if (existing.view) {
      makeDockable(existing.view);
    }
    makeLeafUnreusable(existing);
    if (reveal) {
      await workspace.revealLeaf(existing);
    }
    if (options.active) {
      workspace.setActiveLeaf(existing, { focus: true });
    }
    return existing;
  }

  const columns = collectPopoutColumns(win, workspace);
  const sidebar = side === "left" ? findTrueLeftSidebar(win, columns) : findTrueRightSidebar(win, columns);

  let leaf: WorkspaceLeaf;

  if (sidebar) {
    leaf = await openViewInTabs(workspace, sidebar.tabs, viewType, options.state);
  } else {
    const editorLeaf = getActiveLeafInWindow(workspace, win) ?? getLastLeafInWindow(workspace, win);
    if (editorLeaf) {
      const targetNode = getTopLevelNodeInWindow(editorLeaf) || editorLeaf;
      const isParentNode =
        targetNode !== editorLeaf &&
        Boolean((targetNode as unknown as { children?: unknown }).children);
      const before = side === "left" ? !isParentNode : isParentNode;
      leaf = workspace.createLeafBySplit(targetNode as unknown as WorkspaceLeaf, "vertical", before);
      makeNavigable(leaf);
      await leaf.setViewState({ type: viewType, active: false, state: options.state });
      scheduleInitialFolderSpaceSplitSizing(leaf, editorLeaf);
    } else {
      leaf = workspace.getLeaf("tab");
      makeNavigable(leaf);
      await leaf.setViewState({ type: viewType, active: false, state: options.state });
    }
  }

  makeNavigable(leaf);
  makeNavigable(leaf.view);
  await leaf.loadIfDeferred();
  if (leaf.view) {
    makeDockable(leaf.view);
  }
  makeLeafUnreusable(leaf);
  if (reveal) {
    await workspace.revealLeaf(leaf);
  }
  if (options.active) {
    workspace.setActiveLeaf(leaf, { focus: true });
  }
  await workspace.requestSaveLayout();
  return leaf;
}

async function openViewInTabs(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  tabs: WorkspaceParent | null | undefined,
  viewType: string,
  state: Record<string, unknown> | undefined
): Promise<WorkspaceLeaf> {
  const children = ((tabs as unknown as { children?: WorkspaceLeaf[] })?.children ?? []) as WorkspaceLeaf[];
  const leaf = workspace.createLeafInParent(tabs as unknown as WorkspaceSplit, children.length);
  makeNavigable(leaf);
  await leaf.setViewState({ type: viewType, active: true, state });
  makeNavigable(leaf);
  makeNavigable(leaf.view);
  return leaf;
}

function getActiveLeafInWindow(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  win: Window
): WorkspaceLeaf | null {
  const activeLeaf =
    typeof workspace.getMostRecentLeaf === "function"
      ? workspace.getMostRecentLeaf()
      : workspace.activeLeaf;
  return activeLeaf && getWindowOfLeaf(activeLeaf) === win ? activeLeaf : null;
}

function getLastLeafInWindow(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  win: Window
): WorkspaceLeaf | null {
  let lastLeaf: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (getWindowOfLeaf(leaf) === win) {
      lastLeaf = leaf;
    }
  });
  return lastLeaf;
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

function isFolderSpaceLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.getViewState().type === FOLDER_SPACES_VIEW_TYPE;
}

function findFolderSpaceInTabs(
  tabs: WorkspaceParent | null | undefined,
  folderPath: string
): WorkspaceLeaf | null {
  const children = ((tabs as unknown as { children?: WorkspaceLeaf[] })?.children ?? []) as WorkspaceLeaf[];
  for (const leaf of children) {
    const state = leaf.getViewState();
    if (state.type === FOLDER_SPACES_VIEW_TYPE && state.state?.folderPath === folderPath) {
      return leaf;
    }
  }
  return null;
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

function getLocationIcon(location: FolderSpaceLocation): string {
  switch (location) {
    case "left-sidebar":
      return "lucide-panel-left-open";
    case "right-sidebar":
      return "lucide-panel-right-open";
    case "editor":
      return "lucide-panel-top";
    case "window":
      return "lucide-panels-top-left";
  }
}

