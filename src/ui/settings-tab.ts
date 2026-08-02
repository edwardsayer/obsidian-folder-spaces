import { App, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";

import { t, tf } from "../i18n";
import {
  DEFAULT_SETTINGS,
  type FolderSpaceLocation,
  type FolderSpacesSettings,
  resolveOpenLocation,
  resolveViewIcon
} from "../settings";
import { IconPickerModal } from "./icon-picker-modal";

export interface FolderSpacesSettingsController {
  settings: FolderSpacesSettings;
  getFolderSpaceIcon(): string;
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

    new Setting(containerEl)
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

    const iconSetting = new Setting(containerEl)
      .setName(t("settingsViewIconName"))
      .setDesc(t("settingsViewIconDesc"))
      .setClass("folder-spaces-icon-setting");

    const previewEl = iconSetting.controlEl.createDiv({ cls: "folder-spaces-icon-preview" });
    const currentIconEl = iconSetting.infoEl.createDiv({ cls: "folder-spaces-setting-feedback" });

    const renderSelectedIcon = (iconName: string): void => {
      const icon = resolveViewIcon(iconName);
      previewEl.empty();
      setIcon(previewEl, icon);
      currentIconEl.setText(tf("settingsViewIconCurrent", { icon }));
    };

    iconSetting.addButton((button) => {
      button.setButtonText(t("settingsViewIconChoose")).onClick(() => {
        new IconPickerModal(this.app, this.plugin.getFolderSpaceIcon(), async (icon) => {
          await this.plugin.updateSettings({
            ...this.plugin.settings,
            viewIcon: icon
          });
          renderSelectedIcon(icon);
        }).open();
      });
    });

    iconSetting.addButton((button) => {
      button.setButtonText(t("settingsViewIconReset")).onClick(async () => {
        await this.plugin.updateSettings({
          ...this.plugin.settings,
          viewIcon: DEFAULT_SETTINGS.viewIcon
        });
        renderSelectedIcon(DEFAULT_SETTINGS.viewIcon);
      });
    });

    renderSelectedIcon(this.plugin.settings.viewIcon);
  }
}
