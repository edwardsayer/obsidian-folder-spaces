import { App, Plugin, PluginSettingTab } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";

import { t, presetLabel } from "../i18n.js";
import {
  type FolderSpaceLocation,
  type FolderSpacesSettings
} from "../settings.js";
import {
  FOLDER_SPACE_PRESETS,
  CASCADE_PARENT_PRESETS,
  type FolderSpacePresetId
} from "../presets.js";

export interface FolderSpacesSettingsController {
  settings: FolderSpacesSettings;
  updateSettings(nextSettings: FolderSpacesSettings): Promise<void>;
}

export class FolderSpacesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Plugin & FolderSpacesSettingsController) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: t("settingsGeneralSection"),
        items: [
          {
            name: t("settingsShowRibbonIconName"),
            desc: t("settingsShowRibbonIconDesc"),
            control: { type: "toggle", key: "showRibbonIcon" }
          },
          {
            name: t("settingsAlwaysOpenInOtherPanelName"),
            desc: t("settingsAlwaysOpenInOtherPanelDesc"),
            control: { type: "toggle", key: "alwaysOpenInOtherPanel" }
          }
        ]
      },
      {
        type: "group",
        heading: t("settingsDefaultOpenLocationName"),
        items: [
          {
            name: t("settingsDefaultOpenLocationMainWindow"),
            desc: t("settingsDefaultOpenLocationMainWindowDesc"),
            control: {
              type: "dropdown",
              key: "defaultOpenLocationMain",
              options: this.getLocationOptions()
            }
          },
          {
            name: t("settingsDefaultOpenLocationPopoutWindow"),
            desc: t("settingsDefaultOpenLocationPopoutWindowDesc"),
            control: {
              type: "dropdown",
              key: "defaultOpenLocationPopout",
              options: this.getLocationOptions()
            }
          }
        ]
      },
      {
        type: "group",
        heading: t("presetSection"),
        items: [
          {
            name: t("settingsDefaultPresetName"),
            desc: t("settingsDefaultPresetDesc"),
            control: { type: "dropdown", key: "defaultPreset", options: this.getPresetOptions() }
          },
          {
            name: t("settingsDefaultChildPresetName"),
            desc: t("settingsDefaultChildPresetDesc"),
            control: { type: "dropdown", key: "defaultChildPreset", options: this.getPresetOptions() }
          }
        ]
      },
      {
        type: "group",
        heading: t("settingsCascadeSection"),
        items: [
          {
            name: t("settingsAdaptiveCascadeParentName"),
            desc: t("settingsAdaptiveCascadeParentDesc"),
            control: { type: "toggle", key: "adaptiveCascadeParent" }
          },
          {
            name: t("settingsCascadeParentPresetName"),
            desc: t("settingsCascadeParentPresetDesc"),
            control: {
              type: "dropdown",
              key: "cascadeParentPreset",
              options: this.getPresetOptions(CASCADE_PARENT_PRESETS)
            }
          },
          {
            name: t("settingsSameWindowName"),
            desc: t("settingsSameWindowDesc"),
            control: { type: "toggle", key: "defaultFollowParentSameWindow" }
          },
          {
            name: t("settingsNewWindowName"),
            desc: t("settingsNewWindowDesc"),
            control: { type: "toggle", key: "defaultFollowParentNewWindow" }
          }
        ]
      },
      {
        name: t("settingsPresetsReferenceHeading"),
        desc: t("settingsPresetsReferenceDesc"),
        render: (setting) => {
          setting.settingEl.addClass("folder-spaces-presets-reference-setting");
          setting.infoEl.remove();
          setting.controlEl.remove();

          const tableContainer = setting.settingEl.createDiv({ cls: "folder-spaces-presets-table-container" });
          const table = tableContainer.createEl("table", { cls: "folder-spaces-presets-table" });
          const headerRow = table.createEl("thead").createEl("tr");
          headerRow.createEl("th", { text: t("presetTableHeaderPreset") });
          headerRow.createEl("th", { text: t("presetTableHeaderViewType") });
          headerRow.createEl("th", { text: t("presetTableHeaderDepth") });
          headerRow.createEl("th", { text: t("presetTableHeaderContent") });

          const tbody = table.createEl("tbody");
          for (const preset of FOLDER_SPACE_PRESETS) {
            const row = tbody.createEl("tr");
            row.createEl("td", {
              cls: "folder-spaces-preset-name",
              text: presetLabel(preset.id)
            });
            row.createEl("td", {
              text: preset.viewMode === "tree" ? t("actionTreeView") : t("actionFlatView")
            });
            row.createEl("td", {
              text:
                preset.depthMode === "one-level"
                  ? t("depthModeOneLevel")
                  : preset.depthMode === "two-level"
                    ? t("depthModeTwoLevel")
                    : t("depthModeAllLevel")
            });
            row.createEl("td", {
              text:
                preset.contentMode === "folders"
                  ? t("contentModeFolders")
                  : preset.contentMode === "files"
                    ? t("contentModeFiles")
                    : t("contentModeAll")
            });
          }
        }
      }
    ] satisfies SettingDefinitionItem[];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const next = { ...this.plugin.settings, [key]: value };
    await this.plugin.updateSettings(next);
  }

  private getLocationOptions(): Record<FolderSpaceLocation, string> {
    return {
      "left-sidebar": t("menuFolderSpacesLeftSidebar"),
      "right-sidebar": t("menuFolderSpacesRightSidebar"),
      editor: t("menuFolderSpacesEditor"),
      window: t("menuFolderSpacesWindow")
    };
  }

  private getPresetOptions(
    allowedPresetIds?: readonly FolderSpacePresetId[]
  ): Record<string, string> {
    const presets = allowedPresetIds
      ? FOLDER_SPACE_PRESETS.filter((preset) => allowedPresetIds.includes(preset.id))
      : FOLDER_SPACE_PRESETS;
    return Object.fromEntries(presets.map((preset) => [preset.id, presetLabel(preset.id)]));
  }
}
