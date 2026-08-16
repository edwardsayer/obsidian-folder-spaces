import {
  Menu,
  Plugin,
  TAbstractFile,
  TFolder,
  View,
  setIcon,
  type WorkspaceLeaf,
  type WorkspaceParent,
  type WorkspaceSplit
} from "obsidian";

import {
  getFolderPath,
  getFolderSpaces,
  isFolderSpaceView,
  type FolderSpacesAPI
} from "./api.js";
import { FileExplorerCompatibilityBridge } from "./file-explorer-compatibility.js";
import { t } from "./i18n.js";
import {
  FOLDER_SPACES_VIEW_TYPE,
  FolderPickerModal,
  createFolderSpaceViewWithOptions,
  disposePanelActivityTracker,
  makeFolderSpaceLeafProtected,
  makeNavigable,
  makePopoutViewsProtected,
  resolveClickedFolderPath,
  updateFolderSpaceLeafTooltip
} from "./folder-space-explorer.js";
import { PanelBindingManager, generatePanelId, type PanelBindingView } from "./panel-binding.js";
import { findExistingFolderSpace, type FolderSpaceScopeCandidate } from "./folder-space-routing-policy.js";
import {
  getWindowOfLeaf,
  isPopoutWindow,
  PopoutLayoutEngine
} from "./shared/popoutLayout.js";
import {
  acquirePopoutLayoutEngine,
  releasePopoutLayoutEngine,
  type PopoutLayoutEngineWithWindow
} from "./shared/popoutLayoutRegistry.js";
import {
  acquireWorkspaceInterceptor,
  releaseWorkspaceInterceptor
} from "./shared/workspaceInterceptor.js";
import {
  SHARED_API_VERSION,
  SHARED_COMPATIBLE_FROM_VERSION,
  SHARED_IMPLEMENTATION_REVISION
} from "./shared/sharedVersion.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_VIEW_ICON,
  getDefaultFollowParent,
  getDefaultOpenLocation,
  normalizeSettings,
  resolveViewIcon,
  resolveViewMode,
  resolveDepthMode,
  resolveContentMode,
  type FolderSpaceViewMode,
  type FolderSpaceDepthMode,
  type FolderSpaceContentMode,
  type FolderSpacesSettings
} from "./settings.js";
import { FolderSpacesSettingTab } from "./ui/settings-tab.js";

type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";
const LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE = "folder-spaces-flat-explorer";
const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

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
  private readonly panelBindingManager = new PanelBindingManager();
  private readonly nativeExplorerBindings = new Map<WorkspaceLeaf, NativeExplorerBinding>();
  private activeContextSourceLeaf: WorkspaceLeaf | null = null;
  private popoutLayout!: PopoutLayoutEngineWithWindow;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.popoutLayout = acquirePopoutLayoutEngine({
      id: "folder-spaces",
      apiVersion: SHARED_API_VERSION,
      compatibleFrom: SHARED_COMPATIBLE_FROM_VERSION,
      implementationRevision: SHARED_IMPLEMENTATION_REVISION,
      create: () => new PopoutLayoutEngine(this.app)
    });
    // Remove leaves created by the previous standalone Flat Explorer view.
    this.app.workspace.detachLeavesOfType(LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE);

    this.api = {
      version: this.manifest.version,
      viewType: FOLDER_SPACES_VIEW_TYPE,
      isFolderSpaceView: (leafOrView) => isFolderSpaceView(leafOrView),
      getFolderPath: (leafOrView) => getFolderPath(leafOrView),
      getFolderSpaces: () => getFolderSpaces(this.app),
      openFolderSpace: async (folderPath, location = "left-sidebar") => {
        const folder =
          folderPath === ""
            ? this.app.vault.getRoot()
            : this.app.vault.getAbstractFileByPath(folderPath);
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
          getDefaultDepthMode: () => this.settings.defaultDepthMode,
          getFolderDepthMode: (folderPath) => this.settings.folderDepthModes[folderPath] ?? null,
          setFolderDepthMode: (folderPath, depthMode) => {
            void this.setFolderDepthMode(folderPath, depthMode);
          },
          getDefaultContentMode: () => this.settings.defaultContentMode,
          getFolderContentMode: (folderPath) => this.settings.folderContentModes[folderPath] ?? null,
          setFolderContentMode: (folderPath, contentMode) => {
            void this.setFolderContentMode(folderPath, contentMode);
          },
          setFolderIcon: (folderPath, icon) => {
            void this.setFolderIcon(folderPath, icon);
          },
          bindingManager: this.panelBindingManager,
          popoutLayoutEngine: this.popoutLayout,
          openSearchInWindow: (win, query) => this.openSearchInWindow(win, query),
          onContextMenuOpen: (sourceLeaf) => {
            this.activeContextSourceLeaf = sourceLeaf;
          }
        })
    );

    this.addSettingTab(new FolderSpacesSettingTab(this.app, this));
    this.registerFolderMenu();
    this.registerOpenFolderSpaceCommand();
    this.refreshRibbonIcon();
    acquireWorkspaceInterceptor(this.app, {
      id: "folder-spaces",
      engine: this.popoutLayout,
      isManagedWindow: (win) => isPopoutWindow(win)
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.refreshFolderSpaceNavigation();
        makePopoutViewsProtected(this.app.workspace);
        this.reconcileFolderSpaceBindings();
      })
    );
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        makePopoutViewsProtected(this.app.workspace);
        this.reconcileFolderSpaceBindings();
      })
    );
    new FileExplorerCompatibilityBridge(this).start();
  }

  override onunload(): void {
    releaseWorkspaceInterceptor("folder-spaces");
    disposePanelActivityTracker(this.app.workspace);
    this.panelBindingManager.clear();
    this.app.workspace.detachLeavesOfType(FOLDER_SPACES_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(LEGACY_FLAT_FILE_EXPLORER_VIEW_TYPE);
    releasePopoutLayoutEngine("folder-spaces");
  }

  getFolderSpaceIcon(folderPath?: string | null): string {
    if (typeof folderPath === "string") {
      const folderIcon = this.settings.folderIcons[folderPath];
      if (folderIcon) {
        return resolveViewIcon(folderIcon);
      }
    }
    return DEFAULT_VIEW_ICON;
  }

  async updateSettings(settings: FolderSpacesSettings): Promise<void> {
    this.settings = normalizeSettings(settings);
    await this.saveData(this.settings);
    this.refreshFolderSpaces();
    this.refreshRibbonIcon();
  }

  private async setFolderViewMode(folderPath: string, viewMode: FolderSpaceViewMode): Promise<void> {
    const normalizedPath = typeof folderPath === "string" ? folderPath.trim() : null;
    if (normalizedPath === null) {
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

  private async setFolderDepthMode(folderPath: string, depthMode: FolderSpaceDepthMode): Promise<void> {
    const normalizedPath = typeof folderPath === "string" ? folderPath.trim() : null;
    if (normalizedPath === null) {
      return;
    }

    await this.updateSettings({
      ...this.settings,
      folderDepthModes: {
        ...this.settings.folderDepthModes,
        [normalizedPath]: resolveDepthMode(depthMode)
      }
    });
  }

  private async setFolderContentMode(folderPath: string, contentMode: FolderSpaceContentMode): Promise<void> {
    const normalizedPath = typeof folderPath === "string" ? folderPath.trim() : null;
    if (normalizedPath === null) {
      return;
    }

    await this.updateSettings({
      ...this.settings,
      folderContentModes: {
        ...this.settings.folderContentModes,
        [normalizedPath]: resolveContentMode(contentMode)
      }
    });
  }

  private async setFolderIcon(folderPath: string, icon: string): Promise<void> {
    const normalizedPath = typeof folderPath === "string" ? folderPath.trim() : null;
    if (normalizedPath === null) {
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
      this.app.workspace.on("file-menu", (menu: Menu, file, source, leaf) => {
        if (source !== "file-explorer-context-menu" || !(file instanceof TFolder)) {
          return;
        }

        const parentPanelId = this.getContextParentPanelId(leaf ?? this.activeContextSourceLeaf);

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
                  context,
                  parentPanelId
                );
              });
          });

          submenu.addSeparator();

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesLeftSidebar"))
              .setIcon("lucide-panel-left-open")
              .onClick(() => {
                void this.openFolderSpace(file, "left-sidebar", context, parentPanelId);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesRightSidebar"))
              .setIcon("lucide-panel-right-open")
              .onClick(() => {
                void this.openFolderSpace(file, "right-sidebar", context, parentPanelId);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesEditor"))
              .setIcon("lucide-panel-top")
              .onClick(() => {
                void this.openFolderSpace(file, "editor", context, parentPanelId);
              });
          });

          submenu.addItem((submenuItem) => {
            submenuItem
              .setTitle(t("menuFolderSpacesWindow"))
              .setIcon("lucide-panels-top-left")
              .onClick(() => {
                void this.openFolderSpace(file, "window", context, parentPanelId);
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
    if (this.ribbonIconEl) {
      return;
    }
    const ribbonIcon = this.addRibbonIcon(this.getFolderSpaceIcon(), t("commandOpenFolderSpace"), () => {
      this.promptOpenFolderSpace();
    });
    ribbonIcon.addClass("folder-spaces-ribbon");
    this.ribbonIconEl = ribbonIcon;
  }

  private refreshRibbonIcon(): void {
    if (this.settings.showRibbonIcon) {
      if (!this.ribbonIconEl) {
        this.registerOpenFolderSpaceRibbon();
      } else {
        this.ribbonIconEl.empty();
        setIcon(this.ribbonIconEl, this.getFolderSpaceIcon());
      }
      return;
    }

    if (this.ribbonIconEl) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
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

  private async openFolderSpace(
    folder: TFolder,
    location: FolderSpaceLocation,
    context?: FolderSpaceWindowContext,
    parentPanelId?: string | null
  ): Promise<WorkspaceLeaf> {
    if (location === "window") {
      return this.openFolderSpaceInNewWindow(folder, parentPanelId ?? null);
    }

    const ctx = context ?? this.getActiveWindowContext();

    if (ctx.isPopout && ctx.win) {
      return this.openFolderSpaceInPopout(folder, location, ctx, parentPanelId ?? null);
    }

    const existingLeaf = this.findExistingFolderSpaceLeaf(folder.path, location, ctx);
    if (existingLeaf) {
      makeNavigable(existingLeaf);
      makeNavigable(existingLeaf.view);
      this.applyChildBinding(parentPanelId ?? null, existingLeaf);
      await ctx.workspace.revealLeaf(existingLeaf);
      ctx.workspace.setActiveLeaf(existingLeaf, { focus: true });
      await ctx.workspace.requestSaveLayout();
      return existingLeaf;
    }

    const leaf = this.createFolderSpaceLeaf(location, ctx);
    makeNavigable(leaf);

    if (leaf.getViewState().type !== FOLDER_SPACES_VIEW_TYPE) {
      await leaf.setViewState({
        type: FOLDER_SPACES_VIEW_TYPE,
        active: true,
        state: {
          folderPath: folder.path,
          followParent: getDefaultFollowParent(this.settings, false)
        }
      });
    }

    makeNavigable(leaf);
    makeNavigable(leaf.view);

    await ctx.workspace.revealLeaf(leaf);
    ctx.workspace.setActiveLeaf(leaf, { focus: true });
    await ctx.workspace.requestSaveLayout();
    // Bind before refreshing the header so a header update error can never
    // prevent the binding from being established.
    this.applyChildBinding(parentPanelId ?? null, leaf);
    refreshLeafHeader(leaf);
    return leaf;
  }

  private async openFolderSpaceInNewWindow(
    folder: TFolder,
    parentPanelId?: string | null
  ): Promise<WorkspaceLeaf> {
    const workspace = this.app.workspace;
    const existingLeaf = this.findExistingFolderSpaceLeaf(folder.path, "window");
    if (existingLeaf) {
      makeNavigable(existingLeaf);
      makeNavigable(existingLeaf.view);
      this.applyChildBinding(parentPanelId ?? null, existingLeaf);
      await workspace.revealLeaf(existingLeaf);
      workspace.setActiveLeaf(existingLeaf, { focus: true });
      return existingLeaf;
    }

    // 統一由 shared 開新 popout：Window Spaces 存在時會初始化 activity bars /
    // 側欄；無 provider 時僅原生開窗 + 初始 empty tab（不建額外 empty editor）。
    const result = await this.popoutLayout.openNewPopoutWindow();
    if (!result) {
      throw new Error("Unable to open a new popout window");
    }
    const { win } = result;

    // 放置規則：左側欄 → 右側欄 → content area（依 Window Spaces 的側欄可用性；
    // 無 Window Spaces 時 getSidebarSides 為 undefined → content area）。
    const sides = this.popoutLayout.getSidebarSides(win);
    const location = sides?.left
      ? ("left" as const)
      : sides?.right
        ? ("right" as const)
        : ("tab" as const);

    const folderSpaceLeaf = await this.popoutLayout.openPanel(win, location, FOLDER_SPACES_VIEW_TYPE);
    makeNavigable(folderSpaceLeaf);
    await folderSpaceLeaf.setViewState({
      type: FOLDER_SPACES_VIEW_TYPE,
      active: true,
      state: {
        folderPath: folder.path,
        followParent: getDefaultFollowParent(this.settings, true)
      }
    });
    makeNavigable(folderSpaceLeaf.view);

    await workspace.revealLeaf(folderSpaceLeaf);
    workspace.setActiveLeaf(folderSpaceLeaf, { focus: true });
    await workspace.requestSaveLayout();
    refreshLeafHeader(folderSpaceLeaf);
    this.applyChildBinding(parentPanelId ?? null, folderSpaceLeaf);
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
   * Opens a Folder Space in the current Popout while keeping Folder Spaces'
   * path uniqueness and binding rules outside the shared layout engine.
   */
  private async openFolderSpaceInPopout(
    folder: TFolder,
    location: Exclude<FolderSpaceLocation, "window">,
    context: FolderSpaceWindowContext,
    parentPanelId?: string | null
  ): Promise<WorkspaceLeaf> {
    const workspace = context.workspace;
    const win = context.win;
    const existing = this.findExistingFolderSpaceInPopout(folder.path, location, win);

    if (existing) {
      makeNavigable(existing);
      makeNavigable(existing.view);
      if (location === "left-sidebar" || location === "right-sidebar") {
        markPopoutSidebarColumn(existing);
      }
      this.applyChildBinding(parentPanelId ?? null, existing);
      await workspace.revealLeaf(existing);
      workspace.setActiveLeaf(existing, { focus: true });
      await workspace.requestSaveLayout();
      return existing;
    }

    const leaf =
      location === "left-sidebar" || location === "right-sidebar"
        ? await this.popoutLayout.openSideLeaf(
            win,
            location === "left-sidebar" ? "left" : "right"
          )
        : await this.popoutLayout.openPanel(win, "tab", "empty");

    if (location === "left-sidebar" || location === "right-sidebar") {
      markPopoutSidebarColumn(leaf);
    }

    makeNavigable(leaf);
    await leaf.setViewState({
      type: FOLDER_SPACES_VIEW_TYPE,
      active: true,
      state: {
        folderPath: folder.path,
        followParent: getDefaultFollowParent(this.settings, false)
      }
    });
    makeNavigable(leaf.view);
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    await workspace.requestSaveLayout();
    refreshLeafHeader(leaf);
    this.applyChildBinding(parentPanelId ?? null, leaf);
    return leaf;
  }

  private findExistingFolderSpaceInPopout(
    folderPath: string,
    location: Exclude<FolderSpaceLocation, "window">,
    win: Window
  ): WorkspaceLeaf | null {
    const columns = this.popoutLayout.getTopLevelColumnElements(win);
    const leftColumn = columns[0] ?? null;
    const rightColumn = columns[columns.length - 1] ?? null;
    const targetColumn =
      location === "left-sidebar"
        ? leftColumn
        : location === "right-sidebar"
          ? rightColumn
          : null;

    const candidates: FolderSpaceScopeCandidate<WorkspaceLeaf>[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (getWindowOfLeaf(leaf) !== win) {
        return;
      }
      const state = leaf.getViewState();
      if (state.type !== FOLDER_SPACES_VIEW_TYPE || typeof state.state?.folderPath !== "string") {
        return;
      }

      const container = (leaf.view as { containerEl?: HTMLElement } | undefined)?.containerEl;
      const column = container ? columns.find((candidate) => candidate.contains(container)) ?? null : null;
      const inEditor = columns.length <= 1 || (column !== leftColumn && column !== rightColumn);
      const inTargetRegion =
        (location === "editor" && inEditor) ||
        ((location === "left-sidebar" || location === "right-sidebar") && column === targetColumn);
      if (inTargetRegion) {
        candidates.push({
          leaf,
          folderPath: state.state.folderPath,
          location,
          window: win
        });
      }
    });

    return findExistingFolderSpace(candidates, {
      folderPath,
      location,
      window: win
    });
  }

  private async openSearchInWindow(win: Window, query: string): Promise<WorkspaceLeaf> {
    const leaf = await this.popoutLayout.openPanel(win, "tab", "search");
    await leaf.setViewState({ type: "search", state: { query } });
    return leaf;
  }

  private refreshFolderSpaces(): void {
    for (const leaf of getLeavesOfTypeAcrossWindows(this.app.workspace, FOLDER_SPACES_VIEW_TYPE)) {
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
    for (const leaf of getLeavesOfTypeAcrossWindows(this.app.workspace, FOLDER_SPACES_VIEW_TYPE)) {
      makeFolderSpaceLeafProtected(leaf);
      makeNavigable(leaf.view);
    }
  }

  /**
   * Binds a newly created panel to the panel that opened it (the context-menu
   * source). The child then carries the "sync focus with parent panel" toggle
   * and follows the parent's folder focus when the toggle is ON.
   */
  private applyChildBinding(parentPanelId: string | null, leaf: WorkspaceLeaf): void {
    if (!parentPanelId) {
      return;
    }

    const view = leaf.view as unknown as PanelBindingView | undefined;
    if (!view || typeof view.panelId !== "string") {
      console.warn("[folder-spaces] Child panel view has no panelId; cannot bind.", { parentPanelId });
      return;
    }

    // The freshly created leaf has not been through a layout-change reconcile
    // yet, so register it first — `bind()` silently no-ops on unknown panels.
    this.panelBindingManager.register(view);
    // `bind()` sets the child's `parentPanelId` and refreshes its follow-toggle
    // UI through `onBindingChanged()`.
    this.panelBindingManager.bind(parentPanelId, view.panelId);
    if (this.panelBindingManager.getParentOf(view.panelId)?.panelId !== parentPanelId) {
      console.warn("[folder-spaces] Failed to bind child panel.", { parentPanelId, childId: view.panelId });
      return;
    }
    void this.app.workspace.requestSaveLayout();
  }

  /**
   * Re-registers every live Folder Space panel and reconciles the binding
   * registry. Runs on layout change so bindings persist across reloads and are
   * cleaned up when a parent (or child) panel is closed.
   */
  private reconcileFolderSpaceBindings(): void {
    const workspace = this.app.workspace;
    this.syncNativeExplorerParents();
    for (const leaf of getLeavesOfTypeAcrossWindows(workspace, FOLDER_SPACES_VIEW_TYPE)) {
      const view = leaf.view as unknown as PanelBindingView | undefined;
      if (view && typeof view.panelId === "string") {
        this.panelBindingManager.register(view);
      }
    }

    if (this.panelBindingManager.reconcile()) {
      void workspace.requestSaveLayout();
    }
  }

  /**
   * Registers each live native File Explorer leaf as a potential parent panel
   * and attaches a click listener that drives its bound child's folder focus.
   * Dropped leaves are unregistered so their bindings break.
   */
  private syncNativeExplorerParents(): void {
    const workspace = this.app.workspace;
    const seen = new Set<WorkspaceLeaf>();
    workspace.iterateAllLeaves((leaf) => {
      if (leaf.getViewState().type !== FILE_EXPLORER_VIEW_TYPE) {
        return;
      }
      seen.add(leaf);
      this.ensureNativeExplorerParent(leaf);
    });

    for (const [leaf, binding] of [...this.nativeExplorerBindings]) {
      if (!seen.has(leaf)) {
        this.panelBindingManager.unregister(binding.panelId);
        this.nativeExplorerBindings.delete(leaf);
      }
    }
  }

  private ensureNativeExplorerParent(leaf: WorkspaceLeaf): void {
    let binding = this.nativeExplorerBindings.get(leaf);
    if (!binding) {
      binding = createNativeExplorerBinding(this.panelBindingManager, leaf, (sourceLeaf) => {
        this.activeContextSourceLeaf = sourceLeaf;
      });
      this.nativeExplorerBindings.set(leaf, binding);
    }
    binding.attach();
    this.panelBindingManager.register(binding.handle);
  }

  /**
   * Resolves the panel that acted as the context-menu source. When a folder is
   * right-clicked inside a Folder Space panel, the `file-menu` event carries
   * that panel's leaf; when right-clicked in the native File Explorer, it
   * carries the native explorer's leaf, which also acts as a parent panel.
   * Panels can nest to any depth.
   */
  private getContextParentPanelId(leaf: WorkspaceLeaf | null | undefined): string | null {
    if (!leaf) {
      return null;
    }

    const type = leaf.getViewState().type;

    if (type === FOLDER_SPACES_VIEW_TYPE) {
      const view = leaf.view as unknown as PanelBindingView | undefined;
      if (!view || typeof view.panelId !== "string") {
        console.warn("[folder-spaces] Source Folder Space view has no panelId; cannot bind.", { type });
        return null;
      }
      // Register the source panel on-demand so `bind()` finds it even when a
      // layout-change reconcile has not run yet.
      this.panelBindingManager.register(view);
      return view.panelId;
    }

    if (type === FILE_EXPLORER_VIEW_TYPE) {
      // Ensure the native explorer parent is ready even before a layout-change
      // reconcile has run for it.
      let binding = this.nativeExplorerBindings.get(leaf);
      if (!binding) {
        binding = createNativeExplorerBinding(this.panelBindingManager, leaf, (sourceLeaf) => {
          this.activeContextSourceLeaf = sourceLeaf;
        });
        this.nativeExplorerBindings.set(leaf, binding);
      }
      binding.attach();
      this.panelBindingManager.register(binding.handle);
      return binding.panelId;
    }

    return null;
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

function getLeavesOfTypeAcrossWindows(
  workspace: FolderSpacesPlugin["app"]["workspace"],
  type: string
): WorkspaceLeaf[] {
  const leaves: WorkspaceLeaf[] = [];
  workspace.iterateAllLeaves((leaf) => {
    if (leaf.getViewState().type === type) {
      leaves.push(leaf);
    }
  });
  return leaves;
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

interface NativeExplorerViewLike {
  containerEl?: HTMLElement;
  navFileContainerEl?: HTMLElement;
  files?: Map<HTMLElement, TAbstractFile>;
}

interface NativeExplorerBinding {
  leaf: WorkspaceLeaf;
  panelId: string;
  handle: PanelBindingView;
  attach(): void;
}

/**
 * Turns a native File Explorer leaf into a parent panel. The native explorer
 * shows the whole vault (its `getFolderPath` is irrelevant), so the child's
 * scope always follows the explicitly clicked folder. Two capture listeners
 * cooperate:
 *
 * - A **window capture** listener drives the bound child (it fires before any
 *   document-level interceptor such as the Folder Notes plugin) but never
 *   stops the event, leaving downstream plugins free to react.
 * - A **container capture** listener on the explorer's tree container consumes
 *   a folder-name click (`preventDefault` + `stopPropagation`) so the native
 *   tree does not collapse/expand while it navigates a following child. It only
 *   runs when no earlier document-level interceptor already handled the click.
 *
 * A chevron click, a click without a following child (or with its "sync focus
 * with parent panel" toggle OFF), and modifier clicks keep the native behavior
 * untouched.
 *
 * The parent identity is derived from the leaf's persisted `id` (stable across
 * vault reloads) so that child bindings survive restarting Obsidian, just like
 * Folder Space panel ids stored in the view state do.
 */
function createNativeExplorerBinding(
  manager: PanelBindingManager,
  leaf: WorkspaceLeaf,
  onContextSource: (sourceLeaf: WorkspaceLeaf) => void
): NativeExplorerBinding {
  const leafId = (leaf as WorkspaceLeaf & { id?: string }).id;
  const panelId = leafId ? `native:${leafId}` : generatePanelId();
  let handler: ((event: MouseEvent) => void) | null = null;
  let contextHandler: ((event: MouseEvent) => void) | null = null;
  let toggleBlocker: ((event: MouseEvent) => void) | null = null;

  const handle: PanelBindingView = {
    panelId,
    parentPanelId: null,
    followParent: true,
    // The view may not be loaded yet on startup; treat the leaf as alive as
    // long as it still hosts the file-explorer state so a first reconcile never
    // prunes a valid parent and orphans its children. Actual cleanup of closed
    // explorer leaves is handled by `syncNativeExplorerParents`.
    isAlive: () => {
      try {
        return leaf.getViewState().type === FILE_EXPLORER_VIEW_TYPE;
      } catch {
        return false;
      }
    },
    getFolderPath: () => null,
    setFolderPath: () => {},
    onBindingChanged: () => {}
  };

  const attach = (): void => {
    const view = leaf.view as unknown as NativeExplorerViewLike | undefined;
    const doc = view?.containerEl?.ownerDocument ?? null;
    const win = doc?.defaultView ?? null;
    if (!win) {
      return;
    }

    // Register the click listener ONCE on the window in the capture phase.
    // Window capture always fires before any document-level listener, so the
    // Folder Notes plugin's stopImmediatePropagation() on the document can
    // never block it, regardless of plugin load order. The handler re-resolves
    // the view at click time, so re-attaching is never needed. It drives the
    // child but never stops the event, so downstream plugins (e.g. Folder
    // Notes) are left free to react. Clicks outside this explorer's tree are
    // ignored by the containment check.
    if (!handler) {
      handler = (event: MouseEvent) => {
        const child = manager.getChildOf(panelId);
        if (!child || !child.followParent) {
          return;
        }
        const currentView = leaf.view as unknown as NativeExplorerViewLike | undefined;
        const currentContainer = currentView?.navFileContainerEl;
        if (!currentContainer) {
          return;
        }
        const folderPath = resolveClickedFolderPath(currentContainer, currentView?.files, event);
        if (folderPath) {
          manager.propagateFrom(panelId, folderPath);
        }
      };
      win.addEventListener("click", handler, { capture: true });
    }

    const container = view?.navFileContainerEl;
    if (toggleBlocker && container) {
      container.removeEventListener("click", toggleBlocker, { capture: true });
    }
    if (container) {
      // Consumes a folder-name click at the tree container so the native tree
      // does not collapse/expand while it navigates a following child. This
      // listener only fires when no earlier document-level interceptor (e.g.
      // the Folder Notes plugin) already handled the click, so it never blocks
      // plugins that open a folder note.
      toggleBlocker = (event: MouseEvent) => {
        const child = manager.getChildOf(panelId);
        if (!child || !child.followParent) {
          return;
        }
        const currentView = leaf.view as unknown as NativeExplorerViewLike | undefined;
        const currentContainer = currentView?.navFileContainerEl;
        if (!currentContainer || currentContainer !== container) {
          return;
        }
        if (resolveClickedFolderPath(currentContainer, currentView?.files, event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      container.addEventListener("click", toggleBlocker, { capture: true });
    }

    if (contextHandler && container) {
      container.removeEventListener("contextmenu", contextHandler, { capture: true });
    }
    if (container) {
      contextHandler = () => onContextSource(leaf);
      container.addEventListener("contextmenu", contextHandler, { capture: true });
    }
  };

  attach();
  return { leaf, panelId, handle, attach };
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
  try {
    leafWithHeader.updateHeader?.();
  } catch (error) {
    console.warn("[folder-spaces] Header update failed:", error);
  }
  const view = leaf.view as { folderPath?: string | null } | undefined;
  updateFolderSpaceLeafTooltip(leaf, view?.folderPath ?? null);
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

/**
 * 將 Popout 中 Folder Space 所在的側欄欄位標記為 sidebar
 * （與 Window Spaces 的 UI 標記 window-spaces-sidebar-column 一致）。
 * shared engine 的 isLeafInSideColumn / getCenterPanes 以該 class 為被動判定
 * 依據；在無 Window Spaces 管理（無 activity bar hints / class）的環境，
 * Folder Spaces 自行標記可確保開檔排除側欄欄位。class 為 idempotent，
 * Window Spaces 已標記時無副作用。
 */
function markPopoutSidebarColumn(leaf: WorkspaceLeaf): void {
  const container = getViewContainer(leaf);
  if (!container) return;
  const rootEl = container.closest(".workspace-split.mod-root") as HTMLElement | null;
  if (!rootEl) return;
  const column = getDirectSplitChild(rootEl, container);
  if (column && !column.classList.contains("window-spaces-sidebar-column")) {
    column.classList.add("window-spaces-sidebar-column");
  }
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

