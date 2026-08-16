import {
  App,
  FileView,
  FuzzySuggestModal,
  ItemView,
  Keymap,
  Menu,
  Notice,
  TAbstractFile,
  TFile,
  TFolder,
  View,
  ViewStateResult,
  WorkspaceLeaf,
  type PaneType,
  debounce,
  setIcon,
  setTooltip
} from "obsidian";

import {
  findToolbarButton,
  getFolderSpaceTitle,
  isPathInsideFolder,
  makeNavigable,
  normalizeState,
  type FolderSpaceViewMode,
  type FolderSpaceDepthMode,
  type FolderSpaceContentMode
} from "./compatibility-helpers.js";
export { makeNavigable };
import {
  computeNextFocusedItem,
  getVisibleTreeItems as getVisibleTreeItemsHelper,
  isElementVisible
} from "./tree-navigation-helpers.js";
export { isElementVisible };
import { presetLabel, t } from "./i18n.js";
import { PanelActivityTracker } from "./panel-activity-tracker.js";
import { IconPickerModal } from "./ui/icon-picker-modal.js";
import {
  chooseFolderSpaceCreationTarget,
  type FolderSpaceCreationCandidate
} from "./folder-space-routing-policy.js";
import {
  FOLDER_SPACE_PRESETS,
  matchPreset,
  presetToState,
  type FolderSpacePreset
} from "./presets.js";
import { getWindowOfLeaf, isPopoutWindow } from "./shared/popoutLayout.js";
import type { PopoutLayoutEngine } from "./shared/popoutLayout.js";
import {
  generatePanelId,
  type FolderPathChangeOptions,
  type PanelBindingManager
} from "./panel-binding.js";

import { FOLDER_SPACES_VIEW_TYPE } from "./api.js";
export { FOLDER_SPACES_VIEW_TYPE };
const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

type ViewCreator = (leaf: WorkspaceLeaf) => View;

const panelActivityTrackers = new WeakMap<App["workspace"], PanelActivityTracker>();

export interface FolderSpaceViewOptions {
  getIcon(): string;
  getFolderIcon?(folderPath: string | null): string;
  getDefaultViewMode?(): FolderSpaceViewMode;
  getFolderViewMode?(folderPath: string): FolderSpaceViewMode | null;
  setFolderViewMode?(folderPath: string, viewMode: FolderSpaceViewMode): void | Promise<void>;
  getDefaultDepthMode?(): FolderSpaceDepthMode;
  getFolderDepthMode?(folderPath: string): FolderSpaceDepthMode | null;
  setFolderDepthMode?(folderPath: string, depthMode: FolderSpaceDepthMode): void | Promise<void>;
  getDefaultContentMode?(): FolderSpaceContentMode;
  getFolderContentMode?(folderPath: string): FolderSpaceContentMode | null;
  setFolderContentMode?(folderPath: string, contentMode: FolderSpaceContentMode): void | Promise<void>;
  setFolderIcon?(folderPath: string, icon: string): void | Promise<void>;
  openSearchInWindow?(win: Window, query: string): Promise<WorkspaceLeaf>;
  bindingManager?: PanelBindingManager;
  onContextMenuOpen?(leaf: WorkspaceLeaf): void;
  popoutLayoutEngine?: PopoutLayoutEngine;
}

interface InternalTreeItem {
  el: HTMLElement;
  selfEl: HTMLElement;
  titleEl?: HTMLElement;
  file: TAbstractFile;
  parent?: InternalTreeItem | null;
  collapsed?: boolean;
  sort?: () => void;
  toggleCollapsed?: (collapsed?: boolean) => Promise<void> | void;
  setCollapsed?: (collapsed: boolean, animate?: boolean) => Promise<void> | void;
}

interface InternalTree {
  focusedItem: InternalTreeItem | null;
  selectedDoms: Set<InternalTreeItem>;
  isAllCollapsed: boolean;
  infinityScroll: {
    rootEl: {
      vChildren: {
        setChildren(children: InternalTreeItem[]): void;
      };
    };
    compute(): void;
    invalidateAll(): void;
    scrollIntoView(item: InternalTreeItem, padding?: number): void;
  };
  clearSelectedDoms(): void;
  handleItemSelection(event: MouseEvent, item: InternalTreeItem): boolean;
  setFocusedItem(item: InternalTreeItem | null, focus?: boolean): void;
  changeFocusedItem?: (direction: "forwards" | "backwards") => void;
  onKeyArrowLeft?: (event: KeyboardEvent) => void;
}

interface InternalExplorerView extends View {
  activeDom: InternalTreeItem | null;
  autoRevealFile: boolean;
  containerEl: HTMLElement;
  fileItems: Record<string, InternalTreeItem>;
  headerDom?: {
    navButtonsEl: HTMLElement;
  };
  navFileContainerEl: HTMLElement;
  ready: boolean;
  requestSort(): void;
  folderPath?: string | null;
  rootEmptyStateEl?: HTMLDivElement;
  rootEmptyTitleEl?: HTMLDivElement;
  rootEmptyDescriptionEl?: HTMLDivElement;
  folderPathEl?: HTMLDivElement;
  folderPathTextEl?: HTMLSpanElement;
  files: Map<HTMLElement, TAbstractFile>;
  tree: InternalTree;
  _sortQueued?: boolean;
  createAbstractFile(
    kind: "file" | "folder",
    parent: TFolder | null,
    newLeaf: boolean | PaneType
  ): Promise<void>;
  getSortedFolderItems(folder: TFolder): InternalTreeItem[];
  handlePaste(event: ClipboardEvent): Promise<void>;
  load(): void;
  onCreateNewFolderClick(event: MouseEvent): void;
  onCreateNewNoteClick(event: MouseEvent): void;
  onDelete(file: TAbstractFile): void;
  afterCreate?(file: TAbstractFile | null, newLeaf: boolean | PaneType): void | Promise<void>;
  onFileContextMenu(event: MouseEvent, file: TAbstractFile): void;
  onRename(file: TAbstractFile, oldPath: string): void;
  revealActiveFile(): void;
  revealInFolder(file: TAbstractFile): void;
  sort(): void;
}

interface PatchedExplorerView extends InternalExplorerView {
  folderPath: string | null;
  viewMode: FolderSpaceViewMode;
  depthMode: FolderSpaceDepthMode;
  contentMode: FolderSpaceContentMode;
  rootEmptyStateEl: HTMLDivElement;
  rootEmptyTitleEl: HTMLDivElement;
  rootEmptyDescriptionEl: HTMLDivElement;
  folderPathEl: HTMLDivElement;
  folderPathTextEl: HTMLSpanElement;
  rootRenameInputEl?: HTMLInputElement;
  flatRenameInputEl?: HTMLInputElement;
  flatRenameEditors?: WeakSet<HTMLElement>;
  viewSettingsButtonEl?: HTMLElement;
  folderIconButtonEl?: HTMLElement;
  getDefaultViewMode(): FolderSpaceViewMode;
  getFolderViewMode(folderPath: string): FolderSpaceViewMode | null;
  setFolderViewMode(folderPath: string, viewMode: FolderSpaceViewMode): void | Promise<void>;
  getDefaultDepthMode(): FolderSpaceDepthMode;
  getFolderDepthMode(folderPath: string): FolderSpaceDepthMode | null;
  setFolderDepthMode(folderPath: string, depthMode: FolderSpaceDepthMode): void | Promise<void>;
  getDefaultContentMode(): FolderSpaceContentMode;
  getFolderContentMode(folderPath: string): FolderSpaceContentMode | null;
  setFolderContentMode(folderPath: string, contentMode: FolderSpaceContentMode): void | Promise<void>;
  setFolderIcon(folderPath: string, icon: string): void | Promise<void>;
  setState(
    state: unknown,
    result: ViewStateResult,
    changeOptions?: FolderPathChangeOptions
  ): Promise<void>;
  flatItemParents?: Map<InternalTreeItem, InternalTreeItem | null | undefined>;
  flatItemLabels?: Map<InternalTreeItem, FlatItemLabelState>;
  _flatRefreshTimer?: number;
  navigation: boolean;
  panelId: string;
  parentPanelId: string | null;
  followParent: boolean;
  bindingManager: PanelBindingManager | null;
  popoutLayoutEngine?: PopoutLayoutEngine;
  followParentButtonEl?: HTMLElement;
  syncFocusItem?: InternalTreeItem;
  syncFocusIconEl?: HTMLElement;
  syncFocusHeaderEl?: HTMLElement;
  syncFocusDecorationObserver?: MutationObserver;
  setFolderPath(path: string | null, options?: FolderPathChangeOptions): void;
  isAlive(): boolean;
  onBindingChanged(): void;
  openSearchInWindow?: (win: Window, query: string) => Promise<WorkspaceLeaf>;
  addAction?(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement | null;
}

interface FlatItemLabelState {
  element: HTMLElement;
  textNodes: Array<{ node: Text; text: string }>;
  addedNode?: Text;
}

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private readonly folders: TFolder[];

  constructor(
    app: App,
    private readonly onChooseFolder: (folder: TFolder) => void,
    private readonly selectedPath: string | null = null
  ) {
    super(app);
    this.folders = getVaultFolders(app).sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" })
    );
    this.emptyStateText = t("rootFolderModalEmpty");
    this.setPlaceholder(t("rootFolderModalPlaceholder"));
  }

  override getItems(): TFolder[] {
    return this.folders;
  }

  override getItemText(item: TFolder): string {
    return item.isRoot() ? "/" : item.path;
  }

  override renderSuggestion(item: { item: TFolder }, el: HTMLElement): void {
    const row = el.createDiv({ cls: "folder-spaces-folder-suggestion" });
    row.createDiv({
      cls: "folder-spaces-folder-suggestion-path",
      text: item.item.isRoot() ? "/" : item.item.path
    });
    if (item.item.path === this.selectedPath) {
      row.addClass("is-selected");
    }
  }

  override onChooseItem(item: TFolder): void {
    this.onChooseFolder(item);
  }
}

class RootFolderPickerModal extends FolderPickerModal {
  constructor(app: App, view: PatchedExplorerView) {
    super(
      app,
      (folder) => setFolderPath(view, folder.path),
      view.folderPath
    );
  }
}

export function createFolderSpaceView(app: App, leaf: WorkspaceLeaf): View {
  return createFolderSpaceViewWithOptions(app, leaf, {
    getIcon: () => "lucide-folders"
  });
}

export function createFolderSpaceViewWithOptions(
  app: App,
  leaf: WorkspaceLeaf,
  options: FolderSpaceViewOptions
): View {
  getPanelActivityTracker(app.workspace);
  makeFolderSpaceLeafProtected(leaf);

  const creator = getFileExplorerCreator(app);
  if (!creator) {
    return createUnsupportedView(leaf, options);
  }

  try {
    const baseView = creator(leaf);
    if (!hasNativeExplorerCapabilities(baseView)) {
      return createUnsupportedView(leaf, options);
    }

    makeDockable(baseView);
    makeNavigable(baseView);
    makeFolderSpaceLeafProtected(leaf);
    return patchExplorerView(baseView, options);
  } catch (error) {
    console.warn("[folder-spaces] Native File Explorer unavailable; Folder Space disabled.", error);
    return createUnsupportedView(leaf, options);
  }
}

export function disposePanelActivityTracker(workspace: App["workspace"]): void {
  const tracker = panelActivityTrackers.get(workspace);
  if (!tracker) {
    return;
  }

  tracker.dispose();
  panelActivityTrackers.delete(workspace);
}

/**
 * Obsidian's workspace drag handler only allows views that are ItemViews to
 * be dropped into the main workspace. The native file explorer intentionally
 * extends View directly, so add ItemView to this instance's prototype chain
 * without changing the native file explorer prototype globally.
 */
export function makeDockable(view: View): boolean {
  if (!view || typeof view !== "object") {
    return false;
  }

  if (view instanceof ItemView) {
    return true;
  }

  try {
    const nativePrototype = Object.getPrototypeOf(view);
    if (!nativePrototype || nativePrototype === Object.prototype) {
      return false;
    }

    const dockablePrototype = Object.create(ItemView.prototype) as object;
    const copiedKeys = new Set<PropertyKey>();

    for (
      let prototype: object | null = nativePrototype;
      prototype && prototype !== View.prototype && prototype !== Object.prototype;
      prototype = Object.getPrototypeOf(prototype)
    ) {
      for (const key of Reflect.ownKeys(prototype)) {
        if (key === "constructor" || copiedKeys.has(key)) {
          continue;
        }

        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (descriptor) {
          Object.defineProperty(dockablePrototype, key, descriptor);
          copiedKeys.add(key);
        }
      }
    }

    Object.setPrototypeOf(view, dockablePrototype);
    return view instanceof ItemView;
  } catch (error) {
    console.warn("[folder-spaces] Unable to apply dockable prototype bridge to view instance.", error);
    return false;
  }
}

/**
 * Obsidian's `getUnpinnedLeaf()` reuses the active leaf as the file-open
 * target when `canNavigate()` returns true. Force `canNavigate()` to return
 * false on a leaf so it is never reused as a file-open target.
 */
export function makeLeafUnreusable(leaf: WorkspaceLeaf): void {
  (leaf as WorkspaceLeaf & { canNavigate?: () => boolean }).canNavigate = () => false;
}

/**
 * Obsidian's `getUnpinnedLeaf()` reuses the active leaf as the file-open
 * target when `canNavigate()` returns true. The Folder Space forces
 * `navigation: true` to stay dockable, which would let a native file-open
 * (command palette, quick switcher, link) replace the Folder Space whenever it
 * is the active leaf. Override `canNavigate` on the leaf so the Folder Space
 * is never reused as a file-open target.
 */
export function makeFolderSpaceLeafProtected(leaf: WorkspaceLeaf): void {
  makeNavigable(leaf);
  makeLeafUnreusable(leaf);
  protectLeafFromRebuild(leaf);
}

/**
 * Window Spaces 的 restore 流程以 `.view-content` 是否有子元素判斷 view 是否
 * 已渲染，並對「未渲染」的 leaf 反覆執行 `rebuildView()`（整棵樹重繪）。
 * Folder Space 重用 native File Explorer 的 DOM 結構（nav-header /
 * nav-files-container，沒有 `.view-content`），會被誤判為未渲染而在 popout
 * restore 後被連續重建多次，造成 explorer tree 抖動。此處讓 `rebuildView`
 * 對已渲染的 Folder Space leaf 變成 no-op，避免樹被反覆重繪。
 */
function protectLeafFromRebuild(leaf: WorkspaceLeaf): void {
  const leafWithRebuild = leaf as WorkspaceLeaf & {
    rebuildView?: () => Promise<void>;
    _folderSpacesRebuildProtected?: boolean;
  };
  const originalRebuild = leafWithRebuild.rebuildView;
  if (!originalRebuild || leafWithRebuild._folderSpacesRebuildProtected) {
    return;
  }

  leafWithRebuild._folderSpacesRebuildProtected = true;
  leafWithRebuild.rebuildView = () => {
    const view = leaf.view as { navFileContainerEl?: HTMLElement } | null;
    const hasRenderedTree =
      view !== null &&
      view !== undefined &&
      view.navFileContainerEl !== undefined &&
      view.navFileContainerEl.childElementCount > 0;
    if (hasRenderedTree) {
      return Promise.resolve();
    }
    return originalRebuild.call(leaf);
  };
}

function getFileExplorerCreator(app: App): ViewCreator | null {
  try {
    const registry = (app as App & {
      viewRegistry?: unknown;
    }).viewRegistry as {
      getViewCreatorByType?: (type: string) => ViewCreator | undefined;
    } | undefined;

    if (!registry || typeof registry.getViewCreatorByType !== "function") {
      return null;
    }

    return registry.getViewCreatorByType(FILE_EXPLORER_VIEW_TYPE) ?? null;
  } catch (error) {
    console.warn("[folder-spaces] Unable to access the native File Explorer creator.", error);
    return null;
  }
}

function createUnsupportedView(
  leaf: WorkspaceLeaf,
  options: FolderSpaceViewOptions
): FolderSpaceUnsupportedView {
  const view = new FolderSpaceUnsupportedView(leaf, options);
  makeNavigable(view);
  makeFolderSpaceLeafProtected(leaf);
  return view;
}

function hasNativeExplorerCapabilities(value: unknown): value is InternalExplorerView {
  if (!isObject(value)) {
    return false;
  }

  const view = value as Partial<InternalExplorerView>;
  if (!isHTMLElement(view.containerEl) || !isHTMLElement(view.navFileContainerEl)) {
    return false;
  }

  if (!isObject(view.fileItems) || !isMapLike(view.files) || !hasNativeTreeCapabilities(view.tree)) {
    return false;
  }

  return hasMethods(view, [
    "load",
    "getState",
    "setState",
    "getDisplayText",
    "requestSort",
    "sort",
    "revealInFolder",
    "handlePaste",
    "onCreateNewFolderClick",
    "onCreateNewNoteClick",
    "onDelete",
    "onFileContextMenu",
    "onRename",
    "revealActiveFile",
    "createAbstractFile",
    "getSortedFolderItems"
  ]);
}

function hasNativeTreeCapabilities(value: unknown): value is InternalTree {
  if (!isObject(value) || !hasMethods(value, ["clearSelectedDoms", "setFocusedItem"])) {
    return false;
  }

  const infinityScroll = value.infinityScroll;
  if (!isObject(infinityScroll) || !hasMethods(infinityScroll, ["compute", "invalidateAll", "scrollIntoView"])) {
    return false;
  }

  const rootEl = infinityScroll.rootEl;
  const vChildren = isObject(rootEl) ? rootEl.vChildren : null;
  return (
    isObject(rootEl) &&
    isObject(vChildren) &&
    hasMethods(vChildren, ["setChildren"]) &&
    hasMethods(value, ["handleItemSelection"])
  );
}

function hasMethods(value: object, names: string[]): boolean {
  return names.every((name) => typeof Reflect.get(value, name) === "function");
}

function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object";
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isObject(value) &&
    value.nodeType === 1 &&
    typeof value.appendChild === "function" &&
    typeof value.querySelector === "function"
  );
}

function isMapLike(value: unknown): value is Map<HTMLElement, TAbstractFile> {
  return isObject(value) && typeof value.get === "function";
}

function patchExplorerView(
  baseView: InternalExplorerView,
  options: FolderSpaceViewOptions
): PatchedExplorerView {
  const view = baseView as PatchedExplorerView;
  if (view.rootEmptyStateEl) {
    return view;
  }

  const originalLoad = view.load.bind(view);
  const originalGetState = view.getState.bind(view);
  const originalSetState = view.setState.bind(view);
  const originalGetSortedFolderItems = view.getSortedFolderItems.bind(view);
  const originalSort = view.sort.bind(view);
  const originalRevealInFolder = view.revealInFolder.bind(view);
  const originalHandlePaste = view.handlePaste.bind(view);
  const originalOnFileContextMenu = view.onFileContextMenu.bind(view);
  const originalOnRename = view.onRename.bind(view);
  const originalOnDelete = view.onDelete.bind(view);
  const originalAfterCreate = view.afterCreate?.bind(view);

  initializeEmptyState(view);
  view.icon = getFolderSpaceIcon(options, view.folderPath);
  makeNavigable(view);
  if (view.leaf) {
    makeFolderSpaceLeafProtected(view.leaf);
  }
  registerTreeNavigationOverride(view);

  view.panelId = generatePanelId();
  view.parentPanelId = null;
  view.followParent = true;
  view.bindingManager = options.bindingManager ?? null;
  view.popoutLayoutEngine = options.popoutLayoutEngine;
  view.setFolderPath = (path: string | null, changeOptions?: FolderPathChangeOptions) =>
    setFolderPath(view, path, changeOptions);
  view.isAlive = () => Boolean(view.leaf) && view.leaf.view === view;
  view.onBindingChanged = () => {
    refreshChildBindingUI(view);
    refreshSyncFocusMarker(view);
  };
  view.addAction = (icon: string, title: string, callback: (evt: MouseEvent) => unknown) =>
    addFolderSpaceAction(view, icon, title, callback);

  (view as unknown as { isFolderSpace: boolean }).isFolderSpace = true;
  (view as unknown as { getFolderPath: () => string | null }).getFolderPath = () => view.folderPath;
  view.getDefaultViewMode = () => normalizeViewMode(options.getDefaultViewMode?.());
  view.getFolderViewMode = (folderPath: string) => normalizeOptionalViewMode(options.getFolderViewMode?.(folderPath));
  view.setFolderViewMode = (folderPath: string, viewMode: FolderSpaceViewMode) =>
    options.setFolderViewMode?.(folderPath, viewMode);
  view.getDefaultDepthMode = () => normalizeDepthMode(options.getDefaultDepthMode?.());
  view.getFolderDepthMode = (folderPath: string) => normalizeOptionalDepthMode(options.getFolderDepthMode?.(folderPath));
  view.setFolderDepthMode = (folderPath: string, depthMode: FolderSpaceDepthMode) =>
    options.setFolderDepthMode?.(folderPath, depthMode);
  view.getDefaultContentMode = () => normalizeContentMode(options.getDefaultContentMode?.());
  view.getFolderContentMode = (folderPath: string) =>
    normalizeOptionalContentMode(options.getFolderContentMode?.(folderPath));
  view.setFolderContentMode = (folderPath: string, contentMode: FolderSpaceContentMode) =>
    options.setFolderContentMode?.(folderPath, contentMode);
  view.setFolderIcon = (folderPath: string, icon: string) => options.setFolderIcon?.(folderPath, icon);
  view.openSearchInWindow = options.openSearchInWindow;
  view.getViewType = () => FOLDER_SPACES_VIEW_TYPE;
  view.getIcon = () => getFolderSpaceIcon(options, view.folderPath);

  view.getDisplayText = () => {
    return getFolderSpaceTitle(view.app, view.folderPath);
  };

  view.getSortedFolderItems = (folder: TFolder) => {
    const items = originalGetSortedFolderItems(folder);
    const rootFolder = getRootFolder(view);
    const depthLimit = getFolderDepthLimit(view.depthMode);

    if (view.viewMode !== "flat") {
      if (
        rootFolder &&
        folder !== rootFolder &&
        depthLimit !== null &&
        getFolderDepthFromRoot(rootFolder, folder) >= depthLimit
      ) {
        return [];
      }
      return filterByContentMode(view, items);
    }

    if (!rootFolder || folder === rootFolder) {
      return items;
    }

    // In Flat mode every folder is rendered at the root level. Its native
    // children therefore contain only the files directly inside that folder;
    // descendant folders are rendered as their own root-level groups.
    return filterByContentMode(
      view,
      items.filter((item) => item.file instanceof TFile)
    );
  };

  view.getState = () => ({
    ...originalGetState(),
    folderPath: view.folderPath,
    viewMode: view.viewMode,
    depthMode: view.depthMode,
    contentMode: view.contentMode,
    panelId: view.panelId,
    parentPanelId: view.parentPanelId,
    followParent: view.followParent
  });

  view.setState = async (
    state: unknown,
    result: ViewStateResult,
    changeOptions?: FolderPathChangeOptions
  ) => {
    try {
      const nextState = normalizeState(state);
      const preservedViewSettings = changeOptions?.preserveViewSettings
        ? {
            viewMode: view.viewMode,
            depthMode: view.depthMode,
            contentMode: view.contentMode
          }
        : null;
      view.folderPath = nextState.folderPath;
      view.viewMode = preservedViewSettings?.viewMode ??
        resolveFolderViewMode(view, nextState.folderPath, nextState.viewMode);
      view.depthMode = preservedViewSettings?.depthMode ??
        resolveFolderDepthMode(view, nextState.folderPath, nextState.depthMode);
      view.contentMode = preservedViewSettings?.contentMode ??
        resolveFolderContentMode(view, nextState.folderPath, nextState.contentMode);
      if (view.contentMode === "files") {
        view.viewMode = "flat";
      }
      const panelId = normalizePanelId(nextState.panelId);
      if (typeof panelId === "string") {
        view.panelId = panelId;
      }
      const parentPanelId = normalizePanelId(nextState.parentPanelId);
      if (parentPanelId !== undefined) {
        view.parentPanelId = parentPanelId;
      }
      view.followParent =
        typeof nextState.followParent === "boolean" ? nextState.followParent : true;
      view.icon = getFolderSpaceIcon(options, view.folderPath);
      await originalSetState(nextState, result);
      // setState may be implemented by the native explorer and can overwrite
      // properties that were set while the view was being created.
      makeNavigable(view);
      if (view.leaf) {
        makeFolderSpaceLeafProtected(view.leaf);
      }
      refreshFolderPresentation(view, Boolean(view.folderPath));
      scheduleFlatRefresh(view);
      refreshLeafHeader(view);
      view.onBindingChanged();
    } catch (error) {
      console.warn("[folder-spaces] Unable to set view state:", error);
      new Notice(t("rootUnavailable"));
    }
  };

  view.load = () => {
    // 先套用 leaf view state 中的初始 folderPath，避免原生 load() 先以 root
    // 內容渲染、setState 延遲到達時才重建造成抖動（見 applyInitialViewState）。
    applyInitialViewState(view);
    originalLoad();
    // The native explorer can reset this flag while it is loading.
    makeNavigable(view);
    if (view.leaf) {
      makeFolderSpaceLeafProtected(view.leaf);
    }
    registerRootContextMenuOverride(view);
    registerCreateButtonsOverride(view);
    registerFileOpenOverride(view);
    registerFlatRenameEditorOverride(view);
    registerTreeNavigationOverride(view);
    registerParentScopeFollowOverride(view);
    refreshFolderPresentation(view, false);
    view.onBindingChanged();
    scheduleFlatRefresh(view);
  };

  view.sort = () => {
    const rootFolder = getRootFolder(view);

    if (!rootFolder) {
      restoreFlatItemParents(view);
      renderChildren(view, []);
      return;
    }

    if (!view.ready) {
      originalSort();
      return;
    }

    if (view.containerEl.isShown()) {
      view._sortQueued = false;
      sortNestedFolders(view);
      const useFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
      const items = useFlatRendering
        ? getFlatItems(view, rootFolder)
        : view.getSortedFolderItems(rootFolder);
      renderChildren(view, items);
      const depthLimit = getFolderDepthLimit(view.depthMode);
      if (view.viewMode === "tree" && view.contentMode !== "files" && depthLimit !== null) {
        collapseFoldersBeyondDepth(view, rootFolder, depthLimit);
        view.tree.infinityScroll.compute();
      }
      if (view.autoRevealFile) {
        view.revealActiveFile();
      }
      return;
    }

    if (!view._sortQueued) {
      view.containerEl.onNodeInserted(() => view.requestSort(), true);
      view._sortQueued = true;
    }
  };

  view.requestSort = debounce(() => {
    view.sort();
  }, 20, true);

  view.revealInFolder = (file: TAbstractFile) => {
    if (!isInsideRoot(view, file.path)) {
      return;
    }

    originalRevealInFolder(file);
  };

  view.handlePaste = async (event: ClipboardEvent) => {
    const originalFocused = view.tree.focusedItem;
    if (!originalFocused) {
      view.tree.focusedItem = getRootItem(view);
    }

    try {
      await originalHandlePaste(event);
    } finally {
      if (!originalFocused) {
        view.tree.focusedItem = originalFocused;
      }
    }
  };

  view.onCreateNewNoteClick = (event: MouseEvent) => {
    createFolderSpaceFile(view, "file", event);
  };

  view.onFileContextMenu = (event: MouseEvent, file: TAbstractFile) => {
    options.onContextMenuOpen?.(view.leaf);
    const inPopout = isPopoutWindow(getWindowOfLeaf(view.leaf));
    const handler = (menu: Menu, menuFile: TAbstractFile) => {
      if (menuFile instanceof TFolder && view.viewMode === "flat" && isInsideRoot(view, menuFile.path)) {
        patchFlatFolderMenu(menu, view, menuFile);
      }

      if (menuFile instanceof TFolder && inPopout && isInsideRoot(view, menuFile.path)) {
        patchSearchInFolderItem(menu, view, menuFile);
      }
    };

    view.app.workspace.on("file-menu", handler as any);
    try {
      originalOnFileContextMenu(event, file);
    } finally {
      view.app.workspace.off("file-menu", handler as any);
    }
  };

  view.onCreateNewFolderClick = (event: MouseEvent) => {
    createFolderSpaceFile(view, "folder", event);
  };

  view.afterCreate = (file: TAbstractFile | null, newLeaf: boolean | PaneType) => {
    if (file instanceof TFile) {
      void openFileInContentArea(view, file, newLeaf);
      return;
    }

    const result = originalAfterCreate?.(file, newLeaf);
    if (file instanceof TFolder && view.viewMode === "flat") {
      // Flat mode 將資料夾 label 顯示為相對路徑；原生 inline rename
      // 可能因此把父階層路徑帶入新資料夾的初始值。等待原生 DOM 建立
      // 完成後，只保留新資料夾名稱，讓使用者可直接輸入並建立。
      void Promise.resolve(result)
        .then(() => clearFlatFolderCreatePath(view, file))
        .catch(() => {});
    }
  };

  view.onRename = (file: TAbstractFile, oldPath: string) => {
    originalOnRename(file, oldPath);

    const usesFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
    if (usesFlatRendering && (isInsideRoot(view, oldPath) || isInsideRoot(view, file.path))) {
      scheduleFlatRefresh(view);
    }

    if (!view.folderPath) {
      return;
    }

    if (view.folderPath === oldPath) {
      view.folderPath = file.path;
    } else if (view.folderPath.startsWith(`${oldPath}/`)) {
      view.folderPath = `${file.path}${view.folderPath.slice(oldPath.length)}`;
    } else {
      return;
    }

    void view.setFolderViewMode(view.folderPath, view.viewMode);
    refreshFolderPresentation(view, true);
  };

  view.onDelete = (file: TAbstractFile) => {
    originalOnDelete(file);

    if (view.folderPath === null) {
      return;
    }

    if (file.path === view.folderPath || view.folderPath.startsWith(`${file.path}/`)) {
      view.folderPath = "";
      refreshFolderPresentation(view, true);
    }
  };

  return view;
}



function initializeEmptyState(view: PatchedExplorerView): void {
  const emptyState = view.containerEl.createDiv({ cls: "folder-spaces-empty-state" });
  const title = emptyState.createDiv({ cls: "folder-spaces-empty-title" });
  const description = emptyState.createDiv({ cls: "folder-spaces-empty-desc" });

  const folderPath = view.containerEl.createDiv({
    cls: "folder-spaces-folder-path nav-header",
    attr: { "aria-live": "polite" }
  });

  const folderIconButton = folderPath.createDiv({
    cls: "clickable-icon folder-spaces-action-btn",
    attr: {
      "aria-label": t("actionFolderIcon"),
      "data-tooltip": t("actionFolderIcon")
    }
  });
  setIcon(folderIconButton, view.getIcon());

  const folderPathLeft = folderPath.createDiv({ cls: "folder-spaces-folder-path-left" });
  const folderPathText = folderPathLeft.createSpan({ cls: "folder-spaces-folder-path-text" });

  const folderPathActions = folderPath.createDiv({ cls: "folder-spaces-folder-path-actions nav-buttons" });

  const followParentButton = folderPathActions.createDiv({
    cls: "clickable-icon folder-spaces-action-btn folder-spaces-follow-btn",
    attr: {
      "aria-label": t("actionSyncFollowParent"),
      "data-tooltip": t("actionSyncFollowParent"),
      "aria-pressed": "true"
    }
  });
  setIcon(followParentButton, "lucide-link");
  followParentButton.toggle(false);

  const viewSettingsButton = folderPathActions.createDiv({
    cls: "clickable-icon folder-spaces-action-btn",
    attr: {
      "aria-label": t("actionViewSettings"),
      "data-tooltip": t("actionViewSettings")
    }
  });
  setIcon(viewSettingsButton, "lucide-sliders-horizontal");

  view.navFileContainerEl.before(folderPath);

  // Left-click on folderPathLeft -> Change folder picker
  view.registerDomEvent(folderPathLeft, "click", (event: MouseEvent) => {
    if (view.rootRenameInputEl) {
      return;
    }

    event.stopPropagation();
    new RootFolderPickerModal(view.app, view).open();
  });

  // Right-click on the folder path -> Native Folder Context Menu
  view.registerDomEvent(folderPath, "contextmenu", (event: MouseEvent) => {
    if (view.rootRenameInputEl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const rootFolder = getRootFolder(view);
    if (rootFolder) {
      openRootFolderContextMenu(view, event, rootFolder);
    }
  });

  // Follow Parent Button -> Toggle syncing this panel's folder focus with the
  // bound parent panel. Only visible when the panel is bound to a parent.
  view.registerDomEvent(followParentButton, "click", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!view.parentPanelId) {
      return;
    }

    view.followParent = !view.followParent;
    updateFollowParentButton(view);
    view.onBindingChanged();
    view.bindingManager?.getParentOf(view.panelId)?.onBindingChanged?.();
    void view.app.workspace.requestSaveLayout();
  });

  // View Settings Button -> Open display options dropdown
  view.registerDomEvent(viewSettingsButton, "click", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    showViewSettingsDropdown(view, viewSettingsButton);
  });

  // Folder Icon Button -> Set a custom icon for the current root folder
  view.registerDomEvent(folderIconButton, "click", (event: MouseEvent) => {
    event.stopPropagation();
    if (view.folderPath === null) {
      return;
    }

    new IconPickerModal(view.app, view.getIcon(), async (icon) => {
      const folderPath = view.folderPath;
      if (folderPath === null) {
        return;
      }
      await view.setFolderIcon(folderPath, icon);
      view.icon = view.getIcon();
      refreshLeafHeader(view);
      setIcon(folderIconButton, view.getIcon());
    }).open();
  });

  view.folderPath = "";
  view.viewMode = "tree";
  view.depthMode = "all-level";
  view.contentMode = "all";
  view.flatItemParents = new Map();
  view.flatItemLabels = new Map();
  view.flatRenameEditors = new WeakSet();
  view.rootEmptyStateEl = emptyState;
  view.rootEmptyTitleEl = title;
  view.rootEmptyDescriptionEl = description;
  view.folderPathEl = folderPath;
  view.folderPathTextEl = folderPathText;
  view.viewSettingsButtonEl = viewSettingsButton;
  view.folderIconButtonEl = folderIconButton;
  view.followParentButtonEl = followParentButton;
}

function registerCreateButtonsOverride(view: PatchedExplorerView): void {
  const navButtonsEl = view.headerDom?.navButtonsEl;
  if (!navButtonsEl) {
    return;
  }

  const newNoteButton = findToolbarButton(navButtonsEl, "file", 0);
  const newFolderButton = findToolbarButton(navButtonsEl, "folder", 1);

  if (newNoteButton) {
    view.registerDomEvent(
      newNoteButton,
      "click",
      (event: MouseEvent) => createFolderSpaceFile(view, "file", event),
      { capture: true }
    );
  }

  if (newFolderButton) {
    view.registerDomEvent(
      newFolderButton,
      "click",
      (event: MouseEvent) => createFolderSpaceFile(view, "folder", event),
      { capture: true }
    );
  }
}

function setViewMode(view: PatchedExplorerView, mode: FolderSpaceViewMode): void {
  // A files-only presentation has no folder groups to render as a tree.
  // Keep the persisted mode and the rendered mode consistent with that
  // constraint even if an older layout stored the incompatible combination.
  const effectiveMode = view.contentMode === "files" && mode === "tree" ? "flat" : mode;
  if (view.viewMode === effectiveMode) {
    return;
  }

  restoreFlatItemParents(view);
  restoreFlatItemLabels(view);
  view.viewMode = effectiveMode;
  if (view.folderPath) {
    void view.setFolderViewMode(view.folderPath, effectiveMode);
  }
  updateViewSettingsButton(view);
  if (effectiveMode === "flat") {
    scheduleFlatRefresh(view, "immediate");
  } else {
    view.requestSort();
  }
  void view.app.workspace.requestSaveLayout();
}

function setDepthMode(view: PatchedExplorerView, mode: FolderSpaceDepthMode): void {
  const changed = view.depthMode !== mode;
  view.depthMode = mode;
  if (changed && view.folderPath) {
    void view.setFolderDepthMode(view.folderPath, mode);
  }
  updateViewSettingsButton(view);
  if (view.viewMode === "flat") {
    scheduleFlatRefresh(view, "immediate");
  } else {
    view.requestSort();
    if (view.contentMode !== "files") {
      applyDepthMode(view);
    }
  }
  if (changed) {
    void view.app.workspace.requestSaveLayout();
  }
}

function setContentMode(view: PatchedExplorerView, mode: FolderSpaceContentMode): void {
  if (mode === "files" && view.viewMode !== "flat") {
    setViewMode(view, "flat");
  }

  if (view.contentMode === mode) {
    return;
  }

  const wasFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
  view.contentMode = mode;
  const isFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
  if (wasFlatRendering && !isFlatRendering) {
    restoreFlatItemParents(view);
    restoreFlatItemLabels(view);
  }
  if (view.folderPath) {
    void view.setFolderContentMode(view.folderPath, mode);
  }
  updateViewSettingsButton(view);
  view.requestSort();
  void view.app.workspace.requestSaveLayout();
}

function setFolderPath(
  view: PatchedExplorerView,
  folderPath: string | null,
  changeOptions?: FolderPathChangeOptions
): void {
  const state = { ...view.getState(), folderPath } as Record<string, unknown>;
  if (!changeOptions?.preserveViewSettings) {
    delete state.viewMode;
  }
  void view.setState(state, { history: false }, changeOptions).then(() => {
    // A user-initiated root change moves the parent panel's folder focus, so
    // the bound child follows (when its toggle is ON). Reloads restore state
    // directly and therefore never clobber a child's deeper scope.
    view.bindingManager?.propagateFrom(view.panelId);
    view.bindingManager?.getParentOf(view.panelId)?.onBindingChanged?.();
  });
}

function getFolderSpaceIcon(options: FolderSpaceViewOptions, folderPath: string | null): string {
  return options.getFolderIcon?.(folderPath) ?? options.getIcon();
}

function updateViewSettingsButton(view: PatchedExplorerView): void {
  const button = view.viewSettingsButtonEl;
  if (!button) {
    return;
  }

  button.empty();
  setIcon(button, "lucide-sliders-horizontal");
}

function resolveFolderViewMode(
  view: PatchedExplorerView,
  folderPath: string | null,
  stateViewMode?: FolderSpaceViewMode
): FolderSpaceViewMode {
  if (folderPath === null) {
    return normalizeViewMode(stateViewMode ?? view.getDefaultViewMode());
  }

  return view.getFolderViewMode(folderPath) ?? normalizeViewMode(stateViewMode ?? view.getDefaultViewMode());
}

function resolveFolderDepthMode(
  view: PatchedExplorerView,
  folderPath: string | null,
  stateDepthMode?: FolderSpaceDepthMode
): FolderSpaceDepthMode {
  if (folderPath === null) {
    return normalizeDepthMode(stateDepthMode ?? view.getDefaultDepthMode());
  }

  return view.getFolderDepthMode(folderPath) ?? normalizeDepthMode(stateDepthMode ?? view.getDefaultDepthMode());
}

function resolveFolderContentMode(
  view: PatchedExplorerView,
  folderPath: string | null,
  stateContentMode?: FolderSpaceContentMode
): FolderSpaceContentMode {
  if (folderPath === null) {
    return normalizeContentMode(stateContentMode ?? view.getDefaultContentMode());
  }

  return (
    view.getFolderContentMode(folderPath) ?? normalizeContentMode(stateContentMode ?? view.getDefaultContentMode())
  );
}

/**
 * 建立 Folder Space view 時，原生 File Explorer 的 load() 會先以 root 內容
 * 渲染一次，而 setState（設定 folderPath）通常延遲數百毫秒才到達，導致子目錄
 * space 初次出現時整棵樹由 root 抖動成 scoped 內容（root space 因兩次內容相同
 * 看不出來）。此處在 load 之前直接從 leaf 的 view state 讀取初始 folderPath 與
 * 檢視模式，讓第一次渲染即為正確範圍，消除抖動。
 */
function applyInitialViewState(view: PatchedExplorerView): void {
  const viewState = (view.leaf as WorkspaceLeaf | undefined)?.getViewState?.();
  if (!viewState) {
    return;
  }
  const nextState = normalizeState(viewState.state);
  view.folderPath = nextState.folderPath;
  view.viewMode = resolveFolderViewMode(view, view.folderPath, nextState.viewMode);
  view.depthMode = resolveFolderDepthMode(view, view.folderPath, nextState.depthMode);
  view.contentMode = resolveFolderContentMode(view, view.folderPath, nextState.contentMode);
  if (view.contentMode === "files") {
    view.viewMode = "flat";
  }
}

function normalizeViewMode(mode: unknown): FolderSpaceViewMode {
  return mode === "flat" ? "flat" : "tree";
}

function normalizeOptionalViewMode(mode: unknown): FolderSpaceViewMode | null {
  return mode === "tree" || mode === "flat" ? mode : null;
}

function normalizeDepthMode(mode: unknown): FolderSpaceDepthMode {
  return mode === "one-level" || mode === "two-level" ? mode : "all-level";
}

function normalizeOptionalDepthMode(mode: unknown): FolderSpaceDepthMode | null {
  return mode === "one-level" || mode === "two-level" || mode === "all-level" ? mode : null;
}

function getFolderDepthLimit(mode: FolderSpaceDepthMode): number | null {
  if (mode === "one-level") {
    return 1;
  }
  if (mode === "two-level") {
    return 2;
  }
  return null;
}

function getFolderDepthFromRoot(rootFolder: TFolder, folder: TFolder): number {
  if (rootFolder === folder) {
    return 0;
  }

  const prefix = rootFolder.path ? `${rootFolder.path}/` : "";
  const relativePath = folder.path.startsWith(prefix) ? folder.path.slice(prefix.length) : folder.path;
  return relativePath ? relativePath.split("/").length : 0;
}

function normalizeContentMode(mode: unknown): FolderSpaceContentMode {
  if (mode === "folders" || mode === "files") {
    return mode;
  }
  return "all";
}

function normalizeOptionalContentMode(mode: unknown): FolderSpaceContentMode | null {
  return mode === "folders" || mode === "files" || mode === "all" ? mode : null;
}

function filterByContentMode(view: PatchedExplorerView, items: InternalTreeItem[]): InternalTreeItem[] {
  if (view.contentMode === "all") {
    return items;
  }
  return items.filter((item) => {
    if (view.contentMode === "folders") {
      return item.file instanceof TFolder;
    }
    return item.file instanceof TFile;
  });
}

function applyDepthMode(view: PatchedExplorerView): void {
  const rootFolder = getRootFolder(view);
  if (!rootFolder) {
    return;
  }

  const depthLimit = getFolderDepthLimit(view.depthMode);
  if (depthLimit !== null) {
    collapseFoldersBeyondDepth(view, rootFolder, depthLimit);
  } else {
    expandAllFolders(view, rootFolder);
  }
  view.tree.infinityScroll.compute();
}

/**
 * Collapses folders at or beyond the selected depth limit while expanding
 * shallower folders.
 */
function collapseFoldersBeyondDepth(
  view: PatchedExplorerView,
  folder: TFolder,
  maxDepth: number,
  depth = 1
): void {
  for (const child of folder.children) {
    if (!(child instanceof TFolder)) {
      continue;
    }
    const item = view.fileItems[child.path];
    if (item) {
      if (depth >= maxDepth && !item.collapsed) {
        void item.setCollapsed?.(true, false);
      } else if (depth < maxDepth && item.collapsed) {
        void item.setCollapsed?.(false, false);
      }
    }
    collapseFoldersBeyondDepth(view, child, maxDepth, depth + 1);
  }
}

/**
 * Expands every folder inside the Folder Space so all levels are visible
 * ("Depth: All levels").
 */
function expandAllFolders(view: PatchedExplorerView, folder: TFolder): void {
  for (const child of folder.children) {
    if (!(child instanceof TFolder)) {
      continue;
    }
    const item = view.fileItems[child.path];
    if (item && item.collapsed) {
      void item.setCollapsed?.(false, false);
    }
    expandAllFolders(view, child);
  }
}

function showViewSettingsDropdown(view: PatchedExplorerView, anchorEl: HTMLElement): void {
  const menu = new Menu();

  // 檢視預設集（順序：導覽 / 欄位 / 內容 / 檔案 / 脈絡）——把三維模式包裝成
  // 針對父子連動角色設計的組合；無匹配時顯示「自訂」。
  menu.addItem((item) => {
    item.setTitle(t("presetSection"));
    item.setDisabled(true);
  });
  for (const preset of FOLDER_SPACE_PRESETS) {
    menu.addItem((item) => {
      item.setTitle(presetLabel(preset.id));
      item.setChecked(matchPreset(view.viewMode, view.depthMode, view.contentMode) === preset.id);
      item.onClick(() => applyFolderSpacePreset(view, preset));
    });
  }
  if (matchPreset(view.viewMode, view.depthMode, view.contentMode) === null) {
    menu.addItem((item) => {
      item.setTitle(t("presetCustom"));
      item.setDisabled(true);
    });
  }

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle("Style: Tree view");
    item.setChecked(view.viewMode === "tree");
    item.onClick(() => setViewMode(view, "tree"));
  });

  menu.addItem((item) => {
    item.setTitle("Style: Flat view");
    item.setChecked(view.viewMode === "flat");
    item.onClick(() => setViewMode(view, "flat"));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle("Depth: 1 level");
    item.setChecked(view.depthMode === "one-level");
    item.onClick(() => setDepthMode(view, "one-level"));
  });

  menu.addItem((item) => {
    item.setTitle("Depth: 2 levels");
    item.setChecked(view.depthMode === "two-level");
    item.onClick(() => setDepthMode(view, "two-level"));
  });

  menu.addItem((item) => {
    item.setTitle("Depth: All levels");
    item.setChecked(view.depthMode === "all-level");
    item.onClick(() => setDepthMode(view, "all-level"));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item.setTitle("Show: Folders");
    item.setChecked(view.contentMode === "folders");
    item.onClick(() => setContentMode(view, "folders"));
  });

  menu.addItem((item) => {
    item.setTitle("Show: Files");
    item.setChecked(view.contentMode === "files");
    item.onClick(() => setContentMode(view, "files"));
  });

  menu.addItem((item) => {
    item.setTitle("Show: All");
    item.setChecked(view.contentMode === "all");
    item.onClick(() => setContentMode(view, "all"));
  });

  const menuDocument = anchorEl.ownerDocument;
  const menuWindow = menuDocument.defaultView;
  if (!menuWindow) {
    return;
  }

  // Obsidian's menu dismiss handler observes the click that opened the menu.
  // Queue the actual show call so that handler cannot immediately close it.
  menuWindow.setTimeout(() => {
    if (!anchorEl.isConnected) {
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, menuDocument);
  }, 0);
}

/**
 * 套用檢視預設集：把 (viewMode, depthMode, contentMode) 寫入目前 view 並
 * 持久化到該 folder 的 per-folder 記錄（files→flat 由 presetToState 確保一致）。
 */
export function applyFolderSpacePreset(view: PatchedExplorerView, preset: FolderSpacePreset): void {
  const state = presetToState(preset);
  setViewMode(view, state.viewMode);
  setDepthMode(view, state.depthMode);
  setContentMode(view, state.contentMode);
}

/**
 * Resolves a persisted panel identity value. `null`/missing values yield
 * `undefined` (keep the current value); valid non-empty strings are returned
 * as-is.
 */
function normalizePanelId(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function refreshChildBindingUI(view: PatchedExplorerView): void {
  const button = view.followParentButtonEl;
  if (!button) {
    return;
  }

  button.toggle(Boolean(view.parentPanelId));
  if (!view.parentPanelId) {
    return;
  }

  updateFollowParentButton(view);
}

function refreshSyncFocusMarker(view: PatchedExplorerView): void {
  view.syncFocusDecorationObserver?.disconnect();
  view.syncFocusDecorationObserver = undefined;
  view.syncFocusItem?.selfEl.removeClass("folder-spaces-sync-focus");
  view.syncFocusItem?.selfEl.removeClass("folder-spaces-sync-has-tail");
  view.syncFocusIconEl?.remove();
  view.syncFocusHeaderEl?.removeClass("folder-spaces-sync-focus");
  view.syncFocusItem = undefined;
  view.syncFocusIconEl = undefined;
  view.syncFocusHeaderEl = undefined;

  const manager = view.bindingManager;
  if (!manager) {
    return;
  }

  const child = manager.getChildOf(view.panelId);
  if (!child || !child.followParent) {
    return;
  }

  // The child's current scope is the source of truth. The child can change
  // its folder from the path header, independently of the parent tree, and
  // the parent must follow that latest path for the marker to stay accurate.
  const targetPath = child.getFolderPath();
  const rootFolder = getRootFolder(view);
  if (!rootFolder || targetPath === null || !isInsideRoot(view, targetPath)) {
    return;
  }

  if (targetPath === view.folderPath) {
    view.folderPathEl.addClass("folder-spaces-sync-focus");
    view.syncFocusHeaderEl = view.folderPathEl;
    return;
  }

  const targetItem = findSyncFocusItem(view, rootFolder, targetPath);
  if (!targetItem) {
    return;
  }

  targetItem.selfEl.addClass("folder-spaces-sync-focus");
  const iconEl = targetItem.selfEl.createDiv({
    cls: "folder-spaces-sync-source-icon",
    attr: {
      "aria-label": t("actionSyncSourceFolder"),
      "data-tooltip": t("actionSyncSourceFolder")
    }
  });
  setIcon(iconEl, "link-2");
  view.syncFocusItem = targetItem;
  view.syncFocusIconEl = iconEl;
  view.syncFocusDecorationObserver = new MutationObserver((mutations) => {
    // Ignore the class mutation caused by updateSyncFocusSpacing itself;
    // otherwise the observer can continuously retrigger during startup.
    if (mutations.every((mutation) => mutation.type === "attributes" && mutation.attributeName === "class")) {
      return;
    }
    updateSyncFocusSpacing(view);
  });
  view.syncFocusDecorationObserver.observe(targetItem.selfEl, {
    attributes: true,
    childList: true,
    subtree: true
  });
  updateSyncFocusSpacing(view);
}

function updateSyncFocusSpacing(view: PatchedExplorerView): void {
  const item = view.syncFocusItem;
  const icon = view.syncFocusIconEl;
  if (!item || !icon) {
    return;
  }

  const children = Array.from(item.selfEl.children);
  const iconIndex = children.indexOf(icon);
  const hasTrailingElement = iconIndex >= 0 && children.slice(iconIndex + 1).length > 0;
  const afterStyle = getComputedStyle(item.selfEl, "::after");
  const afterContent = afterStyle.content;
  const hasTrailingPseudo = Boolean(
    afterContent &&
      afterContent !== "none" &&
      afterContent !== "normal" &&
      afterContent !== "\"\"" &&
      afterStyle.display !== "none" &&
      afterStyle.visibility !== "hidden" &&
      afterStyle.opacity !== "0"
  );

  item.selfEl.toggleClass(
    "folder-spaces-sync-has-tail",
    hasTrailingElement || hasTrailingPseudo
  );
}

function findSyncFocusItem(
  view: PatchedExplorerView,
  rootFolder: TFolder,
  targetPath: string
): InternalTreeItem | null {
  let file = view.app.vault.getAbstractFileByPath(targetPath);
  if (file instanceof TFile) {
    file = file.parent;
  }

  while (file instanceof TFolder && file !== rootFolder) {
    if (!isInsideRoot(view, file.path)) {
      return null;
    }

    const depthLimit = getFolderDepthLimit(view.depthMode);
    const depth = getFolderDepthFromRoot(rootFolder, file);
    if ((depthLimit === null || depth <= depthLimit) && view.contentMode !== "files") {
      const item = view.fileItems[file.path];
      if (item) {
        return item;
      }
    }

    file = file.parent;
  }

  return null;
}

function updateFollowParentButton(view: PatchedExplorerView): void {
  const button = view.followParentButtonEl;
  if (!button || !view.parentPanelId) {
    return;
  }

  const label = t("actionSyncFollowParent");
  button.toggleClass("is-active", view.followParent);
  button.setAttr("aria-pressed", String(view.followParent));
  button.setAttr("aria-label", label);
  button.setAttr("data-tooltip", label);
  button.empty();
  setIcon(button, view.followParent ? "lucide-link" : "lucide-unlink");
}


async function createFolderSpaceFile(
  view: PatchedExplorerView,
  kind: "file" | "folder",
  event: MouseEvent
): Promise<void> {
  event.preventDefault();
  event.stopImmediatePropagation();

  const rootFolder = getRootFolder(view);
  if (!rootFolder) {
    new Notice(t("rootUnavailable"));
    return;
  }

  const focusedCandidate = toFolderSpaceCreationCandidate(view.tree.focusedItem?.file ?? null);
  const activeCandidate = toFolderSpaceCreationCandidate(view.app.workspace.getActiveFile());
  const targetPath = chooseFolderSpaceCreationTarget(view.folderPath, focusedCandidate, activeCandidate);
  const targetFolder =
    targetPath === "" ? view.app.vault.getRoot() : targetPath ? view.app.vault.getAbstractFileByPath(targetPath) : null;

  if (!(targetFolder instanceof TFolder)) {
    new Notice(t("rootUnavailable"));
    return;
  }

  const newLeaf = kind === "file" ? Keymap.isModEvent(event) || "tab" : false;
  try {
    await view.createAbstractFile(kind, targetFolder, newLeaf);
  } catch (error) {
    console.warn("[folder-spaces] Unable to create file/folder:", error);
    new Notice(t("rootUnavailable"));
  }
}

function toFolderSpaceCreationCandidate(file: TAbstractFile | null): FolderSpaceCreationCandidate | null {
  if (file instanceof TFolder) {
    return { path: file.path, kind: "folder", parentPath: file.parent?.path ?? null };
  }

  if (file instanceof TFile) {
    return { path: file.path, kind: "file", parentPath: file.parent?.path ?? null };
  }

  return null;
}

function clearFlatFolderCreatePath(view: PatchedExplorerView, folder: TFolder): void {
  clearFlatItemInlineEditorPath(view, folder);
}

function clearFlatItemInlineEditorPath(
  view: PatchedExplorerView,
  file: TAbstractFile,
  preferredEditor?: HTMLElement
): void {
  let attempts = 0;
  const apply = () => {
    const isFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
    if (!isFlatRendering) {
      return;
    }

    const item = view.fileItems[file.path];
    const labelEl = item ? getItemLabelElement(item) : null;
    const editor = preferredEditor?.isConnected ? preferredEditor :
      (labelEl?.matches("input,[contenteditable=\"true\"]") ? labelEl :
        labelEl?.querySelector<HTMLElement>("input,[contenteditable=\"true\"]")) ??
      Array.from(view.navFileContainerEl.querySelectorAll<HTMLElement>("input,[contenteditable=\"true\"]")).find(
        (candidate) => candidate.closest<HTMLElement>(".tree-item-self")?.dataset.path === file.path
      );

    if (editor) {
      if (view.flatRenameEditors?.has(editor)) {
        return;
      }
      view.flatRenameEditors?.add(editor);

      if (editor.matches("input")) {
        const input = editor as HTMLInputElement;
        input.value = file.name;
        if (file instanceof TFile && file.extension) {
          const dotIndex = file.name.lastIndexOf(".");
          if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
          } else {
            input.select();
          }
        } else {
          input.select();
        }
      } else {
        editor.textContent = file.name;
        const selection = editor.ownerDocument.getSelection();
        if (selection) {
          const range = editor.ownerDocument.createRange();
          range.selectNodeContents(editor);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      return;
    }

    // 原生 File Explorer 的 rename editor 可能在下一個 render tick 才出現。
    if (attempts++ < 4) {
      window.setTimeout(apply, 50);
    }
  };

  window.setTimeout(apply, 0);
}

function registerFlatRenameEditorOverride(view: PatchedExplorerView): void {
  view.registerDomEvent(
    view.navFileContainerEl,
    "focusin",
    (event: FocusEvent) => {
      const isFlatRendering = view.viewMode === "flat" || view.contentMode === "files";
      if (!isFlatRendering || !(event.target instanceof HTMLElement)) {
        return;
      }

      const selfEl = event.target.closest<HTMLElement>(".tree-item-self.is-being-renamed");
      const itemPath = selfEl?.dataset.path;
      const file = itemPath ? view.app.vault.getAbstractFileByPath(itemPath) : null;
      if (file instanceof TAbstractFile) {
        clearFlatItemInlineEditorPath(view, file, event.target);
      }
    },
    { capture: true }
  );
}

function registerFileOpenOverride(view: PatchedExplorerView): void {
  view.registerDomEvent(
    view.navFileContainerEl,
    "click",
    (event: MouseEvent) => openFileFromFolderSpace(view, event),
    { capture: true }
  );
  view.registerDomEvent(
    view.navFileContainerEl,
    "auxclick",
    (event: MouseEvent) => openFileFromFolderSpace(view, event),
    { capture: true }
  );
}

/**
 * Lets a parent panel drive its bound child's folder focus and keeps the
 * parent's own tree from toggling at the same time. Two listeners cooperate:
 *
 * - A **window capture** listener (`followParentScopeOnFolderClick`) pushes a
 *   plain left-click on a folder's name down to the bound child as its new
 *   scope. It is registered on the window in the capture phase, which always
 *   fires before document-level interception (e.g. the Folder Notes plugin
 *   stops propagation on the document for clicks on a folder's name). It never
 *   stops the event, so downstream plugins are left free to react.
 * - A **container capture** listener (`blockParentToggleOnFolderNameClick`)
 *   consumes the same click so the parent's own tree does not collapse/expand.
 *   It lives on the tree container, so it only runs when no earlier
 *   document-level interceptor already handled the click: the Folder Notes
 *   plugin, which opens a folder note and blocks the toggle itself, is never
 *   interfered with.
 *
 * Both are gated on a bound child with its "sync focus with parent panel"
 * toggle ON. A click on the collapse chevron (`.collapse-icon`) still toggles
 * the parent and never drives the child; modifier clicks and clicks outside
 * this panel's tree keep their native behavior.
 */
function registerParentScopeFollowOverride(view: PatchedExplorerView): void {
  const win = view.containerEl.ownerDocument.defaultView;
  if (!win) {
    return;
  }
  view.registerDomEvent(
    win,
    "click",
    (event: MouseEvent) => followParentScopeOnFolderClick(view, event),
    { capture: true }
  );
  view.registerDomEvent(
    view.navFileContainerEl,
    "click",
    (event: MouseEvent) => blockParentToggleOnFolderNameClick(view, event),
    { capture: true }
  );
}

function followParentScopeOnFolderClick(view: PatchedExplorerView, event: MouseEvent): void {
  const manager = view.bindingManager;
  if (!manager) {
    return;
  }

  const child = manager.getChildOf(view.panelId);
  if (!child || !child.followParent) {
    return;
  }

  const folderPath = resolveClickedFolderPath(view.navFileContainerEl, view.files, event);
  if (folderPath) {
    manager.propagateFrom(view.panelId, folderPath);
  }
}

/**
 * Consumes a folder-name click at the tree container so the parent's own tree
 * does not collapse/expand while it navigates a bound child. This listener
 * lives on the container in the capture phase: it only fires when no earlier
 * document-level interceptor (e.g. the Folder Notes plugin) already handled
 * the click, so it never blocks plugins that open a folder note.
 */
function blockParentToggleOnFolderNameClick(view: PatchedExplorerView, event: MouseEvent): void {
  const manager = view.bindingManager;
  if (!manager) {
    return;
  }

  const child = manager.getChildOf(view.panelId);
  if (!child || !child.followParent) {
    return;
  }

  if (resolveClickedFolderPath(view.navFileContainerEl, view.files, event)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * Resolves the path of the folder a plain left-click landed on inside a file
 * explorer tree. Shared between Folder Space panels (whose parent scope drives
 * a bound child) and the native File Explorer (which also acts as a parent
 * panel). Returns `null` for modifier clicks and for clicks on the collapse
 * chevron (`.collapse-icon`), which keep their native toggle behavior and never
 * drive a child panel.
 *
 * Obsidian writes the authoritative `data-path` attribute on the folder title
 * element itself, so it is preferred over the `files` DOM map — plugins that
 * re-parent or clone tree items (folder notes, icon packs, ...) can break the
 * map lookup without affecting `data-path`.
 */
export function resolveClickedFolderPath(
  containerEl: HTMLElement,
  files: Map<HTMLElement, TAbstractFile> | undefined,
  event: MouseEvent
): string | null {
  if (event.button !== 0 || Keymap.isModEvent(event)) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  // A click on the collapse chevron toggles the parent's tree; it never drives
  // a bound child panel.
  if (target.closest(".collapse-icon")) {
    return null;
  }

  const folderTitleEl = target.closest<HTMLElement>(".nav-folder-title");
  if (!folderTitleEl || !containerEl.contains(folderTitleEl)) {
    return null;
  }

  const dataPath = folderTitleEl.getAttribute("data-path");
  if (dataPath) {
    return dataPath;
  }

  const treeItemEl = folderTitleEl.closest<HTMLElement>(".tree-item");
  const file = treeItemEl ? files?.get(treeItemEl) : undefined;
  return file instanceof TFolder ? file.path : null;
}




export function getVisibleTreeItems(view: PatchedExplorerView): InternalTreeItem[] {
  return getVisibleTreeItemsHelper(view.navFileContainerEl, view.files, view.fileItems);
}

export function registerTreeNavigationOverride(view: PatchedExplorerView): void {
  const tree = view.tree;
  if (!tree || typeof tree.changeFocusedItem !== "function") {
    return;
  }

  const originalChangeFocusedItem = tree.changeFocusedItem.bind(tree);

  tree.changeFocusedItem = function (direction: "forwards" | "backwards") {
    const visibleItems = getVisibleTreeItems(view);
    if (visibleItems.length === 0) {
      originalChangeFocusedItem(direction);
      return;
    }

    const rootFolder = getRootFolder(view);
    const target = computeNextFocusedItem(visibleItems, tree.focusedItem, direction, rootFolder?.path);
    if (target) {
      tree.setFocusedItem(target);
    }
  };

  const treeNav = tree as unknown as {
    onKeyArrowLeft?: (event: KeyboardEvent) => void;
  };
  if (typeof treeNav.onKeyArrowLeft === "function") {
    const originalOnKeyArrowLeft = treeNav.onKeyArrowLeft.bind(treeNav);
    treeNav.onKeyArrowLeft = function (event: KeyboardEvent) {
      const rootFolder = getRootFolder(view);
      const item = tree.focusedItem;

      if (item && item.parent && rootFolder && item.parent.file?.path === rootFolder.path) {
        if (!item.collapsed && typeof item.setCollapsed === "function") {
          void item.setCollapsed(true, true);
          event.preventDefault();
          return;
        }
        event.preventDefault();
        return;
      }

      originalOnKeyArrowLeft(event);
    };
  }
}

function openFileFromFolderSpace(view: PatchedExplorerView, event: MouseEvent): void {
  if (event.button !== 0 && event.button !== 1) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const fileTitleEl = target.closest<HTMLElement>(".nav-file-title");
  if (!fileTitleEl || !view.navFileContainerEl.contains(fileTitleEl)) {
    return;
  }

  const treeItemEl = fileTitleEl.closest<HTMLElement>(".tree-item");
  const file = treeItemEl ? view.files.get(treeItemEl) : undefined;
  const item = file instanceof TFile ? view.fileItems[file.path] : undefined;
  if (!(file instanceof TFile) || !item) {
    return;
  }

  if (view.tree.handleItemSelection(event, item)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  const requestedPane = event.button === 1 ? true : Keymap.isModEvent(event);
  void openFileInContentArea(view, file, requestedPane);
}

async function openFileInContentArea(
  view: PatchedExplorerView,
  file: TFile,
  requestedPane: boolean | PaneType
): Promise<void> {
  try {
    const workspace = view.app.workspace;
    let leaf: WorkspaceLeaf | null = null;

    if (requestedPane === "window") {
      leaf = workspace.getLeaf("window");
    } else if (requestedPane === true || requestedPane === "tab") {
      leaf = workspace.getLeaf("tab");
    } else if (requestedPane === "split") {
      leaf = workspace.getLeaf("split");
    } else {
      leaf = workspace.getLeaf(false);
    }

    if (!leaf) {
      leaf = workspace.getLeaf("tab");
    }

    await leaf.openFile(file, { active: true });
  } catch (error) {
    console.warn("[folder-spaces] Unable to open file:", file.path, error);
    new Notice(t("rootUnavailable"));
  }
}

function isPinnedLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.getViewState().pinned === true;
}

function getPanelActivityTracker(workspace: App["workspace"]): PanelActivityTracker {
  const existingTracker = panelActivityTrackers.get(workspace);
  if (existingTracker) {
    return existingTracker;
  }

  const tracker = new PanelActivityTracker(workspace, isFolderSpaceLeaf);
  panelActivityTrackers.set(workspace, tracker);

  return tracker;
}

function isFolderSpaceLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.getViewState().type === FOLDER_SPACES_VIEW_TYPE;
}

function registerRootContextMenuOverride(view: PatchedExplorerView): void {
  view.registerDomEvent(
    view.navFileContainerEl,
    "contextmenu",
    (event: MouseEvent & { targetNode?: EventTarget | null }) => {
      const target = event.targetNode ?? event.target;
      if (target !== view.navFileContainerEl) {
        return;
      }

      const rootFolder = getRootFolder(view);
      if (!rootFolder) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      view.tree.clearSelectedDoms();
      view.tree.setFocusedItem(null);
      openRootFolderContextMenu(view, event, rootFolder);
    },
    { capture: true }
  );
}

function patchRootFolderMenu(menu: Menu, view: PatchedExplorerView, rootFolder: TFolder): void {
  const items = (
    menu as unknown as {
      items?: Array<{
        titleEl?: HTMLElement;
        onClick?: (evt: MouseEvent) => void;
        callback?: (evt: MouseEvent) => void;
      }>;
    }
  ).items;

  if (!Array.isArray(items)) {
    return;
  }

  for (const item of items) {
    const text = item.titleEl?.textContent?.toLowerCase() ?? "";
    if (text.includes("rename") || text.includes("命名")) {
      const customRename = (evt: MouseEvent) => {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        menu.hide();
        startInlineRootFolderRename(view, rootFolder);
      };

      const menuItemEl = getMenuItemElement(item);
      if (menuItemEl) {
        menuItemEl.addEventListener("click", customRename, { capture: true, once: true });
      }

      // Keep the private callback replacement as a fallback for menu
      // implementations that do not expose a DOM item (for example native menus).
      item.onClick = customRename;
      item.callback = customRename;
    }
  }
}

function getMenuItemElement(item: { titleEl?: HTMLElement }): HTMLElement | null {
  const privateItem = item as { dom?: HTMLElement; el?: HTMLElement };
  return (
    privateItem.dom ??
    privateItem.el ??
    item.titleEl?.closest<HTMLElement>(".menu-item") ??
    null
  );
}

function patchFlatFolderMenu(menu: Menu, view: PatchedExplorerView, folder: TFolder): void {
  const items = getMenuItems(menu);
  if (!items) {
    return;
  }

  for (const item of items) {
    const text = item.titleEl?.textContent?.toLowerCase() ?? "";
    if (isRenameMenuText(text)) {
      wrapMenuItem(item, (original, evt) => {
        menu.hide();
        const folderItem = view.fileItems[folder.path];
        if (folderItem) {
          startFlatFolderRename(view, folder, folderItem);
          return;
        }
        return original?.(evt);
      });
    } else if (isMakeCopyMenuText(text)) {
      wrapMenuItem(item, (original, evt) => {
        menu.hide();
        restoreFlatItemParents(view);
        restoreFlatItemLabels(view);
        const result = original?.(evt);
        if (result instanceof Promise) {
          void result.finally(() => scheduleFlatRefresh(view, "immediate"));
        } else {
          scheduleFlatRefresh(view, "immediate");
        }
        return result;
      });
    }
  }
}

function getMenuItems(menu: Menu): Array<{
  titleEl?: HTMLElement;
  onClick?: (evt: MouseEvent) => unknown;
  callback?: (evt: MouseEvent) => unknown;
}> | null {
  const items = (
    menu as unknown as {
      items?: Array<{
        titleEl?: HTMLElement;
        onClick?: (evt: MouseEvent) => unknown;
        callback?: (evt: MouseEvent) => unknown;
      }>;
    }
  ).items;

  return Array.isArray(items) ? items : null;
}

function wrapMenuItem(
  item: {
    onClick?: (evt: MouseEvent) => unknown;
    callback?: (evt: MouseEvent) => unknown;
  },
  wrapper: (original: ((evt: MouseEvent) => unknown) | undefined, evt: MouseEvent) => unknown
): void {
  const originalOnClick = item.onClick;
  const originalCallback = item.callback;
  const original = originalOnClick ?? originalCallback;
  const wrapped = (evt: MouseEvent) => wrapper(original, evt);

  if (originalOnClick) {
    item.onClick = wrapped;
  }
  if (originalCallback) {
    item.callback = wrapped;
  }
}

/**
 * The native "Search in folder" context menu item always docks the search
 * view in the main window's left sidebar (workspace.ensureSideLeaf). When the
 * Folder Space lives in a popout window, re-route the item so the search panel
 * opens inside that same popout window instead. The item is identified by its
 * "lucide-folder-search" icon, which is locale-independent.
 */
function patchSearchInFolderItem(menu: Menu, view: PatchedExplorerView, folder: TFolder): void {
  const items = getMenuItems(menu);
  if (!items) {
    return;
  }

  for (const item of items) {
    const menuItemEl = getMenuItemElement(item);
    const iconClass = menuItemEl?.querySelector<SVGElement>(".menu-item-icon svg")?.getAttribute("class") ?? "";
    if (!iconClass.includes("folder-search")) {
      continue;
    }

    wrapMenuItem(item, () => {
      void openFolderSpaceSearch(view, folder);
    });
    break;
  }
}

async function openFolderSpaceSearch(view: PatchedExplorerView, folder: TFolder): Promise<void> {
  const query = `path:"${folder.path}/" `;
  const workspace = view.app.workspace;
  const win = getWindowOfLeaf(view.leaf);

  try {
    const leaf = view.openSearchInWindow && win
      ? await view.openSearchInWindow(win, query)
      : workspace.getLeavesOfType("search").find((candidate) => getWindowOfLeaf(candidate) === win) ??
        workspace.getLeaf("tab");
    await leaf.setViewState({ type: "search", state: { query } });
    await workspace.revealLeaf(leaf);
    // Obsidian's workspace drag handler only lets views that are ItemViews be
    // dropped into the editor workspace; popout windows have no left/right
    // sidebar, so without this the search panel cannot be dragged between
    // splits/tab groups inside the popout.
    if (leaf.view) {
      makeDockable(leaf.view);
    }
    makeLeafUnreusable(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
  } catch (error) {
    console.warn("[folder-spaces] Unable to open search in Folder Space window:", error);
    new Notice(t("rootUnavailable"));
  }
}

/**
 * Obsidian's workspace drag handler only lets views that are ItemViews be
 * dropped into the editor workspace. Popout windows have no left/right
 * sidebar, so native sidebar views (search, tag, outline, backlink, ...)
 * living there must also be made dockable. This is normally applied when a
 * view is opened from a popout window, but views restored from a saved layout
 * (e.g. via Window Spaces) are created natively and need the bridge applied
 * again.
 *
 * At the same time, non-file panels in a popout must never be reused as native
 * file-open targets: `getUnpinnedLeaf()` reuses the active leaf when
 * `canNavigate()` returns true, which would let an opened note replace a
 * backlink / outgoing link / search panel inside the popout. Only those panels
 * get `canNavigate()` forced to false; file views keep it so an opened note
 * still replaces an unpinned note tab, matching normal Obsidian behavior.
 */
const POPOUT_SIDEBAR_VIEW_TYPES = new Set([
  "search",
  "tag",
  "outline",
  "backlink",
  "outgoing-link",
  "all-properties",
  "bookmarks",
  "footnotes",
  "file-explorer"
]);

export function makePopoutViewsProtected(workspace: App["workspace"]): void {
  workspace.iterateAllLeaves((leaf) => {
    if (!isPopoutWindow(getWindowOfLeaf(leaf))) {
      return;
    }

    if (isPopoutPanelLeaf(leaf)) {
      makeLeafUnreusable(leaf);
    }

    const viewType = leaf.getViewState().type;
    if (!POPOUT_SIDEBAR_VIEW_TYPES.has(viewType)) {
      return;
    }

    const view = leaf.view;
    if (view instanceof ItemView) {
      return;
    }

    if (view && view.getViewType() === viewType) {
      makeDockable(view);
      return;
    }

    // The view may still be deferred; load it (without activating) first.
    void leaf
      .loadIfDeferred()
      .then(() => {
        if (leaf.view && leaf.view.getViewType() === viewType) {
          makeDockable(leaf.view);
        }
      })
      .catch(() => {});
  });
}

/**
 * A leaf in a popout window that must never be reused as a file-open target:
 * any loaded non-file view (search, tag, outline, ...), any file-associated
 * panel that extends FileView but is not navigable (backlink, outline,
 * outgoing-link), or a deferred known sidebar panel.
 */
function isPopoutPanelLeaf(leaf: WorkspaceLeaf): boolean {
  const view = leaf.view;
  if (view && view.getViewType() !== "empty") {
    if (!(view instanceof FileView)) {
      return true;
    }
    return (
      !isPinnedLeaf(leaf) &&
      (leaf as WorkspaceLeaf & { canNavigate?: () => boolean }).canNavigate?.() === false
    );
  }
  return POPOUT_SIDEBAR_VIEW_TYPES.has(leaf.getViewState().type);
}

function isRenameMenuText(text: string): boolean {
  return text.includes("rename") || text.includes("命名");
}

function isMakeCopyMenuText(text: string): boolean {
  return (
    text.includes("make a copy") ||
    text.includes("duplicate") ||
    text.includes("副本") ||
    text.includes("複本")
  );
}

function startFlatFolderRename(
  view: PatchedExplorerView,
  folder: TFolder,
  item: InternalTreeItem
): void {
  const existingInput = view.flatRenameInputEl;
  if (existingInput?.isConnected) {
    existingInput.focus();
    existingInput.select();
    return;
  }

  const labelEl = getItemLabelElement(item);
  if (!labelEl) {
    return;
  }

  // Restore only the target item's native text node. Other flat labels keep
  // their relative paths while this folder is being renamed.
  restoreFlatItemLabel(view, item);
  const displayLabel = getFlatFolderLabel(view, folder);
  let finished = false;

  labelEl.addClass("folder-spaces-flat-rename-target");
  labelEl.empty();
  const inputEl = labelEl.createEl("input", {
    type: "text",
    value: folder.name,
    cls: "folder-spaces-flat-rename-input",
    attr: {
      "aria-label": t("renameFolderTitle"),
      spellcheck: "false"
    }
  });
  view.flatRenameInputEl = inputEl;

  const restore = (nextDisplayLabel = displayLabel) => {
    if (view.flatRenameInputEl === inputEl) {
      view.flatRenameInputEl = undefined;
    }

    labelEl.removeClass("folder-spaces-flat-rename-target");
    labelEl.empty();
    labelEl.setText(folder.name);
    setFlatItemLabel(view, item, nextDisplayLabel);
  };

  const commit = async () => {
    if (finished) {
      return;
    }

    finished = true;
    const nextName = inputEl.value.trim();
    if (!nextName || nextName === folder.name) {
      restore();
      return;
    }

    const parentPath = folder.parent && !folder.parent.isRoot() ? `${folder.parent.path}/` : "";
    const newPath = `${parentPath}${nextName}`;
    try {
      await view.app.fileManager.renameFile(folder, newPath);
      void view.setFolderViewMode(newPath, view.viewMode);
      restore(getFlatFolderLabel(view, folder));
      scheduleFlatRefresh(view, "immediate");
    } catch (error) {
      restore();
      new Notice(`Failed to rename folder: ${String(error)}`);
    }
  };

  const cancel = () => {
    if (finished) {
      return;
    }

    finished = true;
    restore();
  };

  inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });
  inputEl.addEventListener("blur", () => void commit(), { once: true });

  inputEl.focus();
  inputEl.select();
  clearFlatItemInlineEditorPath(view, folder, inputEl);
}

function startInlineRootFolderRename(view: PatchedExplorerView, rootFolder: TFolder): void {
  const existingInput = view.rootRenameInputEl;
  if (existingInput?.isConnected) {
    existingInput.focus();
    existingInput.select();
    return;
  }

  const parentFolder = rootFolder.parent;
  const parentPath = !parentFolder || parentFolder.isRoot() ? "" : `${parentFolder.path}/`;
  const originalPath = rootFolder.path;
  const labelEl = view.folderPathTextEl;

  let finished = false;

  labelEl.empty();
  labelEl.addClass("is-editing");
  if (parentPath) {
    labelEl.createSpan({
      cls: "folder-spaces-inline-rename-prefix",
      text: parentPath
    });
  }

  const inputEl = labelEl.createEl("input", {
    type: "text",
    value: rootFolder.name,
      cls: "folder-spaces-inline-rename-input",
    attr: {
      "aria-label": t("renameFolderTitle"),
      spellcheck: "false"
    }
  });
  view.rootRenameInputEl = inputEl;

  const restore = (path: string = originalPath) => {
    if (view.rootRenameInputEl === inputEl) {
      view.rootRenameInputEl = undefined;
    }
    labelEl.removeClass("is-editing");
    labelEl.empty();
    renderFolderPathTitle(view, path);
  };

  const commit = async () => {
    if (finished) {
      return;
    }

    finished = true;
    const trimmed = inputEl.value.trim();
    if (!trimmed || trimmed === rootFolder.name) {
      restore();
      return;
    }

    const newPath = `${parentPath}${trimmed}`;
    try {
      await view.app.fileManager.renameFile(rootFolder, newPath);
      void view.setFolderViewMode(newPath, view.viewMode);
      restore(newPath);
      await view.setState({ ...view.getState(), folderPath: newPath }, { history: false });
      refreshLeafHeader(view);
    } catch (err) {
      restore();
      new Notice(`Failed to rename folder: ${String(err)}`);
    }
  };

  const cancel = () => {
    if (finished) {
      return;
    }

    finished = true;
    restore();
  };

  inputEl.addEventListener("click", (event) => event.stopPropagation());
  inputEl.addEventListener("contextmenu", (event) => event.stopPropagation());
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  });
  inputEl.addEventListener("blur", () => void commit());

  inputEl.focus();
  inputEl.select();
}

function openRootFolderContextMenu(
  view: PatchedExplorerView,
  event: MouseEvent,
  rootFolder: TFolder
): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const handler = (menu: Menu, file: TAbstractFile) => {
    if (file === rootFolder) {
      patchRootFolderMenu(menu, view, rootFolder);
    }
  };

  const menuWindow = getWindowOfLeaf(view.leaf) ?? event.view;
  if (!menuWindow) {
    return;
  }

  view.app.workspace.on("file-menu", handler);

  // The native File Explorer menu installs global dismissal listeners. If it
  // is opened synchronously from the header's contextmenu/click event, those
  // listeners can observe the source gesture and hide the newly-created menu.
  // Also hide the synthetic root item while asking the native explorer to
  // build the menu; this preserves the blank-area behavior used by the
  // original implementation.
  menuWindow.setTimeout(() => {
    const rootItem = view.fileItems[rootFolder.path];
    if (rootItem) {
      delete view.fileItems[rootFolder.path];
    }

    try {
      if (view.leaf?.view === view) {
        view.onFileContextMenu(event, rootFolder);
      }
    } finally {
      if (rootItem) {
        view.fileItems[rootFolder.path] = rootItem;
      }
      view.app.workspace.off("file-menu", handler);
    }
  }, 0);
}

function refreshFolderPresentation(view: PatchedExplorerView, saveLayout: boolean): void {
  const rootFolder = getRootFolder(view);
  const hasRootFolder = Boolean(rootFolder);

  view.navFileContainerEl.toggle(hasRootFolder);
  view.folderPathEl.toggle(view.folderPath !== null);
  if (!view.rootRenameInputEl?.isConnected) {
    view.rootRenameInputEl = undefined;
    view.folderPathTextEl.removeClass("is-editing");
    renderFolderPathTitle(view, view.folderPath ?? "");
  }

  view.rootEmptyStateEl.toggle(!hasRootFolder);
  view.rootEmptyTitleEl.setText(
    view.folderPath && !hasRootFolder ? t("emptyMissingTitle") : t("emptyTitle")
  );
  view.rootEmptyDescriptionEl.setText(t("emptyDescription"));
  updateViewSettingsButton(view);
  syncFolderIconButton(view);

  if (saveLayout) {
    void view.app.workspace.requestSaveLayout();
    refreshLeafHeader(view);
    view.requestSort();
  }
}

function syncFolderIconButton(view: PatchedExplorerView): void {
  const button = view.folderIconButtonEl;
  if (!button) {
    return;
  }
  button.empty();
  setIcon(button, view.getIcon());
}

/**
 * Obsidian adds ItemView actions through `addAction`, which expects a
 * `.view-actions` element inside the view header. The native File Explorer
 * header (reused by Folder Space views) does not provide one, so Obsidian's
 * mass `updateTabHeaders` crashes with a `.prepend` error. Insert the action
 * into the existing nav-buttons container instead.
 */
function addFolderSpaceAction(
  view: PatchedExplorerView,
  icon: string,
  title: string,
  callback: (evt: MouseEvent) => unknown
): HTMLElement | null {
  const navButtonsEl = view.headerDom?.navButtonsEl;
  if (!navButtonsEl) {
    return null;
  }
  const actionEl = navButtonsEl.createEl("button", {
    cls: "clickable-icon view-action",
    attr: { "aria-label": title, "data-tooltip": title }
  });
  setIcon(actionEl, icon);
  actionEl.addEventListener("click", (evt: MouseEvent) => callback(evt));
  return actionEl;
}

function refreshLeafHeader(view: PatchedExplorerView): void {
  const leafWithHeader = view.leaf as WorkspaceLeaf & { updateHeader?: () => void };
  try {
    leafWithHeader.updateHeader?.();
  } catch (error) {
    console.warn("[folder-spaces] Header update failed:", error);
  }
  updateFolderSpaceLeafTooltip(view.leaf, view.folderPath);
}

function renderFolderPathTitle(view: PatchedExplorerView, path: string): void {
  const title = getFolderSpaceTitle(view.app, path);
  view.folderPathTextEl.setText(title);

  if (!path || path === "") {
    setTooltip(view.folderPathTextEl, "/");
  } else {
    setTooltip(view.folderPathTextEl, path);
  }
}

export function updateFolderSpaceLeafTooltip(
  leaf: WorkspaceLeaf,
  folderPath: string | null | undefined
): void {
  const tabHeaderEl = (leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement }).tabHeaderEl;
  if (!tabHeaderEl) {
    return;
  }
  if (!folderPath || folderPath === "") {
    setTooltip(tabHeaderEl, "/");
    return;
  }
  setTooltip(tabHeaderEl, folderPath);
}

function sortNestedFolders(view: PatchedExplorerView): void {
  for (const item of Object.values(view.fileItems)) {
    if (typeof item.sort === "function") {
      item.sort();
    }
  }
}


function renderChildren(view: PatchedExplorerView, items: InternalTreeItem[]): void {
  const scrollTop = view.navFileContainerEl.scrollTop;
  view.tree.infinityScroll.rootEl.vChildren.setChildren(items);
  view.navFileContainerEl.scrollTop = scrollTop;
  view.tree.infinityScroll.compute();
  refreshSyncFocusMarker(view);
}

function getFlatItems(view: PatchedExplorerView, rootFolder: TFolder): InternalTreeItem[] {
  restoreFlatItemParents(view);
  restoreFlatItemLabels(view);

  const rootItem = view.fileItems[rootFolder.path] ?? null;
  const flatItems: InternalTreeItem[] = [];
  const showFolders = view.contentMode !== "files";
  const showFiles = view.contentMode !== "folders";

  const rememberParent = (item: InternalTreeItem, parent: InternalTreeItem | null): void => {
    view.flatItemParents ??= new Map();
    view.flatItemParents.set(item, item.parent);
    item.parent = parent;
  };

  const collectFolderGroup = (folder: TFolder, relativePath: string, depth: number = 1): void => {
    const folderItem = view.fileItems[folder.path];
    if (folderItem && showFolders) {
      rememberParent(folderItem, rootItem);
      setFlatItemLabel(view, folderItem, relativePath);
      syncFlatFolderCollapseState(folderItem);
      flatItems.push(folderItem);
    }

    if (showFiles) {
      // When folders are hidden, files lose their folder group and are
      // promoted to the root level instead.
      const fileParent = showFolders ? folderItem ?? rootItem : rootItem;
      const files = folder.children
        .filter((file): file is TFile => file instanceof TFile)
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
        );
      for (const file of files) {
        const fileItem = view.fileItems[file.path];
        if (fileItem) {
          rememberParent(fileItem, fileParent);
          if (!showFolders) {
            const fileName = view.viewMode === "flat" ? file.basename : file.name;
            setFlatItemLabel(view, fileItem, `${relativePath}/${fileName}`);
            flatItems.push(fileItem);
          }
        }
      }
    }

    const depthLimit = getFolderDepthLimit(view.depthMode);
    if (depthLimit !== null && depth >= depthLimit) {
      return;
    }

    const childFolders = folder.children
      .filter((file): file is TFolder => file instanceof TFolder)
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      );

    for (const child of childFolders) {
      const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
      collectFolderGroup(child, childRelativePath, depth + 1);
    }
  };

  const rootFolders = rootFolder.children
    .filter((file): file is TFolder => file instanceof TFolder)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
    );
  if (showFolders || getFolderDepthLimit(view.depthMode) !== 1) {
    for (const folder of rootFolders) {
      collectFolderGroup(folder, folder.name, 1);
    }
  }

  if (showFiles) {
    // Files directly under the folder space have no folder row to attach to.
    const rootFiles = rootFolder.children
      .filter((file): file is TFile => file instanceof TFile)
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      );
    for (const file of rootFiles) {
      const fileItem = view.fileItems[file.path];
      if (fileItem) {
        rememberParent(fileItem, rootItem);
        if (!showFolders && view.viewMode === "flat") {
          setFlatItemLabel(view, fileItem, file.basename);
        }
        flatItems.push(fileItem);
      }
    }
  }

  if (!showFolders) {
    flatItems.sort((left, right) =>
      getFlatRelativePath(view, left.file).localeCompare(
        getFlatRelativePath(view, right.file),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
    );
  }

  return flatItems;
}

function getFlatRelativePath(view: PatchedExplorerView, file: TAbstractFile): string {
  if (!view.folderPath) {
    return file.path;
  }

  const prefix = `${view.folderPath}/`;
  return file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path;
}

/**
 * Ensures a Flat-mode folder group's DOM reflects its shared collapse state —
 * the same fold state used by Tree mode and the native File Explorer (Obsidian
 * persists it in app-level localStorage). The native `setCollapsed` guards on
 * equal values and would no-op when the internal flag already matches, leaving
 * a stale DOM behind, so flip the flag first to force the DOM update while
 * preserving the stored state.
 */
function syncFlatFolderCollapseState(item: InternalTreeItem): void {
  const shouldCollapse = Boolean(item.collapsed);
  item.collapsed = !shouldCollapse;
  void item.setCollapsed?.(shouldCollapse, false);
}

function restoreFlatItemParents(view: PatchedExplorerView): void {
  if (!view.flatItemParents) {
    return;
  }

  for (const [item, parent] of view.flatItemParents) {
    item.parent = parent;
  }
  view.flatItemParents.clear();
}

function scheduleFlatRefresh(view: PatchedExplorerView, mode: "debounced" | "immediate" = "debounced"): void {
  if (view._flatRefreshTimer !== undefined) {
    window.clearTimeout(view._flatRefreshTimer);
    view._flatRefreshTimer = undefined;
  }

  if (view.viewMode !== "flat" && view.contentMode !== "files") {
    return;
  }

  if (mode === "immediate") {
    view.sort();
    return;
  }

  view._flatRefreshTimer = window.setTimeout(() => {
    view._flatRefreshTimer = undefined;
    if (view.viewMode === "flat" || view.contentMode === "files") {
      view.requestSort();
    }
  }, 20);
}

function getFlatFolderLabel(view: PatchedExplorerView, folder: TFolder): string {
  if (view.folderPath === null || !isPathInsideFolder(folder.path, view.folderPath)) {
    return folder.name;
  }

  if (view.folderPath === "") {
    return folder.path;
  }

  return folder.path.slice(view.folderPath.length + 1) || folder.name;
}

function setFlatItemLabel(view: PatchedExplorerView, item: InternalTreeItem, label: string): void {
  const element = getItemLabelElement(item);
  if (!element) {
    return;
  }

  const flatItemLabels = view.flatItemLabels ??= new Map();
  if (flatItemLabels.has(item)) {
    return;
  }

  const textNodes = Array.from(element.childNodes).filter(
    (node): node is Text => node.nodeType === 3
  );
  const state: FlatItemLabelState = {
    element,
    textNodes: textNodes.map((node) => ({ node, text: node.textContent ?? "" }))
  };

  if (textNodes.length > 0) {
    const [firstTextNode, ...remainingTextNodes] = textNodes;
    if (firstTextNode) {
      firstTextNode.textContent = label;
    }
    for (const textNode of remainingTextNodes) {
      textNode.textContent = "";
    }
  } else {
    const addedNode = document.createTextNode(label);
    element.appendChild(addedNode);
    state.addedNode = addedNode;
  }

  flatItemLabels.set(item, state);
}

function restoreFlatItemLabel(view: PatchedExplorerView, item: InternalTreeItem): void {
  const state = view.flatItemLabels?.get(item);
  if (!state) {
    return;
  }

  restoreFlatLabelState(state);
  view.flatItemLabels?.delete(item);
}

function restoreFlatItemLabels(view: PatchedExplorerView): void {
  if (!view.flatItemLabels) {
    return;
  }

  for (const state of view.flatItemLabels.values()) {
    restoreFlatLabelState(state);
  }
  view.flatItemLabels.clear();
}

function restoreFlatLabelState(state: FlatItemLabelState): void {
  if (state.addedNode) {
    state.addedNode.remove();
    return;
  }

  for (const textNode of state.textNodes) {
    textNode.node.textContent = textNode.text;
  }
}

function getItemLabelElement(item: InternalTreeItem): HTMLElement | null {
  return (
    item.titleEl ??
    item.selfEl.querySelector<HTMLElement>(
      ".nav-folder-title-content, .nav-file-title-content, .tree-item-inner"
    )
  );
}

function getRootFolder(view: PatchedExplorerView): TFolder | null {
  if (view.folderPath === null || view.folderPath === "" || view.folderPath === "/") {
    return view.app.vault.getRoot();
  }

  const folder = view.app.vault.getAbstractFileByPath(view.folderPath);
  return folder instanceof TFolder ? folder : null;
}

function getVaultFolders(app: App): TFolder[] {
  const folders: TFolder[] = [app.vault.getRoot()];

  const visit = (folder: TFolder): void => {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        folders.push(child);
        visit(child);
      }
    }
  };

  visit(app.vault.getRoot());
  return folders;
}

function getRootItem(view: PatchedExplorerView): InternalTreeItem | null {
  const rootFolder = getRootFolder(view);
  if (!rootFolder) {
    return null;
  }

  return view.fileItems[rootFolder.path] ?? null;
}

function isInsideRoot(view: PatchedExplorerView, path: string): boolean {
  if (view.folderPath === "/") {
    return true;
  }
  return isPathInsideFolder(path, view.folderPath);
}



class FolderSpaceUnsupportedView extends ItemView {
  readonly isFolderSpace = true;
  folderPath: string = "";

  constructor(leaf: WorkspaceLeaf, private readonly options: FolderSpaceViewOptions) {
    super(leaf);
    this.icon = options.getFolderIcon?.(this.folderPath) ?? options.getIcon();
  }

  getRootPath(): string {
    return this.folderPath;
  }

  override async onOpen(): Promise<void> {
    this.render();
    new Notice(t("nativeCompatibilityDescription"));
  }

  override getViewType(): string {
    return FOLDER_SPACES_VIEW_TYPE;
  }

  override getIcon(): string {
    return this.options.getFolderIcon?.(this.folderPath) ?? this.options.getIcon();
  }

  override getDisplayText(): string {
    return getFolderSpaceTitle(this.app, this.folderPath);
  }

  override getState(): Record<string, unknown> {
    return { folderPath: this.folderPath };
  }

  override async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    this.folderPath = normalizeState(state).folderPath;
    this.render();
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: "folder-spaces-empty-state" }, (container) => {
      container.createDiv({
        cls: "folder-spaces-empty-title",
        text: t("nativeCompatibilityTitle")
      });
      container.createDiv({
        cls: "folder-spaces-empty-desc",
        text: t("nativeCompatibilityDescription")
      });
    });
  }
}
