import type { Workspace, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs } from "obsidian";

export interface PopoutPane {
  tabs: WorkspaceTabs;
  left: number;
  width: number;
  center: number;
}

export interface PopoutColumn {
  left: number;
  width: number;
  panes: PopoutPane[];
}

export interface SidebarInfo {
  pane: PopoutPane;
  tabs: WorkspaceTabs;
}

/**
 * 1. 偵測視窗是否為 Popout Window (獨立彈出視窗)
 */
export function isPopoutWindow(win: Window | null | undefined): boolean {
  if (!win) {
    return false;
  }
  // Keep this helper usable in Node-based regression tests, where there is no
  // global Window. In Obsidian the main window normally has neither popout
  // class, so the class check is the authoritative signal.
  const body = win.document?.body;
  if (!body) {
    return false;
  }
  return (
    body.classList.contains("is-popout-window") ||
    body.classList.contains("mod-popout")
  );
}

/**
 * 取得 Leaf 所在的 DOM Window
 */
export function getWindowOfLeaf(leaf: WorkspaceLeaf): Window | null {
  const view = leaf.view as { containerEl?: HTMLElement } | undefined;
  return view?.containerEl?.ownerDocument?.defaultView ?? null;
}

/**
 * 2. 測量 WorkspaceTabs 容器本身的 DOMRect (非 background tab)
 */
export function getPaneRect(tabs: WorkspaceTabs): DOMRect | null {
  const container = (tabs as unknown as { containerEl?: HTMLElement })?.containerEl;
  if (isRectElement(container)) {
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect as DOMRect;
    }
  }
  const children = ((tabs as unknown as { children?: WorkspaceLeaf[] })?.children ?? []) as WorkspaceLeaf[];
  for (const leaf of children) {
    const leafContainer = (leaf.view as { containerEl?: HTMLElement })?.containerEl;
    if (isRectElement(leafContainer)) {
      const rect = leafContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect as DOMRect;
      }
    }
  }
  return null;
}

/**
 * 收集 Popout 視窗中的所有 WorkspaceTabs 面板
 */
export function collectPopoutPanes(win: Window, workspace: Workspace): PopoutPane[] {
  const tabsSet = new Set<WorkspaceTabs>();

  workspace.iterateAllLeaves((leaf) => {
    if (getWindowOfLeaf(leaf) !== win) {
      return;
    }
    // A leaf's immediate parent is its WorkspaceTabs container. Do not rely
    // on internal `type`/`children` fields here: they differ between Obsidian
    // versions and are absent from lightweight test doubles.
    if (leaf.parent) {
      tabsSet.add(leaf.parent as unknown as WorkspaceTabs);
    }
  });

  const panes: PopoutPane[] = [];
  for (const tabs of tabsSet) {
    const rect = getPaneRect(tabs);
    if (!rect) {
      continue;
    }
    panes.push({
      tabs,
      left: rect.left,
      width: rect.width,
      center: rect.left + rect.width / 2
    });
  }

  panes.sort((a, b) => a.left - b.left);
  return panes;
}

/**
 * 3. 收集 Popout 視窗中的水平直欄 (將上下垂直分割歸類為同一個 PopoutColumn)
 */
export function collectPopoutColumns(win: Window, workspace: Workspace): PopoutColumn[] {
  const panes = collectPopoutPanes(win, workspace);
  if (panes.length === 0) {
    return [];
  }

  const columns: PopoutColumn[] = [];
  for (const pane of panes) {
    const paneWidth = pane.width > 0 ? pane.width : 400;
    const matchedColumn = columns.find((col) => {
      const overlap = Math.max(
        0,
        Math.min(pane.left + paneWidth, col.left + col.width) - Math.max(pane.left, col.left)
      );
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
        panes: [pane]
      });
    }
  }

  columns.sort((a, b) => a.left - b.left);
  return columns;
}

/**
 * 4. 尋找標準全高左側欄 (紅框)
 */
export function findTrueLeftSidebar(win: Window, columns: PopoutColumn[]): SidebarInfo | null {
  if (columns.length < 2) {
    return null;
  }
  const leftCol = columns[0];
  if (!leftCol || leftCol.panes.length !== 1) {
    return null;
  }

  const pane = leftCol.panes[0];
  if (!pane) {
    return null;
  }
  const rect = getPaneRect(pane.tabs);
  const winHeight = win.innerHeight || 600;

  if (rect) {
    const isFullHeight = rect.top < winHeight * 0.15 && rect.top + rect.height > winHeight * 0.85;
    if (!isFullHeight) {
      return null;
    }
  }

  return { pane, tabs: pane.tabs };
}

/**
 * 4. 尋找標準全高右側欄 (紅框)
 */
export function findTrueRightSidebar(win: Window, columns: PopoutColumn[]): SidebarInfo | null {
  if (columns.length < 2) {
    return null;
  }
  const rightCol = columns[columns.length - 1];
  if (!rightCol || rightCol.panes.length !== 1) {
    return null;
  }

  const pane = rightCol.panes[0];
  if (!pane) {
    return null;
  }
  const rect = getPaneRect(pane.tabs);
  const winHeight = win.innerHeight || 600;

  if (rect) {
    const isFullHeight = rect.top < winHeight * 0.15 && rect.top + rect.height > winHeight * 0.85;
    if (!isFullHeight) {
      return null;
    }
  }

  return { pane, tabs: pane.tabs };
}

/**
 * 5. 向上追溯至 Popout 視窗層級的最頂層 Split / Tabs 節點
 */
export function getTopLevelNodeInWindow(leaf: WorkspaceLeaf): WorkspaceLeaf | WorkspaceSplit {
  let curr: any = leaf;
  const root = leaf.getRoot();
  while (curr && curr.parent) {
    const parent = curr.parent;
    if (
      !parent.parent ||
      parent === root ||
      parent.type === "root" ||
      parent.isRoot ||
      parent.kind === "root"
    ) {
      return curr;
    }
    curr = parent;
  }
  return curr;
}

/**
 * 選擇 Popout 中央編輯區面板
 */
export function pickCenterPopoutPane(panes: PopoutPane[], win: Window): PopoutPane | null {
  const firstPane = panes[0];
  if (!firstPane) {
    return null;
  }
  if (panes.length === 1) {
    return firstPane;
  }

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
 * 判斷 Leaf 是否屬於指定的 WorkspaceTabs
 */
export function isLeafInTabs(leaf: WorkspaceLeaf, tabs: WorkspaceTabs): boolean {
  if (leaf.parent === (tabs as unknown)) {
    return true;
  }
  const children = ((tabs as unknown as { children?: WorkspaceLeaf[] })?.children ?? []) as WorkspaceLeaf[];
  return children.includes(leaf);
}

function isRectElement(
  value: unknown
): value is { getBoundingClientRect: () => { left: number; top: number; width: number; height: number } } {
  return Boolean(
    value &&
      typeof (value as { getBoundingClientRect?: unknown }).getBoundingClientRect === "function"
  );
}
