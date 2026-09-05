import type { App, Plugin } from "obsidian";

/**
 * Obsidian 內部 API 型別宣告（INTERNAL API types）
 *
 * 依 review-cheatsheet 規範：對 Obsidian 未公開的內部 API，統一於此宣告
 * 擴充介面，禁止在呼叫端使用 `as any` / `app?: any`。
 *
 * 所有介面皆為 optional / runtime-guarded：呼叫端仍須以 optional chaining
 * 與 `typeof x === "function"` 防禦，不可假設內部 API 必然存在。
 */

/** INTERNAL API: Vault.getConfig - 讀取 vault 設定（如 showUnsupportedFiles）。 */
export interface InternalVault {
  getConfig?(key: string): unknown;
}

/** INTERNAL API: ViewRegistry.isExtensionRegistered - 判斷副檔名是否有註冊檢視。 */
export interface InternalViewRegistry {
  getViewCreatorByType?(type: string): unknown;
  isExtensionRegistered?(ext: string): boolean;
}

/** INTERNAL API: app.plugins - 已載入的社群外掛實例與其 settings。 */
export interface InternalPluginRegistry {
  plugins?: Record<string, Plugin | { settings?: unknown } | undefined>;
}

/** 具內部 API 的 App 擴充。以 `toInternalApp(app)` 或直接型別註記使用。 */
export type InternalApp = App & {
  vault: App["vault"] & InternalVault;
  viewRegistry?: InternalViewRegistry;
  plugins?: InternalPluginRegistry;
};

/** 將 App 安全轉為 InternalApp（不做 runtime 檢查，呼叫端仍須防禦式存取）。 */
export function toInternalApp(app: App | unknown): InternalApp {
  return app as InternalApp;
}

/** 判斷 vault 是否允許顯示未支援檔案（INTERNAL API: vault.getConfig）。 */
export function isShowUnsupportedFilesEnabled(app: App | unknown): boolean {
  const config = toInternalApp(app).vault?.getConfig?.("showUnsupportedFiles");
  return config === true;
}

/**
 * 判斷副檔名是否已註冊檢視（INTERNAL API: viewRegistry.isExtensionRegistered）。
 * viewRegistry 不存在（如純 Node 測試環境）時回傳 null，由呼叫端 fallback。
 */
export function isExtensionRegisteredByRegistry(app: App | unknown, ext: string): boolean | null {
  const registry = toInternalApp(app).viewRegistry;
  if (registry && typeof registry.isExtensionRegistered === "function") {
    return registry.isExtensionRegistered(ext);
  }
  return null;
}

/** file-explorer / Folder Space 樹狀項目的內部結構（monkey-patch 點）。 */
export interface InternalTreeItemLike {
  el?: HTMLElement;
  selfEl?: HTMLElement;
  titleEl?: HTMLElement;
  innerEl?: HTMLElement;
  file?: {
    path: string;
    name?: string;
    children?: InternalTreeItemLike[];
    instanceof?: unknown;
  };
  parent?: InternalTreeItemLike | null;
  collapsed?: boolean;
  sort?: () => void;
  setCollapsed?(collapsed: boolean, recurse: boolean): unknown;
  getTitle?(): string;
  updateTitle?(): void;
  _originalGetTitle?(): string;
}

/** 含 fileItems 的 File Explorer 視圖內部結構。 */
export interface InternalExplorerViewLike {
  app?: App;
  containerEl?: HTMLElement;
  navFileContainerEl?: HTMLElement;
  fileItems?: Record<string, InternalTreeItemLike | undefined>;
}
