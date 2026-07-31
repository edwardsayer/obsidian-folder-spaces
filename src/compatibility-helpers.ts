export const STRUCTURAL_DATA_ATTRIBUTES = new Set([
  "data-file-basename",
  "data-file-extension",
  "data-file-name",
  "data-file-path",
  "data-folder-name",
  "data-folder-path",
  "data-path",
  "data-tooltip-position",
  "data-type"
]);

export const ICON_ELEMENT_SELECTOR =
  ".obsidian-icon-folder-icon, .iconize-icon, .icon-folder-icon, [class*='icon-folder'], [class*='iconize']";

export interface FileExplorerItemLike {
  selfEl?: HTMLElement;
  titleEl?: HTMLElement;
}

export function getItemLabelElement(item: FileExplorerItemLike | undefined): HTMLElement | null {
  return item?.titleEl ?? item?.selfEl ?? null;
}

export function getMirrorAttributes(el: HTMLElement | undefined): Map<string, string> {
  const attributes = new Map<string, string>();
  if (!el) {
    return attributes;
  }

  for (const attribute of Array.from(el.attributes)) {
    if (isMirrorAttribute(attribute.name)) {
      attributes.set(attribute.name, attribute.value);
    }
  }

  return attributes;
}

export function isMirrorAttribute(name: string | null): boolean {
  return Boolean(name?.startsWith("data-") && !STRUCTURAL_DATA_ATTRIBUTES.has(name));
}

export function getSourceIconElement(item: FileExplorerItemLike | undefined): HTMLElement | null {
  const container = item?.selfEl ?? item?.titleEl;
  if (!container) {
    return null;
  }
  return container.querySelector<HTMLElement>(ICON_ELEMENT_SELECTOR);
}

export function mirrorIconElement(
  targetItem: FileExplorerItemLike | undefined,
  sourceIconEl: HTMLElement | null
): void {
  const targetContainer = targetItem?.selfEl ?? targetItem?.titleEl;
  if (!targetContainer) {
    return;
  }

  const existingMirrored = targetContainer.querySelector<HTMLElement>(
    "[data-folder-spaces-mirrored-icon='true']"
  );

  if (!sourceIconEl) {
    existingMirrored?.remove();
    return;
  }

  const newOuterHtml = sourceIconEl.outerHTML;

  if (existingMirrored) {
    if (existingMirrored.getAttribute("data-source-html") !== newOuterHtml) {
      const cloned = sourceIconEl.cloneNode(true) as HTMLElement;
      cloned.setAttribute("data-folder-spaces-mirrored-icon", "true");
      cloned.setAttribute("data-source-html", newOuterHtml);
      existingMirrored.replaceWith(cloned);
    }
    return;
  }

  const cloned = sourceIconEl.cloneNode(true) as HTMLElement;
  cloned.setAttribute("data-folder-spaces-mirrored-icon", "true");
  cloned.setAttribute("data-source-html", newOuterHtml);

  const innerTextEl = targetContainer.querySelector(
    ".tree-item-inner, .nav-file-title-content, .nav-folder-title-content"
  );
  if (innerTextEl) {
    targetContainer.insertBefore(cloned, innerTextEl);
  } else {
    targetContainer.appendChild(cloned);
  }
}

export function findToolbarButton(
  navButtonsEl: HTMLElement | null | undefined,
  kind: "file" | "folder",
  fallbackIndex: number
): HTMLElement | null {
  if (!navButtonsEl) {
    return null;
  }

  const buttons = Array.from(navButtonsEl.querySelectorAll<HTMLElement>(".clickable-icon"));

  for (const btn of buttons) {
    const label = (
      btn.getAttribute("aria-label") ??
      btn.getAttribute("data-tooltip") ??
      ""
    ).toLowerCase();

    const svgClass = (btn.querySelector("svg")?.getAttribute("class") ?? "").toLowerCase();
    const innerHTML = btn.innerHTML.toLowerCase();

    if (kind === "file") {
      const matchesFile =
        label.includes("note") ||
        label.includes("file") ||
        label.includes("筆記") ||
        label.includes("文件") ||
        label.includes("檔案") ||
        label.includes("笔记") ||
        svgClass.includes("document-plus") ||
        svgClass.includes("file-plus") ||
        innerHTML.includes("file-plus") ||
        innerHTML.includes("document-plus");

      if (matchesFile) {
        return btn;
      }
    } else if (kind === "folder") {
      const matchesFolder =
        label.includes("folder") ||
        label.includes("資料夾") ||
        label.includes("文件夹") ||
        svgClass.includes("folder-plus") ||
        innerHTML.includes("folder-plus");

      if (matchesFolder) {
        return btn;
      }
    }
  }

  return buttons[fallbackIndex] ?? null;
}

export function makeNavigable(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const navigableTarget = target as { navigation?: boolean };

  try {
    Object.defineProperty(target, "navigation", {
      get: () => true,
      set: () => {},
      configurable: true,
      enumerable: true
    });
    return true;
  } catch {
    try {
      navigableTarget.navigation = true;
      return Boolean(navigableTarget.navigation);
    } catch {
      return false;
    }
  }
}

export type FolderSpaceViewMode = "tree" | "flat";

export function normalizeState(
  state: unknown
): Record<string, unknown> & { folderPath: string | null; viewMode?: FolderSpaceViewMode } {
  const objectState =
    state && typeof state === "object" ? ({ ...(state as Record<string, unknown>) } as Record<string, unknown>) : {};

  const folderPath = objectState.folderPath;
  objectState.folderPath = typeof folderPath === "string" && folderPath.trim().length > 0 ? folderPath.trim() : null;

  if (objectState.viewMode === "tree" || objectState.viewMode === "flat") {
    objectState.viewMode = objectState.viewMode;
  } else {
    delete objectState.viewMode;
  }

  return objectState as Record<string, unknown> & {
    folderPath: string | null;
    viewMode?: FolderSpaceViewMode;
  };
}

export function isPathInsideFolder(path: string | null | undefined, folderPath: string | null | undefined): boolean {
  if (!path || !folderPath) {
    return false;
  }
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

export function isHTMLElement(value: HTMLElement | undefined): value is HTMLElement {
  return value instanceof HTMLElement;
}
