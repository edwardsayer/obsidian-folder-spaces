import type { FolderSpaceViewMode } from "./compatibility-helpers.js";
export type { FolderSpaceViewMode };

export type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";

export interface FolderSpacesSettings {
  viewIcon: string;
  folderIcons: Record<string, string>;
  defaultOpenLocationMain: FolderSpaceLocation;
  defaultOpenLocationPopout: FolderSpaceLocation;
  defaultViewMode: FolderSpaceViewMode;
  folderViewModes: Record<string, FolderSpaceViewMode>;
}

export const DEFAULT_SETTINGS: FolderSpacesSettings = {
  viewIcon: "lucide-folders",
  folderIcons: {},
  defaultOpenLocationMain: "right-sidebar",
  defaultOpenLocationPopout: "left-sidebar",
  defaultViewMode: "tree",
  folderViewModes: {}
};

export function normalizeSettings(data: unknown): FolderSpacesSettings {
  const settings = getSettingsObject(data);

  return {
    viewIcon: resolveViewIcon(settings.viewIcon),
    folderIcons: normalizeFolderIcons(settings.folderIcons),
    ...resolveOpenLocations(settings),
    defaultViewMode: resolveViewMode(settings.defaultViewMode),
    folderViewModes: normalizeFolderViewModes(settings.folderViewModes)
  };
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

export function resolveViewMode(mode: unknown): FolderSpaceViewMode {
  return mode === "flat" ? "flat" : "tree";
}

export function resolveViewIcon(iconName: string | null | undefined): string {
  const normalized = iconName?.trim();
  if (!normalized) {
    return DEFAULT_SETTINGS.viewIcon;
  }

  return isValidViewIcon(normalized) ? normalized : DEFAULT_SETTINGS.viewIcon;
}

type LegacyFolderSpacesSettings = Partial<FolderSpacesSettings> & { defaultOpenLocation?: unknown };

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
    if (!resolved || resolved === DEFAULT_SETTINGS.viewIcon) {
      continue;
    }
    normalized[trimmedPath] = resolved;
  }
  return normalized;
}
