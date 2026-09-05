import type { FolderSpaceViewMode, FolderSpaceDepthMode, FolderSpaceContentMode } from "./compatibility-helpers.js";
import type { FolderSpacePresetId } from "./presets.js";
import { resolvePresetId, resolveCascadeParentPresetId } from "./presets.js";
import type { FolderSpaceSortOrder } from "./folder-space-sort-filter.js";
import { normalizeSortOrder } from "./folder-space-sort-filter.js";
export type { FolderSpaceViewMode, FolderSpaceDepthMode, FolderSpaceContentMode };
export type { FolderSpaceSortOrder }; 
export type { FolderSpaceSortKey, FolderSpaceSortDir } from "./folder-space-sort-filter.js";

export type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";

/**
 * Fixed default icon for Folder Space tabs and menu entries. It is part of the
 * product identity and is intentionally not user-configurable; only per-folder
 * icons (from the header bar) can be customized.
 */
export const DEFAULT_VIEW_ICON = "lucide-folders";

export interface FolderSpacesSettings {
  folderIcons: Record<string, string>;
  defaultOpenLocationMain: FolderSpaceLocation;
  defaultOpenLocationPopout: FolderSpaceLocation;
  defaultViewMode: FolderSpaceViewMode;
  defaultDepthMode: FolderSpaceDepthMode;
  defaultContentMode: FolderSpaceContentMode;
  showRibbonIcon: boolean;
  defaultFollowParentSameWindow: boolean;
  defaultFollowParentNewWindow: boolean;
  defaultPreset: FolderSpacePresetId;
  defaultChildPreset: FolderSpacePresetId;
  adaptiveCascadeParent: boolean;
  cascadeParentPreset: FolderSpacePresetId;
  folderSortOrders: Record<string, FolderSpaceSortOrder>;
  alwaysOpenInOtherPanel: boolean;
}

export const DEFAULT_SETTINGS: FolderSpacesSettings = {
  folderIcons: {},
  defaultOpenLocationMain: "right-sidebar",
  defaultOpenLocationPopout: "left-sidebar",
  defaultViewMode: "tree",
  defaultDepthMode: "all-level",
  defaultContentMode: "all",
  showRibbonIcon: true,
  defaultFollowParentSameWindow: true,
  defaultFollowParentNewWindow: false,
  defaultPreset: "explorer",
  defaultChildPreset: "contents",
  adaptiveCascadeParent: true,
  cascadeParentPreset: "navigate",
  folderSortOrders: {},
  alwaysOpenInOtherPanel: true
};

export function normalizeSettings(data: unknown): FolderSpacesSettings {
  const settings = getSettingsObject(data);

  return {
    folderIcons: normalizeFolderIcons(settings.folderIcons),
    ...resolveOpenLocations(settings),
    defaultViewMode: resolveViewMode(settings.defaultViewMode),
    defaultDepthMode: resolveDepthMode(settings.defaultDepthMode),
    defaultContentMode: resolveContentMode(settings.defaultContentMode),
    showRibbonIcon: normalizeBoolean(settings.showRibbonIcon, DEFAULT_SETTINGS.showRibbonIcon),
    defaultFollowParentSameWindow: normalizeBoolean(
      settings.defaultFollowParentSameWindow,
      DEFAULT_SETTINGS.defaultFollowParentSameWindow
    ),
    defaultFollowParentNewWindow: normalizeBoolean(
      settings.defaultFollowParentNewWindow,
      DEFAULT_SETTINGS.defaultFollowParentNewWindow
    ),
    defaultPreset: resolvePresetId(settings.defaultPreset, DEFAULT_SETTINGS.defaultPreset),
    defaultChildPreset: resolvePresetId(settings.defaultChildPreset, DEFAULT_SETTINGS.defaultChildPreset),
    adaptiveCascadeParent: normalizeBoolean(settings.adaptiveCascadeParent, DEFAULT_SETTINGS.adaptiveCascadeParent),
    cascadeParentPreset: resolveCascadeParentPresetId(
      settings.cascadeParentPreset,
      DEFAULT_SETTINGS.cascadeParentPreset
    ),
    folderSortOrders: normalizeFolderSortOrders(settings.folderSortOrders),
    alwaysOpenInOtherPanel: normalizeBoolean(
      settings.alwaysOpenInOtherPanel,
      DEFAULT_SETTINGS.alwaysOpenInOtherPanel
    )
  };
}

function normalizeFolderSortOrders(data: unknown): Record<string, FolderSpaceSortOrder> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalized: Record<string, FolderSpaceSortOrder> = {};
  for (const [path, value] of Object.entries(data as Record<string, unknown>)) {
    const trimmedPath = path.trim();
    const order = normalizeSortOrder(value);
    if (!trimmedPath || !order) {
      continue;
    }
    normalized[trimmedPath] = order;
  }
  return normalized;
}

export function resolveOpenLocation(location: unknown): FolderSpaceLocation {
  return location === "right-sidebar" || location === "editor" || location === "window"
    ? location
    : "left-sidebar";
}

/**
 * Resolves the per-window default open locations. When legacy saved data only
 * contains the old single `defaultOpenLocation`, it is applied to both windows
 * so existing users keep their previous behavior.
 */
export function resolveOpenLocations(
  settings: Partial<FolderSpacesSettings> & { defaultOpenLocation?: unknown }
): Pick<FolderSpacesSettings, "defaultOpenLocationMain" | "defaultOpenLocationPopout"> {
  if (settings.defaultOpenLocation !== undefined && settings.defaultOpenLocation !== null) {
    const resolved = resolveOpenLocation(settings.defaultOpenLocation);
    return {
      defaultOpenLocationMain: resolved,
      defaultOpenLocationPopout: resolved
    };
  }

  return {
    defaultOpenLocationMain: resolveOpenLocation(settings.defaultOpenLocationMain),
    defaultOpenLocationPopout: resolveOpenLocation(settings.defaultOpenLocationPopout)
  };
}

export function getDefaultOpenLocation(
  settings: Pick<FolderSpacesSettings, "defaultOpenLocationMain" | "defaultOpenLocationPopout">,
  isPopout: boolean
): FolderSpaceLocation {
  return isPopout ? settings.defaultOpenLocationPopout : settings.defaultOpenLocationMain;
}

export function getDefaultFollowParent(
  settings: Pick<FolderSpacesSettings, "defaultFollowParentSameWindow" | "defaultFollowParentNewWindow">,
  isNewWindow: boolean
): boolean {
  return isNewWindow ? settings.defaultFollowParentNewWindow : settings.defaultFollowParentSameWindow;
}

export function resolveViewMode(mode: unknown): FolderSpaceViewMode {
  return mode === "flat" ? "flat" : "tree";
}

export function resolveViewIcon(iconName: string | null | undefined): string {
  const normalized = iconName?.trim();
  if (!normalized) {
    return DEFAULT_VIEW_ICON;
  }

  return isValidViewIcon(normalized) ? normalized : DEFAULT_VIEW_ICON;
}

type LegacyFolderSpacesSettings = Partial<FolderSpacesSettings> & { defaultOpenLocation?: unknown };

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getSettingsObject(data: unknown): LegacyFolderSpacesSettings {
  if (!data || typeof data !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    ...(data as LegacyFolderSpacesSettings)
  };
}

function isValidViewIcon(iconName: string): boolean {
  return getObsidianIconIds().includes(iconName);
}

function getObsidianIconIds(): string[] {
  // INTERNAL API: getIconIds - Obsidian 全域 API；
  // Electron 中 window === globalThis，測試環境經 globalThis 注入 mock。
  const api = typeof window !== "undefined"
    ? (window as unknown as { getIconIds?: () => string[] })
    : (globalThis as unknown as { getIconIds?: () => string[] });
  if (typeof api.getIconIds === "function") {
    return api.getIconIds();
  }
  return [];
}

function normalizeFolderIcons(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [path, icon] of Object.entries(data as Record<string, unknown>)) {
    const trimmedPath = path.trim();
    if (!trimmedPath || typeof icon !== "string") {
      continue;
    }
    const resolved = resolveViewIcon(icon);
    if (!resolved || resolved === DEFAULT_VIEW_ICON) {
      continue;
    }
    normalized[trimmedPath] = resolved;
  }
  return normalized;
}

export function resolveDepthMode(mode: unknown): FolderSpaceDepthMode {
  return mode === "one-level" || mode === "two-level" ? mode : "all-level";
}

export function resolveContentMode(mode: unknown): FolderSpaceContentMode {
  if (mode === "folders" || mode === "files") {
    return mode;
  }
  return "all";
}

/**
 * 當資料夾更名或搬移時，將個別資料夾設定字典中的路徑 key（含子目錄）遷移至新路徑。
 */
export function migrateFolderPathInSettings(
  settings: FolderSpacesSettings,
  oldPath: string,
  newPath: string
): boolean {
  if (!oldPath || !newPath || oldPath === newPath) {
    return false;
  }

  let changed = false;
  const migrateMap = (map: Record<string, any> | undefined) => {
    if (!map) return;
    for (const key of Object.keys(map)) {
      const val = map[key];
      if (val === undefined) continue;
      if (key === oldPath) {
        map[newPath] = val;
        delete map[key];
        changed = true;
      } else if (key.startsWith(`${oldPath}/`)) {
        const suffix = key.slice(oldPath.length);
        map[`${newPath}${suffix}`] = val;
        delete map[key];
        changed = true;
      }
    }
  };

  migrateMap(settings.folderIcons);
  migrateMap(settings.folderSortOrders);

  return changed;
}

/**
 * 當資料夾被刪除時，將個別資料夾設定字典中的路徑 key（含子目錄）清理刪除。
 */
export function pruneFolderPathFromSettings(
  settings: FolderSpacesSettings,
  deletedPath: string
): boolean {
  if (!deletedPath) {
    return false;
  }

  let changed = false;
  const pruneMap = <T>(map: Record<string, T> | undefined) => {
    if (!map) return;
    for (const key of Object.keys(map)) {
      if (key === deletedPath || key.startsWith(`${deletedPath}/`)) {
        delete map[key];
        changed = true;
      }
    }
  };

  pruneMap(settings.folderIcons);
  pruneMap(settings.folderSortOrders);

  return changed;
}

/**
 * 清理不存在於當前 Vault 實體資料夾清單中的孤兒設定（在設定頁載入時呼叫）。
 */
export function pruneOrphanFolderSettings(
  settings: FolderSpacesSettings,
  existingFolderPaths: Set<string>
): boolean {
  let changed = false;
  const pruneMap = <T>(map: Record<string, T> | undefined) => {
    if (!map) return;
    for (const path of Object.keys(map)) {
      if (path !== "" && !existingFolderPaths.has(path)) {
        delete map[path];
        changed = true;
      }
    }
  };

  pruneMap(settings.folderIcons);
  pruneMap(settings.folderSortOrders);

  return changed;
}

