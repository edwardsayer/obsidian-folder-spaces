import { getIconIds } from "obsidian";

import type { FolderSpaceViewMode } from "./compatibility-helpers.js";
export type { FolderSpaceViewMode };

export interface FolderSpacesSettings {
  viewIcon: string;
  defaultViewMode: FolderSpaceViewMode;
  folderViewModes: Record<string, FolderSpaceViewMode>;
}

export const DEFAULT_SETTINGS: FolderSpacesSettings = {
  viewIcon: "lucide-folder-closed",
  defaultViewMode: "tree",
  folderViewModes: {}
};

export function normalizeSettings(data: unknown): FolderSpacesSettings {
  const settings = getSettingsObject(data);

  return {
    viewIcon: resolveViewIcon(settings.viewIcon),
    defaultViewMode: resolveViewMode(settings.defaultViewMode),
    folderViewModes: normalizeFolderViewModes(settings.folderViewModes)
  };
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

function getSettingsObject(data: unknown): Partial<FolderSpacesSettings> {
  if (!data || typeof data !== "object") {
    return DEFAULT_SETTINGS;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...(data as Partial<FolderSpacesSettings>)
  };
}

function isValidViewIcon(iconName: string): boolean {
  return getIconIds().includes(iconName);
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
