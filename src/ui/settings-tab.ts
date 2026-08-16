import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

import { t } from "../i18n";
import { presetLabel } from "../i18n";
import {
  type FolderSpaceLocation,
  type FolderSpacesSettings,
  resolveOpenLocation,
  resolveDepthMode,
  resolveContentMode
} from "../settings";
import { FOLDER_SPACE_PRESETS, resolvePresetId, type FolderSpacePresetId } from "../presets";

export interface FolderSpacesSettingsController {
  settings: FolderSpacesSettings;
  updateSettings(nextSettings: FolderSpacesSettings): Promise<void>;
}

export class FolderSpacesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Plugin & FolderSpacesSettingsController) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const optionsPanel = containerEl.createDiv({ cls: "folder-spaces-options-panel" });
    optionsPanel
      .createDiv({ cls: "folder-spaces-options-panel-title" })
      .setText(t("settingsDefaultOpenLocationName"));
    optionsPanel
      .createDiv({ cls: "folder-spaces-options-panel-desc" })
      .setText(t("settingsDefaultOpenLocationDesc"));

    const renderLocationDropdown = (
      panel: HTMLElement,
      name: string,
      value: FolderSpaceLocation,
      apply: (location: FolderSpaceLocation) => void
    ): void => {
      new Setting(panel)
        .setName(name)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("left-sidebar", t("menuFolderSpacesLeftSidebar"))
            .addOption("right-sidebar", t("menuFolderSpacesRightSidebar"))
            .addOption("editor", t("menuFolderSpacesEditor"))
            .addOption("window", t("menuFolderSpacesWindow"))
            .setValue(value)
            .onChange(async (next) => {
              apply(resolveOpenLocation(next as FolderSpaceLocation));
            });
        });
    };

    renderLocationDropdown(
      optionsPanel,
      t("settingsDefaultOpenLocationMainWindow"),
      this.plugin.settings.defaultOpenLocationMain,
      (location) => {
        void this.plugin.updateSettings({
          ...this.plugin.settings,
          defaultOpenLocationMain: location
        });
      }
    );

    renderLocationDropdown(
      optionsPanel,
      t("settingsDefaultOpenLocationPopoutWindow"),
      this.plugin.settings.defaultOpenLocationPopout,
      (location) => {
        void this.plugin.updateSettings({
          ...this.plugin.settings,
          defaultOpenLocationPopout: location
        });
      }
    );

    const displayPanel = containerEl.createDiv({ cls: "folder-spaces-options-panel" });
    displayPanel
      .createDiv({ cls: "folder-spaces-options-panel-title" })
      .setText(t("settingsDisplayOptionsName"));
    displayPanel
      .createDiv({ cls: "folder-spaces-options-panel-desc" })
      .setText(t("settingsDisplayOptionsDesc"));

    new Setting(displayPanel)
      .setName(t("settingsDefaultFolderViewName"))
      .setDesc(t("settingsDefaultFolderViewDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("tree", t("actionTreeView"))
          .addOption("flat", t("actionFlatView"))
          .setValue(this.plugin.settings.defaultViewMode)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              defaultViewMode: value === "flat" ? "flat" : "tree"
            });
          });
      });

    new Setting(displayPanel)
      .setName(t("settingsDefaultDepthModeName"))
      .setDesc(t("settingsDefaultDepthModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("one-level", t("depthModeOneLevel"))
          .addOption("two-level", t("depthModeTwoLevel"))
          .addOption("all-level", t("depthModeAllLevel"))
          .setValue(this.plugin.settings.defaultDepthMode)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              defaultDepthMode: resolveDepthMode(value)
            });
          });
      });

    new Setting(displayPanel)
      .setName(t("settingsDefaultContentModeName"))
      .setDesc(t("settingsDefaultContentModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("folders", t("contentModeFolders"))
          .addOption("files", t("contentModeFiles"))
          .addOption("all", t("contentModeAll"))
          .setValue(this.plugin.settings.defaultContentMode)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              defaultContentMode: resolveContentMode(value)
            });
          });
      });

    const presetPanel = containerEl.createDiv({ cls: "folder-spaces-options-panel" });
    presetPanel
      .createDiv({ cls: "folder-spaces-options-panel-title" })
      .setText(t("settingsDefaultPresetName"));
    presetPanel
      .createDiv({ cls: "folder-spaces-options-panel-desc" })
      .setText(t("settingsDefaultPresetDesc"));

    const renderPresetDropdown = (
      panel: HTMLElement,
      name: string,
      desc: string,
      value: FolderSpacePresetId,
      apply: (id: FolderSpacePresetId) => void
    ): void => {
      new Setting(panel).setName(name).setDesc(desc).addDropdown((dropdown) => {
        for (const preset of FOLDER_SPACE_PRESETS) {
          dropdown.addOption(preset.id, presetLabel(preset.id));
        }
        dropdown
          .setValue(value)
          .onChange(async (next) => apply(resolvePresetId(next, "contents")));
      });
    };

    renderPresetDropdown(
      presetPanel,
      t("settingsDefaultPresetName"),
      t("settingsDefaultPresetDesc"),
      this.plugin.settings.defaultPreset,
      (id) => {
        void this.plugin.updateSettings({ ...this.plugin.settings, defaultPreset: id });
      }
    );

    renderPresetDropdown(
      presetPanel,
      t("settingsDefaultChildPresetName"),
      t("settingsDefaultChildPresetDesc"),
      this.plugin.settings.defaultChildPreset,
      (id) => {
        void this.plugin.updateSettings({ ...this.plugin.settings, defaultChildPreset: id });
      }
    );

    new Setting(presetPanel)
      .setName(t("settingsAutoApplyChildPresetName"))
      .setDesc(t("settingsAutoApplyChildPresetDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoApplyChildPreset).onChange(async (value) => {
          await this.plugin.updateSettings({
            ...this.plugin.settings,
            autoApplyChildPreset: value
          });
        });
      });

    new Setting(containerEl)
      .setName(t("settingsShowRibbonIconName"))
      .setDesc(t("settingsShowRibbonIconDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
          await this.plugin.updateSettings({
            ...this.plugin.settings,
            showRibbonIcon: value
          });
        });
      });

    const followParentPanel = containerEl.createDiv({ cls: "folder-spaces-options-panel" });
    followParentPanel
      .createDiv({ cls: "folder-spaces-options-panel-title" })
      .setText(t("settingsDefaultFollowParentName"));
    followParentPanel
      .createDiv({ cls: "folder-spaces-options-panel-desc" })
      .setText(t("settingsDefaultFollowParentDesc"));

    new Setting(followParentPanel)
      .setName(t("settingsSameWindowName"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.defaultFollowParentSameWindow).onChange(async (value) => {
          await this.plugin.updateSettings({
            ...this.plugin.settings,
            defaultFollowParentSameWindow: value
          });
        });
      });

    new Setting(followParentPanel)
      .setName(t("settingsNewWindowName"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.defaultFollowParentNewWindow).onChange(async (value) => {
          await this.plugin.updateSettings({
            ...this.plugin.settings,
            defaultFollowParentNewWindow: value
          });
        });
      });
  }
}
