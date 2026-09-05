import { Plugin, debounce } from "obsidian";

import {
  getItemLabelElement,
  getMirrorAttributes,
  getSourceIconElement,
  isHTMLElement,
  isMirrorAttribute,
  mirrorIconElement,
  type FileExplorerItemLike
} from "./compatibility-helpers.js";
import { FOLDER_SPACES_VIEW_TYPE } from "./api.js";

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

interface FileExplorerViewLike {
  containerEl?: HTMLElement;
  fileItems?: Record<string, FileExplorerItemLike | undefined>;
  headerDom?: {
    navButtonsEl?: HTMLElement;
  };
}

/**
 * FileExplorerCompatibilityBridge
 *
 * 功用與邊界說明：
 * 1. 本 Bridge 專責將原生 File Explorer DOM 元素上的非結構性 `data-*` 視覺屬性與外掛插入之圖示 DOM 節點
 *    （如 Iconize / Icon Folder 注入的圖示）同步至 Folder Spaces DOM 元素上，維護 UI 圖示與視覺樣式一致性。
 * 2. 邊界限制：本 Bridge 僅複製 DOM 屬性與裝飾 HTML 節點，**不會**複製第三方外掛的 Event Handlers、
 *    內部 State 物件或對原型/類別產生的 Monkey-patch。
 */
export class FileExplorerCompatibilityBridge {
  private readonly mirroredAttributesByElement = new WeakMap<HTMLElement, Set<string>>();
  private readonly observersByContainer = new Map<HTMLElement, MutationObserver>();
  private readonly sync = debounce(() => this.syncNow(), 50, true);

  constructor(private readonly plugin: Plugin) {}

  start(): void {
    this.plugin.app.workspace.onLayoutReady(() => {
      this.refreshObservers();
      this.sync();
    });

    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.refreshObservers();
        this.sync();
      })
    );
    this.plugin.registerEvent(this.plugin.app.workspace.on("file-open", () => this.sync()));
    this.plugin.registerEvent(this.plugin.app.vault.on("create", () => this.sync()));
    this.plugin.registerEvent(this.plugin.app.vault.on("delete", () => this.sync()));
    this.plugin.registerEvent(this.plugin.app.vault.on("rename", () => this.sync()));

    this.plugin.register(() => {
      this.sync.cancel();
      this.disconnectObservers();
    });
  }

  syncNow(): void {
    const targetViews = this.getViewsOfType(FOLDER_SPACES_VIEW_TYPE);

    if (targetViews.length === 0) {
      return;
    }

    const sourceViews = this.getViewsOfType(FILE_EXPLORER_VIEW_TYPE);
    const attributesByPath = sourceViews.length > 0 ? this.getSourceAttributesByPath(sourceViews) : new Map();
    const iconsByPath = sourceViews.length > 0 ? this.getSourceIconsByPath(sourceViews) : new Map();
    const headerAttributes = sourceViews.length > 0 ? this.getHeaderAttributes(sourceViews) : new Map();

    for (const targetView of targetViews) {
      this.mirrorFileItemAttributes(targetView, attributesByPath, iconsByPath);
      this.mirrorHeaderAttributes(targetView, headerAttributes);
    }
  }

  private refreshObservers(): void {
    const sourceContainers = new Set(
      this.getViewsOfType(FILE_EXPLORER_VIEW_TYPE)
        .map((view) => view.containerEl)
        .filter(isHTMLElement)
    );

    for (const [container, observer] of this.observersByContainer) {
      if (!sourceContainers.has(container)) {
        observer.disconnect();
        this.observersByContainer.delete(container);
        this.sync();
      }
    }

    for (const container of sourceContainers) {
      if (this.observersByContainer.has(container)) {
        continue;
      }

      const observer = new MutationObserver((mutations) => {
        const hasRelevantMutation = mutations.some(
          (mutation) =>
            mutation.type === "childList" ||
            (mutation.type === "attributes" && isMirrorAttribute(mutation.attributeName))
        );
        if (hasRelevantMutation) {
          this.sync();
        }
      });
      observer.observe(container, {
        attributes: true,
        childList: true,
        subtree: true
      });
      this.observersByContainer.set(container, observer);
    }
  }

  private disconnectObservers(): void {
    for (const observer of this.observersByContainer.values()) {
      observer.disconnect();
    }
    this.observersByContainer.clear();
  }

  private getViewsOfType(type: string): FileExplorerViewLike[] {
    const views: FileExplorerViewLike[] = [];
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getViewState().type !== type) {
        return;
      }
      const view = leaf.view as FileExplorerViewLike;
      if (view.containerEl?.instanceOf(HTMLElement) && Boolean(view.fileItems)) {
        views.push(view);
      }
    });
    return views;
  }

  private getSourceAttributesByPath(sourceViews: FileExplorerViewLike[]): Map<string, Map<string, string>> {
    const attributesByPath = new Map<string, Map<string, string>>();

    for (const sourceView of sourceViews) {
      for (const [path, item] of Object.entries(sourceView.fileItems ?? {})) {
        const el = getItemLabelElement(item);
        if (!el) {
          continue;
        }

        const attributes = getMirrorAttributes(el);
        if (attributes.size > 0) {
          attributesByPath.set(path, attributes);
        }
      }
    }

    return attributesByPath;
  }

  private getSourceIconsByPath(sourceViews: FileExplorerViewLike[]): Map<string, HTMLElement | null> {
    const iconsByPath = new Map<string, HTMLElement | null>();

    for (const sourceView of sourceViews) {
      for (const [path, item] of Object.entries(sourceView.fileItems ?? {})) {
        const iconEl = getSourceIconElement(item);
        if (iconEl) {
          iconsByPath.set(path, iconEl);
        }
      }
    }

    return iconsByPath;
  }

  private getHeaderAttributes(sourceViews: FileExplorerViewLike[]): Map<string, string> {
    for (const sourceView of sourceViews) {
      const attributes = getMirrorAttributes(sourceView.headerDom?.navButtonsEl);
      if (attributes.size > 0) {
        return attributes;
      }
    }

    return new Map();
  }

  private mirrorFileItemAttributes(
    targetView: FileExplorerViewLike,
    attributesByPath: Map<string, Map<string, string>>,
    iconsByPath: Map<string, HTMLElement | null>
  ): void {
    for (const [path, item] of Object.entries(targetView.fileItems ?? {})) {
      const el = getItemLabelElement(item);
      if (el) {
        this.applyMirroredAttributes(el, attributesByPath.get(path) ?? new Map());
      }
      mirrorIconElement(item, iconsByPath.get(path) ?? null);
    }
  }

  private mirrorHeaderAttributes(targetView: FileExplorerViewLike, attributes: Map<string, string>): void {
    const headerEl = targetView.headerDom?.navButtonsEl;
    if (!headerEl) {
      return;
    }

    this.applyMirroredAttributes(headerEl, attributes);
  }

  private applyMirroredAttributes(targetEl: HTMLElement, nextAttributes: Map<string, string>): void {
    const previousAttributeNames = this.mirroredAttributesByElement.get(targetEl) ?? new Set<string>();

    for (const name of previousAttributeNames) {
      if (!nextAttributes.has(name)) {
        targetEl.removeAttribute(name);
      }
    }

    for (const [name, value] of nextAttributes) {
      targetEl.setAttribute(name, value);
    }

    this.mirroredAttributesByElement.set(targetEl, new Set(nextAttributes.keys()));
  }
}
