import { App, Plugin, PluginSettingTab, Setting, TFolder } from "obsidian";
import * as obsidian from "obsidian";

import { t, presetLabel } from "../i18n.js";
import {
  type FolderSpaceLocation,
  type FolderSpacesSettings,
  resolveOpenLocation,
  pruneOrphanFolderSettings
} from "../settings.js";
import { FOLDER_SPACE_PRESETS, resolvePresetId, type FolderSpacePresetId } from "../presets.js";

/**
 * Obsidian `SettingGroup` 的型別宣告（Obsidian 1.12.7+ 新增，
 * 未包含於 obsidian.d.ts 1.10.3/1.12.3）。用於將同一 section 的設定
 * 組合成單一 panel（內部以水平分隔線連接）。
 */
export interface SettingGroupLike {
  settingEl: HTMLElement;
  nameEl?: HTMLElement;
  descEl?: HTMLElement;
  setName(name: string): this;
  setDesc(desc: string): this;
  setHeading(): this;
  addSetting(callback: (setting: Setting) => unknown): this;
  then(callback: (group: this) => unknown): this;
}

type SettingContainer = HTMLElement | SettingGroupLike;

/** Obsidian `SettingGroup` 建構式（1.12.7+；舊版為 undefined）。 */
const SettingGroupCtor = (obsidian as unknown as {
  SettingGroup?: new (containerEl: HTMLElement) => SettingGroupLike;
}).SettingGroup;

export interface FolderSpacesSettingsController {
  settings: FolderSpacesSettings;
  updateSettings(nextSettings: FolderSpacesSettings): Promise<void>;
}

export class FolderSpacesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Plugin & FolderSpacesSettingsController) {
    super(app, plugin);
  }

  getSettingDefinitions(): unknown[] {
    return [];
  }

  /** 建立 SettingGroup（若當前 Obsidian 版本支援）；不支援則回傳 null。 */
  private createGroup(containerEl: HTMLElement): SettingGroupLike | null {
    if (SettingGroupCtor) {
      try {
        return new SettingGroupCtor(containerEl);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** 在 SettingGroup 或 HTMLElement 容器中建立並設定一個 Setting。 */
  private createSettingIn(
    container: SettingContainer,
    configure: (setting: Setting) => void
  ): Setting {
    const group = container as SettingGroupLike;
    if (group && typeof group.addSetting === "function") {
      let result: Setting | undefined;
      group.addSetting((setting) => {
        result = setting;
        configure(setting);
      });
      return result as unknown as Setting;
    }
    const setting = new Setting(container as HTMLElement);
    configure(setting);
    return setting;
  }

  override display(): void {
    const existingFolderPaths = new Set(
      this.app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .map((f) => f.path)
    );
    const pruned = pruneOrphanFolderSettings(this.plugin.settings, existingFolderPaths);
    if (pruned) {
      void this.plugin.updateSettings(this.plugin.settings);
    }

    const { containerEl } = this;
    containerEl.empty();

    // ===== 一般設定 =====
    new Setting(containerEl).setName(t("settingsGeneralSection")).setHeading();
    const generalGroup = this.createGroup(containerEl) ?? containerEl;

    this.createSettingIn(generalGroup, (s) => {
      s.setName(t("settingsShowRibbonIconName"))
        .setDesc(t("settingsShowRibbonIconDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              showRibbonIcon: value
            });
          });
        });
    });

    // ===== 預設開啟位置 =====
    new Setting(containerEl).setName(t("settingsDefaultOpenLocationName")).setHeading();
    const locationGroup = this.createGroup(containerEl) ?? containerEl;

    const renderLocationDropdown = (
      container: SettingContainer,
      name: string,
      desc: string,
      value: FolderSpaceLocation,
      apply: (location: FolderSpaceLocation) => void
    ): void => {
      this.createSettingIn(container, (s) => {
        s.setName(name)
          .setDesc(desc)
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
      });
    };

    renderLocationDropdown(
      locationGroup,
      t("settingsDefaultOpenLocationMainWindow"),
      t("settingsDefaultOpenLocationMainWindowDesc"),
      this.plugin.settings.defaultOpenLocationMain,
      (location) => {
        void this.plugin.updateSettings({
          ...this.plugin.settings,
          defaultOpenLocationMain: location
        });
      }
    );

    renderLocationDropdown(
      locationGroup,
      t("settingsDefaultOpenLocationPopoutWindow"),
      t("settingsDefaultOpenLocationPopoutWindowDesc"),
      this.plugin.settings.defaultOpenLocationPopout,
      (location) => {
        void this.plugin.updateSettings({
          ...this.plugin.settings,
          defaultOpenLocationPopout: location
        });
      }
    );

    // ===== 檢視預設集 =====
    new Setting(containerEl).setName(t("presetSection")).setHeading();
    const presetGroup = this.createGroup(containerEl) ?? containerEl;

    const renderPresetDropdown = (
      container: SettingContainer,
      name: string,
      desc: string,
      value: FolderSpacePresetId,
      apply: (id: FolderSpacePresetId) => void
    ): void => {
      this.createSettingIn(container, (s) => {
        s.setName(name)
          .setDesc(desc)
          .addDropdown((dropdown) => {
            for (const preset of FOLDER_SPACE_PRESETS) {
              dropdown.addOption(preset.id, presetLabel(preset.id));
            }
            dropdown
              .setValue(value)
              .onChange(async (next) => apply(resolvePresetId(next, "explorer")));
          });
      });
    };

    renderPresetDropdown(
      presetGroup,
      t("settingsDefaultPresetName"),
      t("settingsDefaultPresetDesc"),
      this.plugin.settings.defaultPreset,
      (id) => {
        void this.plugin.updateSettings({ ...this.plugin.settings, defaultPreset: id });
      }
    );

    renderPresetDropdown(
      presetGroup,
      t("settingsDefaultChildPresetName"),
      t("settingsDefaultChildPresetDesc"),
      this.plugin.settings.defaultChildPreset,
      (id) => {
        void this.plugin.updateSettings({ ...this.plugin.settings, defaultChildPreset: id });
      }
    );

    this.createSettingIn(presetGroup, (s) => {
      s.setName(t("settingsAutoApplyChildPresetName"))
        .setDesc(t("settingsAutoApplyChildPresetDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.autoApplyChildPreset).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              autoApplyChildPreset: value
            });
          });
        });
    });

    this.createSettingIn(presetGroup, (s) => {
      s.setName(t("settingsAdaptiveCascadeParentName"))
        .setDesc(t("settingsAdaptiveCascadeParentDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.adaptiveCascadeParent).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              adaptiveCascadeParent: value
            });
          });
        });
    });

    renderPresetDropdown(
      presetGroup,
      t("settingsCascadeParentPresetName"),
      t("settingsCascadeParentPresetDesc"),
      this.plugin.settings.cascadeParentPreset,
      (id) => {
        void this.plugin.updateSettings({ ...this.plugin.settings, cascadeParentPreset: id });
      }
    );

    this.createSettingIn(presetGroup, (s) => {
      s.setName(t("settingsDisableFolderNotesInFolderOnlyName"))
        .setDesc(t("settingsDisableFolderNotesInFolderOnlyDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.disableFolderNotesInFolderOnlyView).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              disableFolderNotesInFolderOnlyView: value
            });
          });
        });
    });

    // ===== 跟隨父面板 =====
    new Setting(containerEl).setName(t("settingsDefaultFollowParentName")).setHeading();
    const followParentGroup = this.createGroup(containerEl) ?? containerEl;

    this.createSettingIn(followParentGroup, (s) => {
      s.setName(t("settingsSameWindowName"))
        .setDesc(t("settingsSameWindowDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.defaultFollowParentSameWindow).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              defaultFollowParentSameWindow: value
            });
          });
        });
    });

    this.createSettingIn(followParentGroup, (s) => {
      s.setName(t("settingsNewWindowName"))
        .setDesc(t("settingsNewWindowDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.defaultFollowParentNewWindow).onChange(async (value) => {
            await this.plugin.updateSettings({
              ...this.plugin.settings,
              defaultFollowParentNewWindow: value
            });
          });
        });
    });

    // ===== 預設集規格對照表 =====
    new Setting(containerEl)
      .setName(t("settingsPresetsReferenceHeading"))
      .setDesc(t("settingsPresetsReferenceDesc"))
      .setHeading();
    const referenceGroup = this.createGroup(containerEl) ?? containerEl;

    this.createSettingIn(referenceGroup, (s) => {
      s.settingEl.addClass("folder-spaces-presets-reference-setting");
      const tableContainer = s.settingEl.createDiv({ cls: "folder-spaces-presets-table-container" });
      const table = tableContainer.createEl("table", { cls: "folder-spaces-presets-table" });

      const thead = table.createEl("thead");
      const headerRow = thead.createEl("tr");
      headerRow.createEl("th", { text: t("presetSection") });
      headerRow.createEl("th", { text: `${t("actionTreeView")} / ${t("actionFlatView")}` });
      headerRow.createEl("th", { text: t("settingsDefaultDepthModeName") });
      headerRow.createEl("th", { text: t("settingsDefaultContentModeName") });

      const tbody = table.createEl("tbody");
      for (const preset of FOLDER_SPACE_PRESETS) {
        const row = tbody.createEl("tr");
        const nameCell = row.createEl("td");
        nameCell.createEl("strong", { text: presetLabel(preset.id) });

        row.createEl("td", { text: preset.viewMode === "tree" ? t("actionTreeView") : t("actionFlatView") });
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
    });
  }
}
