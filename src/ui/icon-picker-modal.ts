import { App, FuzzySuggestModal, getIconIds, setIcon } from "obsidian";

import { t } from "../i18n";

export class IconPickerModal extends FuzzySuggestModal<string> {
  private readonly icons: string[];

  constructor(
    app: App,
    private readonly selectedIcon: string,
    private readonly onChoose: (icon: string) => void | Promise<void>
  ) {
    super(app);
    this.icons = getIconIds().slice().sort((left, right) => left.localeCompare(right));
    this.emptyStateText = t("settingsViewIconModalEmpty");
    this.setPlaceholder(t("settingsViewIconModalPlaceholder"));
  }

  override getItems(): string[] {
    return this.icons;
  }

  override getItemText(item: string): string {
    return item;
  }

  override renderSuggestion(item: { item: string }, el: HTMLElement): void {
    const row = el.createDiv({ cls: "folder-spaces-icon-suggestion" });
    const iconEl = row.createDiv({ cls: "folder-spaces-icon-suggestion-preview" });
    setIcon(iconEl, item.item);

    row.createDiv({
      cls: "folder-spaces-icon-suggestion-label",
      text: item.item
    });

    if (item.item === this.selectedIcon) {
      row.addClass("is-selected");
    }
  }

  override onChooseItem(item: string): void {
    void this.onChoose(item);
  }
}
