import type { FolderSpaceViewMode, FolderSpaceDepthMode, FolderSpaceContentMode } from "./compatibility-helpers.js";
import type { FolderSpacePresetId } from "./presets.js";
import { resolvePresetId } from "./presets.js";
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
  folderViewModes: Record<string, FolderSpaceViewMode>;
  defaultDepthMode: FolderSpaceDepthMode;
  folderDepthModes: Record<string, FolderSpaceDepthMode>;
  defaultContentMode: FolderSpaceContentMode;
  folderContentModes: Record<string, FolderSpaceContentMode>;
  showRibbonIcon: boolean;
  defaultFollowParentSameWindow: boolean;
  defaultFollowParentNewWindow: boolean;
  defaultPreset: FolderSpacePresetId;
  defaultChildPreset: FolderSpacePresetId;
  autoApplyChildPreset: boolean;
  folderSortOrders: Record<string, FolderSpaceSortOrder>;
}

export const DEFAULT_SETTINGS: FolderSpacesSettings = {
  folderIcons: {},
  defaultOpenLocationMain: "right-sidebar",
  defaultOpenLocationPopout: "left-sidebar",
  defaultViewMode: "tree",
  folderViewModes: {},
  defaultDepthMode: "all-level",
  folderDepthModes: {},
  defaultContentMode: "all",
  folderContentModes: {},
  showRibbonIcon: true,
  defaultFollowParentSameWindow: true,
  defaultFollowParentNewWindow: false,
  defaultPreset: "contents",
  defaultChildPreset: "contents",
  autoApplyChildPreset: true,
  folderSortOrders: {}
};

export function normalizeSettings(data: unknown): FolderSpacesSettings {
  const settings = getSettingsObject(data);

  return {
    folderIcons: normalizeFolderIcons(settings.folderIcons),
    ...resolveOpenLocations(settings),
    defaultViewMode: resolveViewMode(settings.defaultViewMode),
    folderViewModes: normalizeFolderViewModes(settings.folderViewModes),
    defaultDepthMode: resolveDepthMode(settings.defaultDepthMode),
    folderDepthModes: normalizeFolderDepthModes(settings.folderDepthModes),
    defaultContentMode: resolveContentMode(settings.defaultContentMode),
    folderContentModes: normalizeFolderContentModes(settings.folderContentModes),
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
    autoApplyChildPreset: normalizeBoolean(settings.autoApplyChildPreset, DEFAULT_SETTINGS.autoApplyChildPreset),
    folderSortOrders: normalizeFolderSortOrders(settings.folderSortOrders)
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
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as unknown as { getIconIds?: () => string[] }).getIconIds === "function"
  ) {
    return (globalThis as unknown as { getIconIds: () => string[] }).getIconIds();
  }

  try {
    const obsidianModule = require("obsidian") as { getIconIds?: () => string[] };
    return typeof obsidianModule?.getIconIds === "function" ? obsidianModule.getIconIds() : [];
  } catch {
    return [];
  }
}

function normalizeFolderViewModes(data: unknown): Record<string, FolderSpaceViewMode> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalized: Record<string, FolderSpaceViewMode> = {};
  for (const [path, mode] of Object.entries(data as Record<string, unknown>)) {
    const trimmedPath = path.trim();
    if (!trimmedPath || (mode !== "tree" && mode !== "flat")) {
      continue;
    }
    normalized[trimmedPath] = mode;
  }
  return normalized;
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

function normalizeFolderDepthModes(data: unknown): Record<string, FolderSpaceDepthMode> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalized: Record<string, FolderSpaceDepthMode> = {};
  for (const [path, mode] of Object.entries(data as Record<string, unknown>)) {
    const trimmedPath = path.trim();
    if (!trimmedPath || (mode !== "one-level" && mode !== "two-level" && mode !== "all-level")) {
      continue;
    }
    normalized[trimmedPath] = mode;
  }
  return normalized;
}

function normalizeFolderContentModes(data: unknown): Record<string, FolderSpaceContentMode> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const normalized: Record<string, FolderSpaceContentMode> = {};
  for (const [path, mode] of Object.entries(data as Record<string, unknown>)) {
    const trimmedPath = path.trim();
    if (!trimmedPath || (mode !== "folders" && mode !== "files" && mode !== "all")) {
      continue;
    }
    normalized[trimmedPath] = mode;
  }
  return normalized;
}
