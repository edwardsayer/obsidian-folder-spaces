import {
  App,
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
  type WorkspaceParent,
  type WorkspaceSplit,
  debounce,
  setIcon
} from "obsidian";

import {
  findToolbarButton,
  isPathInsideFolder,
  makeNavigable,
  normalizeState,
  type FolderSpaceViewMode
} from "./compatibility-helpers.js";
export { makeNavigable };
import {
  computeNextFocusedItem,
  getVisibleTreeItems as getVisibleTreeItemsHelper,
  isElementVisible
} from "./tree-navigation-helpers.js";
export { isElementVisible };
import { t } from "./i18n.js";
import { PanelActivityTracker } from "./panel-activity-tracker.js";
import { IconPickerModal } from "./ui/icon-picker-modal.js";
import {
  choosePanelTarget,
  chooseRecentPanel,
  chooseFolderSpaceCreationTarget,
  type PanelCandidate,
  type FolderSpaceCreationCandidate
} from "./folder-space-routing-policy.js";
import { getWindowOfLeaf, isPopoutWindow } from "./popout-sidebar.js";

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
  setFolderIcon?(folderPath: string, icon: string): void | Promise<void>;
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
  rootEmptyStateEl: HTMLDivElement;
  rootEmptyTitleEl: HTMLDivElement;
  rootEmptyDescriptionEl: HTMLDivElement;
  folderPathEl: HTMLDivElement;
  folderPathTextEl: HTMLSpanElement;
  rootRenameInputEl?: HTMLInputElement;
  flatRenameInputEl?: HTMLInputElement;
  viewModeButtonEl?: HTMLElement;
  folderIconButtonEl?: HTMLElement;
  getDefaultViewMode(): FolderSpaceViewMode;
  getFolderViewMode(folderPath: string): FolderSpaceViewMode | null;
  setFolderViewMode(folderPath: string, viewMode: FolderSpaceViewMode): void | Promise<void>;
  setFolderIcon(folderPath: string, icon: string): void | Promise<void>;
  flatItemParents?: Map<InternalTreeItem, InternalTreeItem | null | undefined>;
  flatItemLabels?: Map<InternalTreeItem, FlatItemLabelState>;
  navigation: boolean;
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
    return item.path;
  }

  override renderSuggestion(item: { item: TFolder }, el: HTMLElement): void {
    const row = el.createDiv({ cls: "folder-spaces-folder-suggestion" });
    row.createDiv({
      cls: "folder-spaces-folder-suggestion-path",
      text: item.item.path
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
  makeNavigable(leaf);

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
    makeNavigable(leaf);
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
  const originalGetDisplayText = view.getDisplayText.bind(view);
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
    makeNavigable(view.leaf);
  }
  registerTreeNavigationOverride(view);

  (view as unknown as { isFolderSpace: boolean }).isFolderSpace = true;
  (view as unknown as { getFolderPath: () => string | null }).getFolderPath = () => view.folderPath;
  view.getDefaultViewMode = () => normalizeViewMode(options.getDefaultViewMode?.());
  view.getFolderViewMode = (folderPath: string) => normalizeOptionalViewMode(options.getFolderViewMode?.(folderPath));
  view.setFolderViewMode = (folderPath: string, viewMode: FolderSpaceViewMode) =>
    options.setFolderViewMode?.(folderPath, viewMode);
  view.setFolderIcon = (folderPath: string, icon: string) => options.setFolderIcon?.(folderPath, icon);
  view.getViewType = () => FOLDER_SPACES_VIEW_TYPE;
  view.getIcon = () => getFolderSpaceIcon(options, view.folderPath);

  view.getDisplayText = () => {
    const rootFolder = getRootFolder(view);
    if (rootFolder) {
      return rootFolder.name;
    }

    return view.folderPath ? lastPathSegment(view.folderPath) : originalGetDisplayText();
  };

  view.getSortedFolderItems = (folder: TFolder) => {
    const items = originalGetSortedFolderItems(folder);
    if (view.viewMode !== "flat") {
      return items;
    }

    const rootFolder = getRootFolder(view);
    if (!rootFolder || folder === rootFolder) {
      return items;
    }

    // In Flat mode every folder is rendered at the root level. Its native
    // children therefore contain only the files directly inside that folder;
    // descendant folders are rendered as their own root-level groups.
    return items.filter((item) => item.file instanceof TFile);
  };

  view.getState = () => ({
    ...originalGetState(),
    folderPath: view.folderPath,
    viewMode: view.viewMode
  });

  view.setState = async (state: unknown, result: ViewStateResult) => {
    try {
      const nextState = normalizeState(state);
      view.folderPath = nextState.folderPath;
      view.viewMode = resolveFolderViewMode(view, nextState.folderPath, nextState.viewMode);
      view.icon = getFolderSpaceIcon(options, view.folderPath);
      await originalSetState(nextState, result);
      // setState may be implemented by the native explorer and can overwrite
      // properties that were set while the view was being created.
      makeNavigable(view);
      if (view.leaf) {
        makeNavigable(view.leaf);
      }
      refreshFolderPresentation(view, Boolean(view.folderPath));
      scheduleFlatRefresh(view);
      refreshLeafHeader(view);
    } catch (error) {
      console.warn("[folder-spaces] Unable to set view state:", error);
      new Notice(t("rootUnavailable"));
    }
  };

  view.load = () => {
    originalLoad();
    // The native explorer can reset this flag while it is loading.
    makeNavigable(view);
    if (view.leaf) {
      makeNavigable(view.leaf);
    }
    registerRootContextMenuOverride(view);
    registerCreateButtonsOverride(view);
    registerFileOpenOverride(view);
    registerTreeNavigationOverride(view);
    refreshFolderPresentation(view, false);
    scheduleFlatRefresh(view);
  };

  view.sort = () => {
    const rootFolder = getRootFolder(view);
    refreshFolderPresentation(view, false);

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
      const items = view.viewMode === "flat"
        ? getFlatItems(view, rootFolder)
        : view.getSortedFolderItems(rootFolder);
      renderChildren(view, items);
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

    void originalAfterCreate?.(file, newLeaf);
  };

  view.onRename = (file: TAbstractFile, oldPath: string) => {
    originalOnRename(file, oldPath);

    if (view.viewMode === "flat" && (isInsideRoot(view, oldPath) || isInsideRoot(view, file.path))) {
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

    if (!view.folderPath) {
      return;
    }

    if (file.path === view.folderPath || view.folderPath.startsWith(`${file.path}/`)) {
      view.folderPath = null;
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

  const changeRootButton = folderPathActions.createDiv({
    cls: "clickable-icon folder-spaces-action-btn",
    attr: {
      "aria-label": t("actionChangeRoot"),
      "data-tooltip": t("actionChangeRoot")
    }
  });
  setIcon(changeRootButton, "lucide-folder-search");

  const viewModeButton = folderPathActions.createDiv({
    cls: "clickable-icon folder-spaces-action-btn",
    attr: {
      "aria-label": t("actionToggleFolderView"),
      "data-tooltip": t("actionToggleFolderView"),
      "aria-pressed": "false"
    }
  });
  setIcon(viewModeButton, "lucide-list-tree");

  const moreButton = folderPathActions.createDiv({
    cls: "clickable-icon folder-spaces-action-btn",
    attr: { "aria-label": t("actionFolderMenu") }
  });
  setIcon(moreButton, "lucide-more-vertical");

  view.navFileContainerEl.before(folderPath);

  // Right-click or left-click on folderPathLeft -> Native Folder Context Menu
  view.registerDomEvent(folderPathLeft, "click", (event: MouseEvent) => {
    if (view.rootRenameInputEl) {
      return;
    }

    const rootFolder = getRootFolder(view);
    if (rootFolder) {
      openRootBlankAreaContextMenu(view, event, rootFolder);
    }
  });

  view.registerDomEvent(folderPath, "contextmenu", (event: MouseEvent) => {
    if (view.rootRenameInputEl) {
      return;
    }

    event.preventDefault();
    const rootFolder = getRootFolder(view);
    if (rootFolder) {
      openRootBlankAreaContextMenu(view, event, rootFolder);
    }
  });

  // Change Root Button -> Vault folder picker
  view.registerDomEvent(changeRootButton, "click", (event: MouseEvent) => {
    event.stopPropagation();
    new RootFolderPickerModal(view.app, view).open();
  });

  // View Mode Button -> Toggle Tree/Flat for the current root folder
  view.registerDomEvent(viewModeButton, "click", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setViewMode(view, view.viewMode === "flat" ? "tree" : "flat");
  });

  // Folder Icon Button -> Set a custom icon for the current root folder
  view.registerDomEvent(folderIconButton, "click", (event: MouseEvent) => {
    event.stopPropagation();
    if (!view.folderPath) {
      return;
    }

    new IconPickerModal(view.app, view.getIcon(), async (icon) => {
      const folderPath = view.folderPath;
      if (!folderPath) {
        return;
      }
      await view.setFolderIcon(folderPath, icon);
      view.icon = view.getIcon();
      refreshLeafHeader(view);
      setIcon(folderIconButton, view.getIcon());
    }).open();
  });

  // More Vertical Button -> Folder Context Menu
  view.registerDomEvent(moreButton, "click", (event: MouseEvent) => {
    event.stopPropagation();
    const rootFolder = getRootFolder(view);
    if (rootFolder) {
      openRootBlankAreaContextMenu(view, event, rootFolder);
    }
  });

  view.folderPath = null;
  view.viewMode = "tree";
  view.flatItemParents = new Map();
  view.flatItemLabels = new Map();
  view.rootEmptyStateEl = emptyState;
  view.rootEmptyTitleEl = title;
  view.rootEmptyDescriptionEl = description;
  view.folderPathEl = folderPath;
  view.folderPathTextEl = folderPathText;
  view.viewModeButtonEl = viewModeButton;
  view.folderIconButtonEl = folderIconButton;
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
  if (view.viewMode === mode) {
    return;
  }

  restoreFlatItemParents(view);
  restoreFlatItemLabels(view);
  view.viewMode = mode;
  if (view.folderPath) {
    void view.setFolderViewMode(view.folderPath, mode);
  }
  updateViewModeButtons(view);
  if (mode === "flat") {
    scheduleFlatRefresh(view, "immediate");
  } else {
    view.requestSort();
  }
  void view.app.workspace.requestSaveLayout();
}

function setFolderPath(view: PatchedExplorerView, folderPath: string): void {
  const state = { ...view.getState(), folderPath } as Record<string, unknown>;
  delete state.viewMode;
  void view.setState(state, { history: false });
}

function getFolderSpaceIcon(options: FolderSpaceViewOptions, folderPath: string | null): string {
  return options.getFolderIcon?.(folderPath) ?? options.getIcon();
}

function updateViewModeButtons(view: PatchedExplorerView): void {
  const button = view.viewModeButtonEl;
  if (!button) {
    return;
  }

  const flatActive = view.viewMode === "flat";
  button.toggleClass("is-active", flatActive);
  button.setAttr("aria-pressed", String(flatActive));
  const nextModeLabel = flatActive ? t("actionTreeView") : t("actionFlatView");
  button.setAttr("aria-label", nextModeLabel);
  button.setAttr("data-tooltip", nextModeLabel);
  button.empty();
  setIcon(button, flatActive ? "lucide-list" : "lucide-list-tree");
}

function resolveFolderViewMode(
  view: PatchedExplorerView,
  folderPath: string | null,
  stateViewMode?: FolderSpaceViewMode
): FolderSpaceViewMode {
  if (!folderPath) {
    return normalizeViewMode(stateViewMode ?? view.getDefaultViewMode());
  }

  return view.getFolderViewMode(folderPath) ?? normalizeViewMode(stateViewMode ?? view.getDefaultViewMode());
}

function normalizeViewMode(mode: unknown): FolderSpaceViewMode {
  return mode === "flat" ? "flat" : "tree";
}

function normalizeOptionalViewMode(mode: unknown): FolderSpaceViewMode | null {
  return mode === "tree" || mode === "flat" ? mode : null;
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
  const targetFolder = targetPath
    ? view.app.vault.getAbstractFileByPath(targetPath)
    : null;

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
    const contentRoot = getContentRoot(view);
    let leaf: WorkspaceLeaf | null = null;

    if (requestedPane === "window") {
      leaf = workspace.getLeaf("window");
    } else if (requestedPane === true || requestedPane === "tab") {
      leaf = createTabInRoot(workspace, contentRoot, view.leaf);
    } else {
      if (requestedPane === "split") {
        const recentContentLeaf = getRecentContentLeaf(workspace, contentRoot);
        leaf = recentContentLeaf
          ? workspace.createLeafBySplit(recentContentLeaf)
          : createTabInRoot(workspace, contentRoot, view.leaf);
      } else {
        leaf = resolveRecentSiblingLeaf(view, contentRoot) ?? createTabInRoot(workspace, contentRoot, view.leaf);
      }
    }

    await leaf.openFile(file, { active: true });
  } catch (error) {
    console.warn("[folder-spaces] Unable to open file:", file.path, error);
    new Notice(t("rootUnavailable"));
  }
}

function getContentRoot(view: PatchedExplorerView): WorkspaceParent {
  const workspace = view.app.workspace;
  const viewRoot = view.leaf.getRoot() as WorkspaceParent;

  if (viewRoot === workspace.leftSplit || viewRoot === workspace.rightSplit) {
    return workspace.rootSplit;
  }

  return viewRoot;
}

function getRecentContentLeaf(
  workspace: App["workspace"],
  contentRoot: WorkspaceParent
): WorkspaceLeaf | null {
  const tracker = getPanelActivityTracker(workspace);
  const candidates: WorkspaceLeaf[] = [];

  workspace.iterateAllLeaves((leaf) => {
    if (leaf.getRoot() === contentRoot && !isFolderSpaceLeaf(leaf)) {
      candidates.push(leaf);
    }
  });

  candidates.sort((left, right) => getLeafActivityScore(right, tracker) - getLeafActivityScore(left, tracker));
  return candidates[0] ?? null;
}

function createTabInRoot(
  workspace: App["workspace"],
  contentRoot: WorkspaceParent,
  fallbackLeaf: WorkspaceLeaf
): WorkspaceLeaf {
  const recentLeaf = workspace.getMostRecentLeaf(contentRoot);
  const fallbackParent = fallbackLeaf.getRoot() === contentRoot ? fallbackLeaf.parent : null;
  const parent = recentLeaf?.parent ?? fallbackParent;

  if (parent) {
    return workspace.createLeafInParent(parent as WorkspaceSplit, -1);
  }

  return workspace.getLeaf("tab");
}

function resolveRecentSiblingLeaf(
  view: PatchedExplorerView,
  contentRoot: WorkspaceParent
): WorkspaceLeaf | null {
  const workspace = view.app.workspace;
  const tracker = getPanelActivityTracker(workspace);
  const panels = new Map<WorkspaceParent, WorkspaceLeaf[]>();

  workspace.iterateAllLeaves((leaf) => {
    if (leaf.getRoot() !== contentRoot || isFolderSpaceLeaf(leaf)) {
      return;
    }

    if (contentRoot === view.leaf.getRoot() && leaf.parent === view.leaf.parent) {
      return;
    }

    const leaves = panels.get(leaf.parent) ?? [];
    leaves.push(leaf);
    panels.set(leaf.parent, leaves);
  });

  const candidates: PanelCandidate<WorkspaceParent, WorkspaceLeaf>[] = Array.from(panels.entries()).map(
    ([parent, leaves]) => ({
      panel: parent,
      order: tracker.getPanelOrder(parent),
      activeLeaf: getActiveLeafInPanel(leaves, tracker),
      activePinned: false
    })
  );

  for (const candidate of candidates) {
    candidate.activePinned = candidate.activeLeaf ? isPinnedLeaf(candidate.activeLeaf) : false;
  }

  const target = choosePanelTarget(chooseRecentPanel(candidates));
  if (!target) {
    return null;
  }

  if (target.kind === "existing") {
    return target.leaf;
  }

  return workspace.createLeafInParent(target.panel as WorkspaceSplit, -1);
}

function getActiveLeafInPanel(
  leaves: WorkspaceLeaf[],
  tracker: PanelActivityTracker
): WorkspaceLeaf | null {
  const activeLeaf = leaves.find((leaf) => leaf.getViewState().active);
  if (activeLeaf) {
    return activeLeaf;
  }

  const lastLeaf = leaves.find((leaf) => tracker.getLastLeaf(leaf.parent) === leaf);
  return lastLeaf ?? leaves[leaves.length - 1] ?? null;
}

function isPinnedLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.getViewState().pinned === true;
}

function getLeafActivityScore(leaf: WorkspaceLeaf, tracker: PanelActivityTracker): number {
  return tracker.getLeafActivityScore(leaf);
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
      openRootBlankAreaContextMenu(view, event, rootFolder);
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
  const existingSearchLeaf = win
    ? workspace.getLeavesOfType("search").find((leaf) => getWindowOfLeaf(leaf) === win)
    : null;

  try {
    const leaf = existingSearchLeaf ?? createTabInRoot(workspace, getContentRoot(view), view.leaf);
    await leaf.setViewState({ type: "search", state: { query } });
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
  } catch (error) {
    console.warn("[folder-spaces] Unable to open search in Folder Space window:", error);
    new Notice(t("rootUnavailable"));
  }
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
    labelEl.setText(path);
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

function openRootBlankAreaContextMenu(
  view: PatchedExplorerView,
  event: MouseEvent,
  rootFolder: TFolder
): void {
  const handler = (menu: Menu, file: TAbstractFile) => {
    if (file === rootFolder) {
      patchRootFolderMenu(menu, view, rootFolder);
    }
  };

  view.app.workspace.on("file-menu", handler);

  const rootItem = view.fileItems[rootFolder.path];
  if (rootItem) {
    delete view.fileItems[rootFolder.path];
  }

  try {
    view.onFileContextMenu(event, rootFolder);
  } finally {
    if (rootItem) {
      view.fileItems[rootFolder.path] = rootItem;
    }
    view.app.workspace.off("file-menu", handler as any);
  }
}

function refreshFolderPresentation(view: PatchedExplorerView, saveLayout: boolean): void {
  const rootFolder = getRootFolder(view);
  const hasRootFolder = Boolean(rootFolder);

  view.navFileContainerEl.toggle(hasRootFolder);
  view.folderPathEl.toggle(Boolean(view.folderPath));
  if (!view.rootRenameInputEl?.isConnected) {
    view.rootRenameInputEl = undefined;
    view.folderPathTextEl.removeClass("is-editing");
    view.folderPathTextEl.setText(view.folderPath ? view.folderPath : "");
  }

  view.rootEmptyStateEl.toggle(!hasRootFolder);
  view.rootEmptyTitleEl.setText(
    view.folderPath && !hasRootFolder ? t("emptyMissingTitle") : t("emptyTitle")
  );
  view.rootEmptyDescriptionEl.setText(t("emptyDescription"));
  updateViewModeButtons(view);
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

function refreshLeafHeader(view: PatchedExplorerView): void {
  const leafWithHeader = view.leaf as WorkspaceLeaf & { updateHeader?: () => void };
  leafWithHeader.updateHeader?.();
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
}

function getFlatItems(view: PatchedExplorerView, rootFolder: TFolder): InternalTreeItem[] {
  restoreFlatItemParents(view);
  restoreFlatItemLabels(view);

  const rootItem = view.fileItems[rootFolder.path] ?? null;
  const flatItems: InternalTreeItem[] = [];

  const rememberParent = (item: InternalTreeItem, parent: InternalTreeItem | null): void => {
    view.flatItemParents ??= new Map();
    view.flatItemParents.set(item, item.parent);
    item.parent = parent;
  };

  const collectFolderGroup = (folder: TFolder, relativePath: string): void => {
    const folderItem = view.fileItems[folder.path];
    if (folderItem) {
      rememberParent(folderItem, rootItem);
      setFlatItemLabel(view, folderItem, relativePath);
      folderItem.collapsed = false;
      void folderItem.setCollapsed?.(false, false);
      flatItems.push(folderItem);
    }

    const fileParent = folderItem ?? rootItem;
    const files = folder.children
      .filter((file): file is TFile => file instanceof TFile)
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      );
    for (const file of files) {
      const fileItem = view.fileItems[file.path];
      if (fileItem) {
        rememberParent(fileItem, fileParent);
      }
    }

    const childFolders = folder.children
      .filter((file): file is TFolder => file instanceof TFolder)
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      );

    for (const child of childFolders) {
      const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
      collectFolderGroup(child, childRelativePath);
    }
  };

  const rootFolders = rootFolder.children
    .filter((file): file is TFolder => file instanceof TFolder)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
    );
  for (const folder of rootFolders) {
    collectFolderGroup(folder, folder.name);
  }

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
      flatItems.push(fileItem);
    }
  }

  return flatItems;
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
  if (view.viewMode !== "flat") {
    return;
  }

  const refresh = () => {
    if (view.viewMode !== "flat") {
      return;
    }

    if (mode === "immediate") {
      view.sort();
    } else {
      view.requestSort();
    }
  };

  for (const delay of [0, 50, 200, 500]) {
    window.setTimeout(() => {
      refresh();
    }, delay);
  }
}

function getFlatFolderLabel(view: PatchedExplorerView, folder: TFolder): string {
  if (!view.folderPath || !isPathInsideFolder(folder.path, view.folderPath)) {
    return folder.name;
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
  if (!view.folderPath) {
    return null;
  }

  const folder = view.app.vault.getAbstractFileByPath(view.folderPath);
  return folder instanceof TFolder ? folder : null;
}

function getVaultFolders(app: App): TFolder[] {
  const folders: TFolder[] = [];

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
  return isPathInsideFolder(path, view.folderPath);
}

function lastPathSegment(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || t("viewName");
}

class FolderSpaceUnsupportedView extends ItemView {
  readonly isFolderSpace = true;
  folderPath: string | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly options: FolderSpaceViewOptions) {
    super(leaf);
    this.icon = options.getFolderIcon?.(this.folderPath) ?? options.getIcon();
  }

  getRootPath(): string | null {
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
    return this.folderPath ? lastPathSegment(this.folderPath) : t("viewName");
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
