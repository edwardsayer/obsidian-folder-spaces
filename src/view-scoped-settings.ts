/**
 * Folder Space 的 **per-panel（per view）** 設定正規化。
 *
 * 這些設定屬於某個 leaf／view 實例，存放於 Obsidian 原生的 leaf view state
 * （`workspace.json` 內該 leaf 的 `state`），而不是 `data.json` 的
 * 「資料夾路徑 → 值」字典。因此：
 * - 同一資料夾開兩個 space 可以各自有不同的 icon／排序。
 * - panel 換資料夾或資料夾改名時，設定跟著 panel 走，不會跟著路徑跑掉。
 *
 * 舊版（0.5.x 以前）把 icon／排序存在 `settings.folderIcons[folderPath]` 與
 * `settings.folderSortOrders[folderPath]`；升級時由 `fallback` 參數一次性帶入
 * view state，之後不再由路徑決定。
 */
import { DEFAULT_VIEW_ICON, resolveViewIcon } from "./settings.js";
import { normalizeSortOrder, type FolderSpaceSortOrder } from "./folder-space-sort-filter.js";

export { DEFAULT_VIEW_ICON };

/** 舊版 per-folder 設定的一次性遷移來源（由 `readLegacyFolderScopedSettings` 產生）。 */
export interface FolderSpaceViewScopedDefaults {
  icon?: string | null;
  sortOrder?: unknown;
}

function firstNonEmptyIcon(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

/**
 * 解析 panel 的 icon：優先使用 view state 的值，其次是一次性遷移來源，
 * 最後回固定預設 icon。無效的 icon id 由 `resolveViewIcon` 正規化
 * （registry 不可用時 fail-open，保留使用者設定）。
 */
export function normalizeViewScopedIcon(stateValue: unknown, fallback?: unknown): string {
  const candidate = firstNonEmptyIcon(stateValue, fallback);
  return candidate ? resolveViewIcon(candidate) : DEFAULT_VIEW_ICON;
}

/** 解析 panel 的排序設定；無效或未設定時回 `null`（由呼叫端決定預設排序）。 */
export function normalizeViewScopedSortOrder(
  stateValue: unknown,
  fallback?: unknown
): FolderSpaceSortOrder | null {
  return normalizeSortOrder(stateValue) ?? normalizeSortOrder(fallback);
}

/** panel 是否使用出廠預設 icon（預設值不特別標記）。 */
export function isDefaultViewScopedIcon(icon: string): boolean {
  return icon === DEFAULT_VIEW_ICON;
}
