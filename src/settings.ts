import type { FolderSpaceViewMode, FolderSpaceDepthMode, FolderSpaceContentMode } from "./compatibility-helpers.js";
import { getIconIds } from "obsidian";

import type { FolderSpacePresetId } from "./presets.js";
import { resolvePresetId, resolveCascadeParentPresetId } from "./presets.js";
import type { FolderSpaceSortOrder } from "./folder-space-sort-filter.js";
import { normalizeSortOrder } from "./folder-space-sort-filter.js";
export type { FolderSpaceViewMode, FolderSpaceDepthMode, FolderSpaceContentMode };
export type { FolderSpaceSortOrder }; 
export type { FolderSpaceSortKey, FolderSpaceSortDir } from "./folder-space-sort-filter.js";

export type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";
export type FolderSpaceDefaultOpenLocation = Exclude<FolderSpaceLocation, "window">;

/**
 * Fixed default icon for Folder Space tabs and menu entries. It is part of the
 * product identity and is not configurable. Individual panels can have their own
 * icon, which lives in the panel's view state (see `view-scoped-settings.ts`)
 * rather than in settings keyed by folder path.
 */
export const DEFAULT_VIEW_ICON = "lucide-folders";

export interface FolderSpacesSettings {
  defaultOpenLocationMain: FolderSpaceDefaultOpenLocation;
  defaultOpenLocationPopout: FolderSpaceDefaultOpenLocation;
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
  alwaysOpenInOtherPanel: boolean;
}

export const DEFAULT_SETTINGS: FolderSpacesSettings = {
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
  alwaysOpenInOtherPanel: true
};

export function normalizeSettings(data: unknown): FolderSpacesSettings {
  const settings = getSettingsObject(data);

  return {
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
    alwaysOpenInOtherPanel: normalizeBoolean(
      settings.alwaysOpenInOtherPanel,
      DEFAULT_SETTINGS.alwaysOpenInOtherPanel
    )
  };
}

/** 舊版 `data.json` 中以資料夾路徑為 key 的設定內容。 */
export interface LegacyFolderScopedSettings {
  folderIcons: Record<string, string>;
  folderSortOrders: Record<string, FolderSpaceSortOrder>;
}

/**
 * 讀取舊版以資料夾路徑為 key 的設定（icon／排序）。
 *
 * v0.5.x 以前 icon 與排序都存在 `data.json`（`folderIcons[folderPath]`、
 * `folderSortOrders[folderPath]`）。現在這兩項屬於 panel（view state），
 * 此函式只作為升級時的一次性 fallback，不再寫回。
 */
export function readLegacyFolderScopedSettings(data: unknown): LegacyFolderScopedSettings {
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    folderIcons: normalizeLegacyFolderIcons(raw.folderIcons),
    folderSortOrders: normalizeLegacyFolderSortOrders(raw.folderSortOrders)
  };
}

function normalizeLegacyFolderSortOrders(data: unknown): Record<string, FolderSpaceSortOrder> {
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

export function resolveOpenLocation(location: unknown): FolderSpaceDefaultOpenLocation {
  return location === "right-sidebar" || location === "editor"
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
): FolderSpaceDefaultOpenLocation {
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
  const iconIds = getObsidianIconIds();
  // 取不到 icon registry 時 fail-open：不能因為「無法驗證」就把使用者的設定丟掉
  // （issue #2：過去的 window.getIconIds 永遠 undefined，導致所有 icon 被靜默清除）。
  if (!iconIds || iconIds.length === 0) {
    return true;
  }
  return iconIds.includes(iconName);
}

/**
 * 讀取 Obsidian icon registry。
 *
 * `getIconIds` 是公開 API，但只從 `obsidian` 模組匯出，Obsidian 並未把它掛到
 * `window`（實機 Obsidian 1.14.5：`typeof window.getIconIds === "undefined"`），
 * 因此必須走模組匯入。
 */
function getObsidianIconIds(): string[] {
  try {
    const ids = getIconIds?.();
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function normalizeLegacyFolderIcons(data: unknown): Record<string, string> {
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

