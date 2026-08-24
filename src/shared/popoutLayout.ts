import { App, WorkspaceLeaf } from "obsidian";

/**
 * Minimal workspace structures used by the shared Popout engine.
 *
 * Keep these structural types local so this file can be copied byte-for-byte
 * into another plugin without importing plugin-specific domain types.
 */
export interface WorkspaceParent {
  parent?: WorkspaceParent;
  type?: string;
  isRoot?: boolean;
  kind?: string;
  children?: (WorkspaceLeaf | WorkspaceParent)[];
  containerEl?: HTMLElement;
  insertChild?: (index: number, item: WorkspaceParent) => void;
  removeChild?: (item: WorkspaceParent) => void;
}

export interface ExtendedWorkspaceLeaf extends Omit<WorkspaceLeaf, "parent"> {
  id?: string;
  containerEl: HTMLElement;
  parent?: WorkspaceParent;
  getViewState(): { type: string; state?: Record<string, unknown> };
  setViewState(state: { type: string; active?: boolean; state?: Record<string, unknown> }): Promise<void>;
}

export interface ExtendedWorkspace {
  activeLeaf: WorkspaceLeaf | null;
  getMostRecentLeaf?(root?: WorkspaceParent): WorkspaceLeaf | null;
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void | boolean): void;
  getLeaf(type?: string): WorkspaceLeaf;
  createLeafInParent(parent: unknown, index: number): WorkspaceLeaf;
  createLeafBySplit(target: unknown, direction: "horizontal" | "vertical", before?: boolean): WorkspaceLeaf;
  setActiveLeaf(leaf: WorkspaceLeaf, params?: { focus?: boolean }): void;
  revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
}

export interface PopoutHiddenState {
  leftSidebar?: boolean;
  rightSidebar?: boolean;
  hiddenLeafIds?: string[];
}

/**
 * Generic Popout workspace Column/Pane layout engine.
 *
 * This module only provides window/DOM/layout primitives, including generic
 * pane visibility state capture/apply. Activity Bar UI, Window Spaces capture
 * and restore workflows, and interceptor/plugin policy remain outside shared.
 */

export type PopoutSide = "left" | "right";

export const INITIAL_SPLIT_RATIO = 0.34;

export interface PopoutPane {
  tabs: WorkspaceParent;
  left: number;
  width?: number;
  center: number;
}

export interface PopoutColumn {
  left: number;
  width: number;
  panes: PopoutPane[];
}

interface LastActivePanes {
  center?: WorkspaceParent;
  left?: WorkspaceParent;
  right?: WorkspaceParent;
}

/**
 * 實體側欄映射（由 plugin 同步）。
 *
 * - left/right：該側「目前」是否有 sidebar（= 該側 activity bar 顯示）。
 * - originalCount：首次記錄時的頂層欄位數（記憶原始結構，供補欄判斷）。
 * - initialLeft/initialRight：首次記錄時兩側 activity bar 可見性。
 *   需求欄位數 = originalCount + Σ(目前顯示 − 初始顯示)。
 */
export interface SidebarSides {
  left: boolean;
  right: boolean;
  originalCount?: number;
  initialLeft?: boolean;
  initialRight?: boolean;
}

/** 判斷 DOM Window 是否為 Popout。 */
export function isPopoutWindow(win: Window | null | undefined): boolean {
  if (!win || (typeof window !== "undefined" && win === window)) return false;
  const body = win.document?.body;
  return !!body && (body.classList.contains("is-popout-window") || body.classList.contains("mod-popout"));
}

/** 取得 leaf 所屬的 DOM Window。 */
export function getWindowOfLeaf(leaf: WorkspaceLeaf | null | undefined): Window | null {
  if (!leaf) return null;
  const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
  const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
  return container?.ownerDocument?.defaultView ?? null;
}

/** 測量 WorkspaceTabs 容器本身的 DOMRect（背景 tab 寬高為 0，需測 tabs 容器）。 */
export function getPaneRect(tabs: WorkspaceParent | null | undefined): DOMRect | null {
  const container = tabs?.containerEl;
  if (container instanceof HTMLElement) {
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  const children = (tabs?.children ?? []) as WorkspaceLeaf[];
  for (const leaf of children) {
    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    const leafContainer = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (leafContainer instanceof HTMLElement) {
      const rect = leafContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect;
    }
  }
  return null;
}

/** 將 X 軸重疊 > 50% 的上下垂直分割歸類為同一個水平直欄 (Column)。 */
export function collectPopoutColumns(panes: PopoutPane[]): PopoutColumn[] {
  if (panes.length === 0) return [];

  const columns: PopoutColumn[] = [];
  for (const pane of panes) {
    const paneWidth = pane.width ?? 400;
    let matchedColumn = columns.find((col) => {
      const overlap = Math.max(0, Math.min(pane.left + paneWidth, col.left + col.width) - Math.max(pane.left, col.left));
      const minWidth = Math.min(paneWidth, col.width);
      const overlapRatio = minWidth > 0 ? overlap / minWidth : 0;
      return overlapRatio > 0.5 || Math.abs(pane.left - col.left) < 30;
    });

    if (matchedColumn) {
      matchedColumn.panes.push(pane);
    } else {
      columns.push({
        left: pane.left,
        width: paneWidth,
        panes: [pane],
      });
    }
  }

  columns.sort((a, b) => a.left - b.left);
  return columns;
}

/** 向上追溯至 Popout 視窗層級的最頂層 Split 節點。 */
export function getTopLevelNodeInWindow(leaf: WorkspaceLeaf): WorkspaceLeaf | WorkspaceParent {
  let curr: WorkspaceLeaf | WorkspaceParent = leaf;
  while (curr && (curr as WorkspaceParent).parent) {
    const parent = (curr as WorkspaceParent).parent;
    if (!parent || !parent.parent || parent.type === "root" || parent.isRoot || parent.kind === "root") {
      return curr;
    }
    curr = parent;
  }
  return curr;
}

/** 尋找 leaf 的 containerEl 距離最近（含自身）的祖先中的 `.mod-root` split 元素。 */
export function findRootSplitElement(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element;
  while (node) {
    if (node.classList.contains("workspace-split") && node.classList.contains("mod-root")) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** 從 element 向上找到 root 的 direct child（即頂層欄位元素）。 */
export function getDirectChildOf(root: HTMLElement, element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current && current.parentElement === root ? current : null;
}

/** 找到 leaf 在其 parent split 下的 direct child 元素（`.workspace-tabs` 或巢狀 split）。 */
export function getPaneContainerElement(leaf: WorkspaceLeaf): HTMLElement | null {
  const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
  const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
  if (!(container instanceof HTMLElement)) return null;

  let current: HTMLElement | null = container;
  while (current && current.parentElement) {
    if (current.parentElement.classList.contains("workspace-split")) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/** 是否為隱藏狀態（inline display:none 或明確的 collapse class）。 */
export function isElementHidden(el: HTMLElement | null | undefined): boolean {
  return !!el && (
    el.style.display === "none" ||
    el.classList.contains("window-spaces-column-hidden")
  );
}

/** 透過 Obsidian 樣式 Helper 設定 display（禁止直接指派 el.style.display）。 */
export function setElementDisplay(el: HTMLElement, display: string): void {
  const customEl = el as unknown as {
    setCssProps?: (props: Record<string, string>) => void;
  };
  if (typeof customEl.setCssProps === "function") {
    customEl.setCssProps({ display });
  } else {
    el.style.display = display;
  }
}

function setElementCssStyles(el: HTMLElement, styles: Record<string, string>): void {
  const customEl = el as unknown as {
    setCssStyles?: (styles: Record<string, string>) => void;
    setCssProps?: (props: Record<string, string>) => void;
  };
  if (typeof customEl.setCssStyles === "function") {
    customEl.setCssStyles(styles);
  } else if (typeof customEl.setCssProps === "function") {
    customEl.setCssProps(styles);
  } else {
    for (const [key, value] of Object.entries(styles)) {
      el.style.setProperty(key, value);
    }
  }
}

function getViewContainer(leaf: WorkspaceLeaf): HTMLElement | null {
  const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
  const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
  return container instanceof HTMLElement ? container : null;
}

function getDirectSplitChild(split: HTMLElement, element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== split) {
    current = current.parentElement;
  }
  return current;
}

function scheduleInitialSplitSizing(panelLeaf: WorkspaceLeaf, editorLeaf: WorkspaceLeaf, win: Window): void {
  const raf = win.requestAnimationFrame?.bind(win) || window.requestAnimationFrame.bind(window);
  raf(() => {
    raf(() => {
      applyInitialSplitSizing(panelLeaf, editorLeaf);
    });
  });
}

function applyInitialSplitSizing(panelLeaf: WorkspaceLeaf, editorLeaf: WorkspaceLeaf): void {
  const panelContainer = getViewContainer(panelLeaf);
  const editorContainer = getViewContainer(editorLeaf);
  if (!panelContainer || !editorContainer) return;

  const split = panelContainer.closest<HTMLElement>(".workspace-split.mod-vertical");
  if (!split || !split.contains(editorContainer)) return;

  const panelPane = getDirectSplitChild(split, panelContainer);
  const editorPane = getDirectSplitChild(split, editorContainer);
  if (!panelPane || !editorPane || panelPane === editorPane) return;

  setElementCssStyles(panelPane, { flex: `0 0 ${INITIAL_SPLIT_RATIO * 100}%` });
  setElementCssStyles(editorPane, { flex: "1 1 0%" });
}

function findLeafInTabs(tabs: WorkspaceParent | null | undefined, viewType: string): WorkspaceLeaf | null {
  const children = (tabs?.children ?? []) as WorkspaceLeaf[];
  for (const leaf of children) {
    if (leaf.getViewState()?.type === viewType) {
      return leaf;
    }
  }
  return null;
}

/**
 * 判斷頂層欄位是否被 UI 標記為 sidebar（`window-spaces-sidebar-column` class）。
 *
 * 此 class 由 Window Spaces 的 activityBar（syncSidebarColumnClasses）依
 * 「該側 activity bar 可見 + 位於最左/最右 + 頂層欄位數 ≥ 2」套用，並同時
 * 驅動側欄底色與 tab header 樣式。被動判定（isLeafInSideColumn /
 * getCenterPanes）以它為唯一依據，確保「開檔排除」與「視覺樣式」永遠一致。
 */
function isSidebarColumnElement(columnEl: HTMLElement | null | undefined): boolean {
  return !!columnEl && columnEl.classList.contains("window-spaces-sidebar-column");
}

export class PopoutLayoutEngine {
  private app: App;
  private sidebarSidesByWindow = new WeakMap<Window, SidebarSides>();
  private lastActivePanesByWindow = new WeakMap<Window, LastActivePanes>();

  constructor(app: App) {
    this.app = app;
  }

  get workspace(): ExtendedWorkspace {
    return this.app.workspace as unknown as ExtendedWorkspace;
  }

  /** 取得指定視窗中最新的 active leaf（限定該 window）。 */
  getActiveLeafInWindow(win: Window): WorkspaceLeaf | null {
    const activeLeaf =
      typeof this.workspace.getMostRecentLeaf === "function"
        ? this.workspace.getMostRecentLeaf()
        : this.workspace.activeLeaf;
    return activeLeaf && getWindowOfLeaf(activeLeaf) === win ? activeLeaf : null;
  }

  /**
   * 記錄 Popout 中最後 active 的 pane，content / left sidebar / right sidebar
   * 各自維護一份。側欄 view 被點選後，Obsidian 的 active leaf 會暫時落在
   * sidebar；此記錄讓後續新 tab 或 view 回到該區域最後操作的 split，而不會
   * 每次都落到第一個 pane。
   */
  rememberActiveContentPane(win: Window, leaf: WorkspaceLeaf | null | undefined): void {
    if (!win || !leaf || getWindowOfLeaf(leaf) !== win) return;

    const tabs = (leaf as unknown as ExtendedWorkspaceLeaf).parent;
    if (!tabs) return;

    const remembered = this.lastActivePanesByWindow.get(win) || {};
    const side = this.getSidebarSideForLeaf(win, leaf);
    if (side) {
      remembered[side] = tabs;
      this.lastActivePanesByWindow.set(win, remembered);
      return;
    }

    const isCurrentCenterPane = this.getCenterPanes(win).some((pane) => pane.tabs === tabs);
    if (isCurrentCenterPane) {
      remembered.center = tabs;
      this.lastActivePanesByWindow.set(win, remembered);
    }
  }

  /** 取得指定視窗中最後一個 leaf（限定該 window）。 */
  getLastLeafInWindow(win: Window): WorkspaceLeaf | null {
    let lastLeaf: WorkspaceLeaf | null = null;
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (getWindowOfLeaf(leaf) === win) {
        lastLeaf = leaf;
      }
    });
    return lastLeaf;
  }

  /** 取得指定視窗中所有 leaf。 */
  getLeavesForWindow(win: Window): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (getWindowOfLeaf(leaf) === win) {
        leaves.push(leaf);
      }
    });
    return leaves;
  }

  /** Record which endpoint columns are real sidebars for a newly-created Popout. */
  setSidebarSides(win: Window, sides: SidebarSides): void {
    this.sidebarSidesByWindow.set(win, { ...sides });
  }

  getSidebarSides(win: Window): SidebarSides | undefined {
    const sides = this.sidebarSidesByWindow.get(win);
    return sides ? { ...sides } : undefined;
  }

  /** 取得所有目前存活的 Popout DOM Window（去重）。 */
  getLivePopoutWindows(): Window[] {
    const wins: Window[] = [];
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const win = getWindowOfLeaf(leaf);
      if (win && isPopoutWindow(win) && !wins.includes(win)) {
        wins.push(win);
      }
    });
    return wins;
  }

  /** 收集 Popout 視窗中的所有 Pane（測量 tabs 容器）。 */
  collectPopoutPanes(win: Window): PopoutPane[] {
    const tabsSet = new Set<WorkspaceParent>();
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (getWindowOfLeaf(leaf) !== win) return;
      const parent = (leaf as unknown as ExtendedWorkspaceLeaf).parent;
      if (parent) {
        tabsSet.add(parent);
      }
    });

    const panes: PopoutPane[] = [];
    for (const tabs of tabsSet) {
      const rect = getPaneRect(tabs);
      const left = rect ? rect.left : 0;
      const width = rect ? rect.width : 400;
      panes.push({ tabs, left, width, center: left + width / 2 });
    }

    panes.sort((a, b) => a.left - b.left);
    return panes;
  }

  /** 在指定頂層欄位內尋找特定 view type 的 leaf（限定該欄位，不跨 tab group / 不跨側欄）。 */
  findLeafOfTypeInColumn(win: Window, columnEl: HTMLElement, viewType: string): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (found) return;
      if (getWindowOfLeaf(leaf) !== win || leaf.getViewState()?.type !== viewType) return;
      const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
      const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
      if (container instanceof HTMLElement && columnEl.contains(container)) {
        found = leaf;
      }
    });
    return found;
  }

  private findLeafByIdInWindow(win: Window, leafId: string): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (!found && getWindowOfLeaf(leaf) === win && (leaf as unknown as ExtendedWorkspaceLeaf).id === leafId) {
        found = leaf;
      }
    });
    return found;
  }

  private pickCenterPopoutPane(panes: PopoutPane[], win: Window): PopoutPane | null {
    const firstPane = panes[0];
    if (!firstPane) return null;
    if (panes.length === 1) return firstPane;

    const winCenter = win.innerWidth / 2;
    let bestPane = firstPane;
    let bestDistance = Infinity;
    for (const pane of panes) {
      const distance = Math.abs(pane.center - winCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPane = pane;
      }
    }
    return bestPane;
  }

  /**
   * 確保指定 Popout 的某側存在「側欄欄位」（結構化：第一/最後頂層欄位即側欄），
   * 並開啟/聚焦指定 view type。
   * - viewType 有值：建立/聚焦該 view 的 leaf。
   * - viewType 無值：僅確保欄位存在並回傳一個空 leaf（供攔截器由第三方設定 view）。
   *
   * 主動定位語意：open-in-left/right-sidebar 應把 view 開到「最左/最右邊的 split」。
   * 該側沒有側欄欄位（getColumnElement null，例如欄位數不足或 activity bar 未開）時
   * 直接建立新的頂層欄位，不再回退塞入現有的最外欄位（避免把 view 誤塞進內容欄位）。
   */
  async ensureSideColumn(win: Window, side: PopoutSide, viewType?: string): Promise<WorkspaceLeaf> {
    const workspace = this.workspace;
    const columnEl = this.getColumnElement(win, side);

    if (columnEl) {
      const tabs = this.getSidebarTabsInColumn(win, side, columnEl);
      if (tabs) {
        if (viewType) {
          const existingInSidebar = findLeafInTabs(tabs, viewType);
          if (existingInSidebar) {
            await workspace.revealLeaf(existingInSidebar);
            workspace.setActiveLeaf(existingInSidebar, { focus: true });
            return existingInSidebar;
          }
        }
        const newLeaf = viewType
          ? await this.openPanelInTabs(tabs, viewType)
          : this.createLeafInTabs(tabs);
        await workspace.revealLeaf(newLeaf);
        workspace.setActiveLeaf(newLeaf, { focus: true });
        return newLeaf;
      }
    }

    // 尚無側欄欄位：建立貫穿全高的垂直 Split 欄位
    // Prefer an existing center pane when adding a second sidebar. The active
    // leaf is often still in the first sidebar after the user clicks an
    // Activity Bar button; splitting that leaf would turn a sidebar into the
    // content area and leave the layout with no real center column.
    const centerPane = this.getCenterPanes(win)[0];
    let editorLeaf = (centerPane?.tabs.children?.[0] as WorkspaceLeaf | undefined)
      || this.getActiveLeafInWindow(win)
      || this.getLastLeafInWindow(win);
    if (editorLeaf && viewType && editorLeaf.getViewState()?.type === viewType) {
      let otherLeaf: WorkspaceLeaf | null = null;
      workspace.iterateAllLeaves((l: WorkspaceLeaf) => {
        if (!otherLeaf && getWindowOfLeaf(l) === win && l.getViewState()?.type !== viewType) {
          otherLeaf = l;
        }
      });
      if (otherLeaf) editorLeaf = otherLeaf;
    }

    if (!editorLeaf) {
      return this.openPanelInEditor(win, viewType);
    }

    const targetNode = getTopLevelNodeInWindow(editorLeaf) || editorLeaf;
    const isParentNode = targetNode !== editorLeaf && Boolean((targetNode as WorkspaceParent).children);
    const before = side === "left" ? !isParentNode : isParentNode;
    // INTERNAL API: Workspace.createLeafBySplit - d.ts 有宣告但官方文件未記載（asar-findings #2：方向扁平化行為需實測驗證）
    const panelLeaf = workspace.createLeafBySplit(targetNode as WorkspaceLeaf, "vertical", before);

    if (viewType) {
      await panelLeaf.setViewState({
        type: viewType,
        active: false,
        state: {},
      });
    }

    scheduleInitialSplitSizing(panelLeaf, editorLeaf, win);

    await workspace.revealLeaf(panelLeaf);
    workspace.setActiveLeaf(panelLeaf, { focus: true });
    return panelLeaf;
  }

  /**
   * 在指定側欄欄位（頂層 column 元素）內解析目標 tabs 群組：
   * 優先取該欄位中 active leaf 所在的 pane，再取該側最後記憶的 pane，
   * 最後才回退到第一個 pane 的 tabs。
   */
  private getSidebarTabsInColumn(
    win: Window,
    side: PopoutSide,
    columnEl: HTMLElement
  ): WorkspaceParent | null {
    const activeLeaf = this.getActiveLeafInWindow(win);
    if (activeLeaf) {
      const tabs = this.getTabsForLeafInColumn(win, columnEl, activeLeaf);
      if (tabs) return tabs;
    }

    const rememberedTabs = this.lastActivePanesByWindow.get(win)?.[side];
    if (rememberedTabs && this.isTabsInColumn(win, columnEl, rememberedTabs)) {
      return rememberedTabs;
    }

    let firstTabs: WorkspaceParent | null = null;
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (firstTabs) return;
      const tabs = this.getTabsForLeafInColumn(win, columnEl, leaf);
      if (tabs) firstTabs = tabs;
    });
    return firstTabs;
  }

  /** 若 leaf 位於指定 column 元素內，回傳其所屬 tabs 群組；否則 null。 */
  private getTabsForLeafInColumn(win: Window, columnEl: HTMLElement, leaf: WorkspaceLeaf): WorkspaceParent | null {
    if (getWindowOfLeaf(leaf) !== win) return null;
    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (container instanceof HTMLElement && columnEl.contains(container)) {
      return extLeaf.parent ?? null;
    }
    return null;
  }

  /** 判斷記憶中的 tabs 群組是否仍存在於指定 sidebar column。 */
  private isTabsInColumn(win: Window, columnEl: HTMLElement, tabs: WorkspaceParent): boolean {
    if (tabs.containerEl instanceof HTMLElement && columnEl.contains(tabs.containerEl)) {
      return true;
    }

    let found = false;
    this.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (found || getWindowOfLeaf(leaf) !== win) return;
      const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
      if (extLeaf.parent !== tabs) return;
      const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
      if (container instanceof HTMLElement && columnEl.contains(container)) {
        found = true;
      }
    });
    return found;
  }

  /** 攔截器專用：在指定側欄回傳一個 leaf（欄位不存在則建立），供第三方設定 view state。 */
  async openSideLeaf(win: Window, side: PopoutSide): Promise<WorkspaceLeaf> {
    return this.ensureSideColumn(win, side);
  }

  /**
   * 攔截器專用（同步版本）：`app.workspace.getLeftLeaf` 為同步 API，無法 await。
   * 同步建立/回傳側欄 leaf，不進行 reveal / setViewState（由第三方呼叫端後續設定）。
   */
  openSideLeafSync(win: Window, side: PopoutSide): WorkspaceLeaf | null {
    const workspace = this.workspace;
    // 與 ensureSideColumn 相同的主動定位語意：該側沒有側欄欄位時直接建立
    // 新的頂層欄位，不回退塞入現有的最外欄位。
    const columnEl = this.getColumnElement(win, side);

    if (columnEl) {
      const tabs = this.getSidebarTabsInColumn(win, side, columnEl);
      if (tabs) {
        return this.createLeafInTabs(tabs);
      }
    }

    let editorLeaf = this.getActiveLeafInWindow(win) || this.getLastLeafInWindow(win);
    if (!editorLeaf) return null;

    const targetNode = getTopLevelNodeInWindow(editorLeaf) || editorLeaf;
    const isParentNode = targetNode !== editorLeaf && Boolean((targetNode as WorkspaceParent).children);
    const before = side === "left" ? !isParentNode : isParentNode;
    // INTERNAL API: Workspace.createLeafBySplit - d.ts 有宣告但官方文件未記載（asar-findings #2）
    const panelLeaf = workspace.createLeafBySplit(targetNode as WorkspaceLeaf, "vertical", before);

    scheduleInitialSplitSizing(panelLeaf, editorLeaf, win);
    return panelLeaf;
  }

  private createLeafInTabs(tabs: WorkspaceParent | null | undefined): WorkspaceLeaf {
    const workspace = this.workspace;
    const children = (tabs?.children ?? []) as WorkspaceLeaf[];
    // INTERNAL API: Workspace.createLeafInParent - d.ts 有宣告但官方文件未記載（同 createLeafBySplit 的 leaf 層級建立行為）
    const leaf = workspace.createLeafInParent(
      tabs as unknown as Parameters<typeof workspace.createLeafInParent>[0],
      children.length
    );
    return leaf;
  }

  private async openPanelInTabs(tabs: WorkspaceParent | null | undefined, viewType: string): Promise<WorkspaceLeaf> {
    const leaf = this.createLeafInTabs(tabs);
    await leaf.setViewState({
      type: viewType,
      active: true,
      state: {},
    });
    return leaf;
  }

  /** 取得 leaf 所在的已標記 sidebar 側，供三區 pane 記憶使用。 */
  private getSidebarSideForLeaf(win: Window, leaf: WorkspaceLeaf): PopoutSide | null {
    if (getWindowOfLeaf(leaf) !== win) return null;
    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (!(container instanceof HTMLElement)) return null;

    const column = this.getTopLevelColumnForContainer(container);
    if (!isSidebarColumnElement(column)) return null;
    if (column?.classList.contains("mod-left-split")) return "left";
    if (column?.classList.contains("mod-right-split")) return "right";
    if (this.getColumnElement(win, "left") === column) return "left";
    if (this.getColumnElement(win, "right") === column) return "right";
    return null;
  }

  /**
   * 統一入口：在指定 Popout 開啟/聚焦指定 view type。
   * - location "left"/"right"：側欄欄位。
   * - location "tab"：中央編輯區域。
   */
  async openPanel(
    win: Window,
    location: "left" | "right" | "tab",
    viewType: string
  ): Promise<WorkspaceLeaf> {
    if (location === "left" || location === "right") {
      return this.ensureSideColumn(win, location, viewType);
    }
    return this.ensureCenterPanel(win, viewType);
  }

  /** 在指定 Popout 的中央編輯區域開啟/聚焦指定 view type。 */
  async ensureCenterPanel(win: Window, viewType: string): Promise<WorkspaceLeaf> {
    const workspace = this.workspace;
    const panes = this.collectPopoutPanes(win);
    const targetPane = this.pickCenterPopoutPane(panes, win);

    if (targetPane) {
      const existingInTabs = findLeafInTabs(targetPane.tabs, viewType);
      if (existingInTabs) {
        await workspace.revealLeaf(existingInTabs);
        workspace.setActiveLeaf(existingInTabs, { focus: true });
        return existingInTabs;
      }
      return this.openPanelInTabs(targetPane.tabs, viewType);
    }

    const baseLeaf = this.getActiveLeafInWindow(win) ?? this.getLastLeafInWindow(win);
    if (!baseLeaf) {
      const leaf = workspace.getLeaf("tab");
      await leaf.setViewState({
        type: viewType,
        active: true,
        state: {},
      });
      await workspace.revealLeaf(leaf);
      workspace.setActiveLeaf(leaf, { focus: true });
      return leaf;
    }

    const tabs = (baseLeaf as unknown as ExtendedWorkspaceLeaf).parent;
    if (tabs) {
      const existingInTabs = findLeafInTabs(tabs, viewType);
      if (existingInTabs) {
        await workspace.revealLeaf(existingInTabs);
        workspace.setActiveLeaf(existingInTabs, { focus: true });
        return existingInTabs;
      }
    }
    const leaf = await this.openPanelInTabs(tabs, viewType);
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    return leaf;
  }

  private async openPanelInEditor(win: Window, viewType?: string): Promise<WorkspaceLeaf> {
    const workspace = this.workspace;
    const panes = this.collectPopoutPanes(win);
    const targetPane = this.pickCenterPopoutPane(panes, win);

    if (targetPane) {
      if (viewType) {
        const existingInTabs = findLeafInTabs(targetPane.tabs, viewType);
        if (existingInTabs) return existingInTabs;
      }
      return viewType
        ? this.openPanelInTabs(targetPane.tabs, viewType)
        : this.createLeafInTabs(targetPane.tabs);
    }

    const baseLeaf = this.getActiveLeafInWindow(win) ?? this.getLastLeafInWindow(win);
    if (!baseLeaf) {
      const leaf = workspace.getLeaf("tab");
      if (viewType) {
        await leaf.setViewState({ type: viewType, active: true, state: {} });
      }
      return leaf;
    }

    const tabs = (baseLeaf as unknown as ExtendedWorkspaceLeaf).parent;
    if (tabs && viewType) {
      const existingInTabs = findLeafInTabs(tabs, viewType);
      if (existingInTabs) return existingInTabs;
    }
    return viewType ? this.openPanelInTabs(tabs, viewType) : this.createLeafInTabs(tabs);
  }

  /** 判斷 leaf 是否位於 Popout 視窗的「偽側欄」（被 UI 標記為 sidebar 的頂層欄位）中。 */
  isLeafInSideColumn(win: Window, leaf: WorkspaceLeaf | null | undefined): boolean {
    if (!leaf || getWindowOfLeaf(leaf) !== win) return false;
    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (!(container instanceof HTMLElement)) return false;

    return isSidebarColumnElement(this.getTopLevelColumnForContainer(container));
  }

  /** 回傳 container 所在的頂層欄位元素（root split 的 direct child）。 */
  private getTopLevelColumnForContainer(container: HTMLElement): HTMLElement | null {
    const rootEl = findRootSplitElement(container);
    if (!rootEl) return null;
    return getDirectChildOf(rootEl, container);
  }

  /**
   * 取得 Popout 視窗非側欄的「中央編輯區」Tabs 群組。
   * 排除被 UI 標記為 sidebar（window-spaces-sidebar-column）的頂層欄位內 Tabs。
   */
  getCenterPanes(win: Window): PopoutPane[] {
    const panes = this.collectPopoutPanes(win);
    if (panes.length === 0) return [];

    const centerPanes = panes.filter((pane) => {
      const tabs = pane.tabs;
      const container = tabs.containerEl;
      if (container instanceof HTMLElement) {
        if (isSidebarColumnElement(this.getTopLevelColumnForContainer(container))) return false;
      }
      const children = (tabs.children ?? []) as WorkspaceLeaf[];
      for (const leaf of children) {
        const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
        const leafContainer = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
        if (leafContainer instanceof HTMLElement) {
          if (isSidebarColumnElement(this.getTopLevelColumnForContainer(leafContainer))) return false;
        }
      }
      return true;
    });

    return centerPanes;
  }

  /** 判斷 leaf 的 containerEl 目前是否真的顯示在視窗中（非 display:none / 隱藏 tab）。 */
  private isLeafVisibleInPane(leaf: WorkspaceLeaf): boolean {
    const extLeaf = leaf as unknown as ExtendedWorkspaceLeaf;
    const container = extLeaf.containerEl || (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (!(container instanceof HTMLElement)) return false;
    return container.offsetParent !== null;
  }

  /** 以目前 active leaf 或最後記錄的 pane 決定 content-area 目標。 */
  private pickPreferredCenterPopoutPane(panes: PopoutPane[], win: Window): PopoutPane | null {
    const activeLeaf = this.getActiveLeafInWindow(win);
    const activeTabs = activeLeaf
      ? (activeLeaf as unknown as ExtendedWorkspaceLeaf).parent
      : null;
    const activePane = activeTabs ? panes.find((pane) => pane.tabs === activeTabs) : null;
    if (activePane) {
      const remembered = this.lastActivePanesByWindow.get(win) || {};
      remembered.center = activePane.tabs;
      this.lastActivePanesByWindow.set(win, remembered);
      return activePane;
    }

    const rememberedTabs = this.lastActivePanesByWindow.get(win)?.center;
    const rememberedPane = rememberedTabs
      ? panes.find((pane) => pane.tabs === rememberedTabs)
      : null;
    if (rememberedPane) return rememberedPane;

    return this.pickCenterPopoutPane(panes, win);
  }

  /**
   * 同步取得/建立位於 Popout 視窗「中央編輯區」的 WorkspaceLeaf。
   * 用於避免側欄觸發開啟檔案時覆蓋側欄 View。
   */
  getCenterLeafSync(win: Window, newLeaf?: boolean | string): WorkspaceLeaf {
    const workspace = this.workspace;
    const centerPanes = this.getCenterPanes(win);
    const targetPane = this.pickPreferredCenterPopoutPane(centerPanes, win);

    if (targetPane) {
      const isNewTabRequested = newLeaf === true || newLeaf === "tab" || newLeaf === "split";
      if (!isNewTabRequested) {
        const children = (targetPane.tabs.children ?? []) as WorkspaceLeaf[];
        // 使用者預期：開檔落在「目前顯示（active）的 tab」，而非 tab 群組中的
        // 第一個 unpinned tab。該 tab 被 pin 時才開新 tab，避免覆蓋使用者
        // 目前正在看的內容或其他舊 tab。
        const visibleLeaf = children.find((leaf) => this.isLeafVisibleInPane(leaf));
        if (visibleLeaf) {
          const isPinned = Boolean(
            (visibleLeaf as unknown as ExtendedWorkspaceLeaf & { pinned?: boolean }).pinned ||
              (visibleLeaf.getViewState() as { pinned?: boolean })?.pinned
          );
          if (!isPinned) {
            return visibleLeaf;
          }
        }
      }
      return this.createLeafInTabs(targetPane.tabs);
    }

    // 尚無中央編輯區（例如 Popout 只有側欄欄位）：建立新的頂層欄位放中央。
    // Obsidian 的 createLeafBySplit 沿 target leaf 向上找第一個 WorkspaceSplit，
    // 因此對「頂層 tabs」的 leaf 會在 root 層級建欄；對巢狀結構（如 Professional
    // 兩欄皆為 split）則建在欄位內部或抛錯。建立後必須驗證頂層欄位數是否增加。
    const baseLeaf = this.getActiveLeafInWindow(win) || this.getLastLeafInWindow(win);
    if (!baseLeaf) {
      return workspace.getLeaf("tab");
    }

    const targetNode = getTopLevelNodeInWindow(baseLeaf) || baseLeaf;
    const topCountBefore = this.getTopLevelColumnElements(win).length;
    // 建欄前記錄兩側欄位權重（建欄後還原，避免 Obsidian 重排時覆蓋）
    const flexSnapshot = this.getTopLevelColumnElements(win).map(
      (col) => Number(col.style.flexGrow || getComputedStyle(col).flexGrow) || 0
    );
    let centerLeaf: WorkspaceLeaf;
    try {
      // INTERNAL API: Workspace.createLeafBySplit - d.ts 有宣告但官方文件未記載（asar-findings #2：方向扁平化行為）
      centerLeaf = workspace.createLeafBySplit(targetNode as WorkspaceLeaf, "vertical", false);
    } catch {
      centerLeaf = null as unknown as WorkspaceLeaf;
    }
    const topCountAfter = this.getTopLevelColumnElements(win).length;
    if (!centerLeaf || topCountAfter <= topCountBefore) {
      // 巢狀結構無法建立頂層欄位 → fallback：開進「含 editor view 的 tabs」
      // （如 Professional 欄0 內部的編輯群組），否則任一 leaf。
      return this.pickBestEditorLeaf(win) || workspace.getLeaf("tab");
    }

    // 新欄位移到「第一個 column 之後」（index 1），並分配 flex 權重
    const windowRoot = this.getWindowRootOf(win);
    // INTERNAL API: WorkspaceItem.removeChild / WorkspaceItem.insertChild - d.ts 僅宣告 Component 層級 removeChild（非 WorkspaceItem 語意）、insertChild 未宣告（asar-findings：WorkspaceWindow children 操作）
    if (windowRoot && typeof windowRoot.removeChild === "function") {
      const newTabs = (centerLeaf as unknown as ExtendedWorkspaceLeaf).parent;
      if (newTabs) {
        const children = (windowRoot.children ?? []) as WorkspaceParent[];
        const newIdx = children.indexOf(newTabs);
        if (newIdx >= 0 && newIdx !== 1 && typeof windowRoot.insertChild === "function") {
          windowRoot.removeChild(newTabs);
          windowRoot.insertChild(1, newTabs);
        }
      }
    }
    this.applyNewColumnSizing(win, centerLeaf, flexSnapshot);
    return centerLeaf;
  }

  /** 找出「含 editor view」的 leaf（開檔 fallback 用），否則第一個 leaf。 */
  private pickBestEditorLeaf(win: Window): WorkspaceLeaf | null {
    const editorViewTypes = new Set(["markdown", "pdf", "canvas", "excalidraw", "image", "audio", "video"]);
    const leaves = this.getLeavesForWindow(win);
    for (const leaf of leaves) {
      const type = leaf.getViewState()?.type;
      if (type && editorViewTypes.has(type)) return leaf;
    }
    return leaves[0] ?? null;
  }

  /** 取得指定視窗的 window root 節點（type === "window" 的最外層容器）。 */
  private getWindowRootOf(win: Window): WorkspaceParent | null {
    const leaves = this.getLeavesForWindow(win);
    for (const leaf of leaves) {
      let p = (leaf as unknown as ExtendedWorkspaceLeaf).parent;
      while (p) {
        if (p.type === "window" && Array.isArray(p.children)) return p;
        p = p.parent;
      }
    }
    return null;
  }

  /**
   * 新欄位建立後分配權重：最左/最右欄位還原建欄前權重，
   * 新欄位（中央 content）取中間權重。透過 Obsidian 的 setDimension
   * （等同 flex-grow 權重）設定，避免 inline style 被 Obsidian 重算覆蓋。
   */
  private applyNewColumnSizing(win: Window, centerLeaf: WorkspaceLeaf, flexSnapshot: number[]): void {
    const windowRoot = this.getWindowRootOf(win);
    const children = (windowRoot?.children ?? []) as WorkspaceParent[];
    if (children.length < 3) return;
    children.forEach((child, i) => {
      let dimension: number;
      if (i === 0) {
        dimension = flexSnapshot[0] || 20;
      } else if (i === children.length - 1) {
        dimension = flexSnapshot[flexSnapshot.length - 1] || 20;
      } else {
        dimension = 40; // 新中央 content 權重
      }
      const item = child as WorkspaceParent & {
        setDimension?: (value: number) => void;
      };
      // INTERNAL API: WorkspaceItem.setDimension - d.ts 未宣告（asar-findings #8：寫入 split 比例 flex-grow 權重）
      if (typeof item.setDimension === "function") {
        item.setDimension(dimension);
      }
    });
  }

  // ===== 隱藏/還原 =====

  /**
   * 取得 Popout 視窗 Root split 的頂層欄位元素（依 DOM 結構，不依賴幾何測量，
   * 因此即使欄位被 display:none 隱藏仍能正確定址）。
   */
  getTopLevelColumnElements(win: Window): HTMLElement[] {
    const leaves = this.getLeavesForWindow(win);
    if (leaves.length === 0) return [];
    const leaf = leaves[0];
    if (!leaf) return [];
    const container =
      (leaf as unknown as ExtendedWorkspaceLeaf).containerEl ||
      (leaf.view as { containerEl?: HTMLElement } | null)?.containerEl;
    if (!(container instanceof HTMLElement)) return [];

    const rootEl = findRootSplitElement(container);
    if (!rootEl) return [];

    let topEls = Array.from(rootEl.children).filter((el): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      return (
        el.classList.contains("workspace-tabs") ||
        el.classList.contains("workspace-split")
      );
    });

    // 針對 Obsidian popout：`.mod-root` 之下多包一層「欄位容器」split，
    // 實際欄位（tabs/split 並排）是該容器 split 的 children。若不處理，
    // 這裡會把整欄欄位容器當成單一欄位，永遠數不到容器內真正的多欄
    // （導致 enable activity bar 補欄後 getColumnElement 誤判缺欄、補欄
    // 建在巢狀層級）。下鑽規則：僅在 popout 視窗內，且 root 的直接欄位
    // 恰好只有一個 workspace-split（欄位容器）時，取其 children 當頂層欄位。
    const popoutColumnContainer = topEls.length === 1 ? topEls[0] : undefined;
    if (
      isPopoutWindow(win) &&
      popoutColumnContainer &&
      popoutColumnContainer.classList.contains("workspace-split")
    ) {
      const containerChildren = Array.from(popoutColumnContainer.children).filter((el): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false;
        return (
          el.classList.contains("workspace-tabs") ||
          el.classList.contains("workspace-split")
        );
      });
      if (containerChildren.length > 0) {
        topEls = containerChildren;
      }
    }

    return topEls;
  }

  /** 取得指定側「最外側」的頂層欄位（不問是否為 sidebar），供主動 open-in-sidebar 定位。 */
  getEdgeColumnElement(win: Window, side: PopoutSide): HTMLElement | null {
    const topEls = this.getTopLevelColumnElements(win);
    if (topEls.length === 0) return null;
    return side === "left" ? topEls[0] ?? null : topEls[topEls.length - 1] ?? null;
  }

  /**
   * 取得指定側的「物理側欄」頂層欄位元素（DOM 結構優先，display-independent）。
   *
   * 語意：主動/實體定位（open-in-sidebar、hide/show column、隱藏狀態 capture/apply）。
   * - 有 hints（activityBar 寫入的物理側欄映射）：該側有側欄 → 最左/最右欄位；
   *   該側無側欄 → null（側欄可能被 close all 刪除，由 plugin 的完整性守護補欄）。
   * - 無 hints（非 Window Spaces 管理或尚未同步）：以 UI 標記
   *   （window-spaces-sidebar-column class）保守推斷；無標記 → null。
   *
   * 優先判定規則：邊緣欄位是否仍帶該側 sidebar 標記（mod-left-split /
   * mod-right-split）優先於欄位數算術。標記由 activityBar 的
   * syncSidebarColumnClasses 依「activity bar 可見 + 位於最左/最右 + 頂層欄位數
   * ≥ 2」持續同步，只要該側側欄欄位還存在，即使使用者關閉了「內容欄位」使
   * 頂層欄位數低於原始欄位數（2026-08 實測：關閉第 3 欄的兩個 split 後欄位數
   * 由 4 減為 3），此處仍認定側欄存在、不需補欄。僅當側欄真的被 close-all
   * 移除（邊緣欄變成內容欄位、不再帶該側標記）時才落到欄位數算術判缺失。
   *
   * 注意：被動判定（isLeafInSideColumn / getCenterPanes）不使用本方法，
   * 一律以 UI 標記 class 為準，確保開檔排除與視覺樣式永遠一致。
   */
  getColumnElement(win: Window, side: PopoutSide): HTMLElement | null {
    const edge = this.getEdgeColumnElement(win, side);
    if (!edge) return null;

    // 物理側欄標記優先：邊緣欄位仍帶該側 sidebar 標記即代表該側 sidebar 仍然存在。
    // 關閉內容欄位造成的欄位數減少不得判為側欄缺失，否則補欄邏輯會在原本第 1 欄
    // 左側誤補一個新欄（以 activity bar 第一個 view 填滿）。
    const isSidebarForSide =
      side === "left"
        ? edge.classList.contains("mod-left-split")
        : edge.classList.contains("mod-right-split");
    if (isSidebarForSide) return edge;

    const configuredSides = this.sidebarSidesByWindow.get(win);
    if (configuredSides) {
      if (!configuredSides[side]) return null;
      let requiredColumns: number;
      if (typeof configuredSides.originalCount === "number") {
        // 新式 hints：需求欄位數 = 原始欄位數 + activity bar 新開啟的側數。
        // Professional 這類原始 2 欄的空間（兩側皆 sidebar）需求為 2；
        // 原本 3 欄被 close all 破壞成 2 欄時需求為 3 → 回 null → 補欄。
        const initialLeft = configuredSides.initialLeft ?? configuredSides.left;
        const initialRight = configuredSides.initialRight ?? configuredSides.right;
        const leftDelta = (configuredSides.left ? 1 : 0) - (initialLeft ? 1 : 0);
        const rightDelta = (configuredSides.right ? 1 : 0) - (initialRight ? 1 : 0);
        requiredColumns = configuredSides.originalCount + leftDelta + rightDelta;
      } else {
        // 舊式 hints（相容）：需求欄位數 = left + right + 1
        requiredColumns = Number(configuredSides.left) + Number(configuredSides.right) + 1;
      }
      if (this.getTopLevelColumnElements(win).length < Math.max(2, requiredColumns)) return null;
      return edge;
    }
    return isSidebarColumnElement(edge) ? edge : null;
  }

  /** 目前仍可見的頂層欄位數量（display:none 的欄位不計）。 */
  getVisibleColumnCount(win: Window): number {
    return this.getTopLevelColumnElements(win).filter((el) => !isElementHidden(el)).length;
  }

  isColumnHidden(win: Window, side: PopoutSide): boolean {
    const column = this.getColumnElement(win, side);
    return isElementHidden(column) || !!column?.classList.contains("window-spaces-column-hidden");
  }

  hideColumn(win: Window, side: PopoutSide): void {
    const column = this.getColumnElement(win, side);
    if (!column) return;
    // Keep an explicit state class alongside inline display. Obsidian can
    // reapply flex sizing to a popout split after a layout update; the class
    // lets our stylesheet collapse that split's flex basis as well.
    column.classList.add("window-spaces-column-hidden");
    setElementDisplay(column, "none");
  }

  showColumn(win: Window, side: PopoutSide): void {
    const column = this.getColumnElement(win, side);
    if (!column) return;
    column.classList.remove("window-spaces-column-hidden");
    setElementDisplay(column, "");
  }

  hidePaneGroup(leaf: WorkspaceLeaf): void {
    const container = getPaneContainerElement(leaf);
    if (container) setElementDisplay(container, "none");
  }

  // ===== 持久化 =====

  /** 讀取指定視窗目前隱藏的欄位與 pane group。 */
  captureHiddenState(win: Window): PopoutHiddenState {
    const state: PopoutHiddenState = {};

    const leftEl = this.getColumnElement(win, "left");
    if (leftEl) state.leftSidebar = isElementHidden(leftEl);

    const rightEl = this.getColumnElement(win, "right");
    if (rightEl) state.rightSidebar = isElementHidden(rightEl);

    const hiddenIds: string[] = [];
    this.getLeavesForWindow(win).forEach((leaf) => {
      const container = getPaneContainerElement(leaf);
      if (container && isElementHidden(container)) {
        const id = (leaf as unknown as ExtendedWorkspaceLeaf).id;
        if (id) hiddenIds.push(id);
      }
    });
    if (hiddenIds.length > 0) {
      state.hiddenLeafIds = hiddenIds;
    }

    return state;
  }

  /** 於 restore 完成後重新套用隱藏狀態。 */
  applyHiddenState(win: Window, state: PopoutHiddenState | null | undefined): void {
    if (!state || !win || win.closed) return;

    if (state.leftSidebar) this.hideColumn(win, "left");
    if (state.rightSidebar) this.hideColumn(win, "right");

    if (Array.isArray(state.hiddenLeafIds)) {
      state.hiddenLeafIds.forEach((leafId) => {
        const leaf = this.findLeafByIdInWindow(win, leafId);
        if (leaf) this.hidePaneGroup(leaf);
      });
    }
  }
}
