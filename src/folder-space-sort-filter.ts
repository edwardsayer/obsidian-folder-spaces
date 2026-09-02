/**
 * 純函式：Folder Space 的排序比較器與檔案過濾匹配（不依賴 Obsidian DOM，
 * 可單元測試）。排序/過濾套用在既有 pipeline：scope → content/depth →
 * filter → sort → render。
 */

export type FolderSpaceSortKey = "name" | "mtime" | "ctime";
export type FolderSpaceSortDir = "asc" | "desc";

export interface FolderSpaceSortOrder {
  key: FolderSpaceSortKey;
  dir: FolderSpaceSortDir;
}

export const DEFAULT_FOLDER_SPACE_SORT_ORDER: FolderSpaceSortOrder = { key: "name", dir: "asc" };

export function normalizeSortOrder(value: unknown): FolderSpaceSortOrder | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const key = record.key;
  const dir = record.dir;
  if (key !== "name" && key !== "mtime" && key !== "ctime") {
    return null;
  }
  if (dir !== "asc" && dir !== "desc") {
    return null;
  }
  return { key, dir };
}

/** 大小寫不敏感 substring 匹配（比對「路徑」——含目錄前綴）。 */
export function pathContainsQuery(query: string, path: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return path.toLowerCase().includes(q);
}

/** 樹狀項目的最小介面（只取排序/過濾需要的欄位）。 */
export interface SortableFileLike {
  name: string;
  path?: string;
  stat?: { mtime?: number; ctime?: number };
  children?: unknown[] | null;
}

export interface CompareSortableOptions {
  basePath?: string | null;
  useRelativePath?: boolean;
}

/** 取得檔案/資料夾路徑相對於 basePath 的相對路徑。 */
export function getRelativePath(path: string | undefined, basePath?: string | null): string {
  if (!path) {
    return "";
  }
  if (!basePath) {
    return path;
  }
  const prefix = `${basePath}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function isFolderLike(file: SortableFileLike): boolean {
  return Array.isArray(file.children);
}

/**
 * 資料夾是否含有（自身或）後代「路徑包含 query」的項目——過濾時此資料夾必須
 * 保留並展開祖先鏈。
 */
export function hasMatchingPathDescendant(
  folder: { path: string; children?: unknown[] | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  for (const child of folder.children ?? []) {
    if (typeof child !== "object" || child === null) {
      continue;
    }
    const record = child as { path?: unknown; children?: unknown[] | null };
    if (typeof record.path === "string" && record.path.toLowerCase().includes(q)) {
      return true;
    }
    if (
      Array.isArray(record.children) &&
      hasMatchingPathDescendant(record as { path: string; children: unknown[] | null }, q)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 比較兩個顯示項目：資料夾恆優先（同原生 explorer），其次依 key 與方向。
 * 若指定 useRelativePath（例如 Flat view 下），以相對路徑為基礎進行比較。
 * 回傳負/零/正，供 Array.sort 使用。
 */
export function compareSortableItems(
  left: SortableFileLike,
  right: SortableFileLike,
  order: FolderSpaceSortOrder,
  options?: CompareSortableOptions
): number {
  const leftIsFolder = isFolderLike(left);
  const rightIsFolder = isFolderLike(right);
  if (leftIsFolder !== rightIsFolder) {
    return leftIsFolder ? -1 : 1;
  }

  let result = 0;
  const leftName =
    options?.useRelativePath && typeof left.path === "string"
      ? getRelativePath(left.path, options.basePath)
      : left.name;
  const rightName =
    options?.useRelativePath && typeof right.path === "string"
      ? getRelativePath(right.path, options.basePath)
      : right.name;

  if (order.key === "name") {
    result = leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" });
  } else if (order.key === "mtime") {
    result = (left.stat?.mtime ?? 0) - (right.stat?.mtime ?? 0);
  } else {
    result = (left.stat?.ctime ?? 0) - (right.stat?.ctime ?? 0);
  }
  if (result === 0) {
    return 0;
  }
  return order.dir === "desc" ? -result : result;
}

/** 依 order 排序（in-place，回傳同一陣列）。 */
export function sortByOrder<T extends SortableFileLike>(
  items: T[],
  order: FolderSpaceSortOrder,
  options?: CompareSortableOptions
): T[] {
  return items.sort((a, b) => compareSortableItems(a, b, order, options));
}
