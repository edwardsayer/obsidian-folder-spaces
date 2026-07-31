export interface NavigableTreeItem {
  el?: HTMLElement;
  selfEl?: HTMLElement;
  file?: { path: string };
  parent?: NavigableTreeItem | null;
  collapsed?: boolean;
  setCollapsed?: (collapsed: boolean, animate?: boolean) => Promise<void> | void;
}

export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }

  if (el.style?.display === "none" || el.style?.visibility === "hidden") {
    return false;
  }

  let ancestor = el.parentElement;
  while (ancestor) {
    if (ancestor.style?.display === "none") {
      return false;
    }
    if (ancestor.classList?.contains("is-collapsed") && ancestor.classList?.contains("tree-item")) {
      const childrenContainer = ancestor.querySelector(".tree-item-children");
      if (childrenContainer && childrenContainer.contains(el)) {
        return false;
      }
    }
    ancestor = ancestor.parentElement;
  }

  if (typeof el.offsetParent !== "undefined") {
    if (el.offsetWidth <= 0 && el.offsetHeight <= 0 && el.offsetParent === null) {
      return false;
    }
  }

  return true;
}

export function getVisibleTreeItems<T extends NavigableTreeItem>(
  containerEl: HTMLElement | null | undefined,
  filesMap: Map<HTMLElement, { path: string }> | null | undefined,
  fileItems: Record<string, T> | null | undefined
): T[] {
  if (!containerEl || !filesMap || !fileItems) {
    return [];
  }

  const selfEls = Array.from(containerEl.querySelectorAll<HTMLElement>(".tree-item-self"));
  const visibleItems: T[] = [];

  for (const selfEl of selfEls) {
    if (!isElementVisible(selfEl)) {
      continue;
    }

    const treeItemEl = selfEl.closest<HTMLElement>(".tree-item");
    if (!treeItemEl) {
      continue;
    }

    const file = filesMap.get(treeItemEl);
    if (!file) {
      continue;
    }

    const item = fileItems[file.path];
    if (item && !visibleItems.includes(item)) {
      visibleItems.push(item);
    }
  }

  return visibleItems;
}

export function computeNextFocusedItem<T extends NavigableTreeItem>(
  visibleItems: T[],
  focusedItem: T | null | undefined,
  direction: "forwards" | "backwards",
  rootFolderPath?: string | null
): T | null {
  if (visibleItems.length === 0) {
    return null;
  }

  let currentItem = focusedItem;

  if (currentItem && !visibleItems.includes(currentItem)) {
    let ancestor: T | null | undefined = currentItem.parent as T | null | undefined;
    while (ancestor && ancestor.file) {
      if (rootFolderPath && ancestor.file.path === rootFolderPath) {
        break;
      }
      if (visibleItems.includes(ancestor)) {
        currentItem = ancestor;
        break;
      }
      ancestor = ancestor.parent as T | null | undefined;
    }

    if (!currentItem || !visibleItems.includes(currentItem)) {
      currentItem = null;
    }
  }

  if (!currentItem) {
    return direction === "forwards" ? visibleItems[0]! : visibleItems[visibleItems.length - 1]!;
  }

  const currentIndex = visibleItems.indexOf(currentItem);
  if (currentIndex === -1) {
    return direction === "forwards" ? visibleItems[0]! : visibleItems[visibleItems.length - 1]!;
  }

  if (direction === "forwards") {
    const nextIndex = currentIndex + 1;
    return nextIndex < visibleItems.length ? visibleItems[nextIndex]! : currentItem;
  } else {
    const prevIndex = currentIndex - 1;
    return prevIndex >= 0 ? visibleItems[prevIndex]! : currentItem;
  }
}
