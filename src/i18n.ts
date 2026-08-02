import type { getLanguage as GetLanguageFn } from "obsidian";

type LocaleKey =
  | "menuFolderSpaces"
  | "menuFolderSpacesLeftSidebar"
  | "menuFolderSpacesRightSidebar"
  | "menuFolderSpacesEditor"
  | "menuFolderSpacesWindow"
  | "menuFolderSpacesDefault"
  | "commandOpenFolderSpace"
  | "viewName"
  | "emptyTitle"
  | "emptyMissingTitle"
  | "emptyDescription"
  | "rootUnavailable"
  | "nativeCompatibilityTitle"
  | "nativeCompatibilityDescription"
  | "settingsViewIconName"
  | "settingsViewIconDesc"
  | "settingsViewIconChoose"
  | "settingsViewIconReset"
  | "settingsViewIconCurrent"
  | "settingsViewIconModalPlaceholder"
  | "settingsViewIconModalEmpty"
  | "settingsDefaultFolderViewName"
  | "settingsDefaultFolderViewDesc"
  | "settingsDefaultOpenLocationName"
  | "settingsDefaultOpenLocationDesc"
  | "settingsDefaultOpenLocationMainWindow"
  | "settingsDefaultOpenLocationPopoutWindow"
  | "actionGoUp"
  | "actionTreeView"
  | "actionFlatView"
  | "actionToggleFolderView"
  | "actionFolderIcon"
  | "rootFolderModalPlaceholder"
  | "rootFolderModalEmpty"
  | "actionSelectSubfolder"
  | "noSubfolders"
  | "actionFolderMenu"
  | "renameFolderTitle";

type LocaleTable = Record<LocaleKey, string>;

const ENGLISH: LocaleTable = {
  menuFolderSpaces: "Folder Spaces",
  menuFolderSpacesLeftSidebar: "Open in left sidebar",
  menuFolderSpacesRightSidebar: "Open in right sidebar",
  menuFolderSpacesEditor: "Open in editor area",
  menuFolderSpacesWindow: "Open in new window",
  menuFolderSpacesDefault: "Open in default location",
  commandOpenFolderSpace: "Open Folder Space",
  viewName: "Folder Space",
  emptyTitle: "No root folder set",
  emptyMissingTitle: "The configured root folder is unavailable",
  emptyDescription: 'Right-click a folder in the default file explorer and choose "Folder Spaces".',
  rootUnavailable: "The selected root folder is unavailable.",
  nativeCompatibilityTitle: "Folder Spaces is unavailable",
  nativeCompatibilityDescription:
    "This Obsidian version does not expose a compatible native File Explorer API. Update Obsidian or check compatibility before using Folder Spaces.",
  settingsViewIconName: "Folder Space icon",
  settingsViewIconDesc: "Icon shown on Folder Space tabs.",
  settingsViewIconChoose: "Choose icon",
  settingsViewIconReset: "Reset",
  settingsViewIconCurrent: "Current icon: {{icon}}",
  settingsViewIconModalPlaceholder: "Search icons",
  settingsViewIconModalEmpty: "No icons found.",
  settingsDefaultFolderViewName: "Default folder view",
  settingsDefaultFolderViewDesc: "Default view mode for folders.",
  settingsDefaultOpenLocationName: "Default open location",
  settingsDefaultOpenLocationDesc: "The default location where new Folder Space appears.",
  settingsDefaultOpenLocationMainWindow: "Main window",
  settingsDefaultOpenLocationPopoutWindow: "Popout window",
  actionGoUp: "Up to parent folder",
  actionTreeView: "Tree view",
  actionFlatView: "Flat view",
  actionToggleFolderView: "Toggle folder view",
  actionFolderIcon: "Set folder space icon",
  rootFolderModalPlaceholder: "Choose folder",
  rootFolderModalEmpty: "No folders found.",
  actionSelectSubfolder: "Select subfolder",
  noSubfolders: "No subfolders",
  actionFolderMenu: "Folder options",
  renameFolderTitle: "Rename folder"
};

const TRADITIONAL_CHINESE: LocaleTable = {
  menuFolderSpaces: "Folder Spaces",
  menuFolderSpacesLeftSidebar: "在左側邊欄開啟",
  menuFolderSpacesRightSidebar: "在右側邊欄開啟",
  menuFolderSpacesEditor: "在編輯區開啟",
  menuFolderSpacesWindow: "在新視窗開啟",
  menuFolderSpacesDefault: "在預設位置開啟",
  commandOpenFolderSpace: "開啟 Folder Space",
  viewName: "Folder Space",
  emptyTitle: "未設定根目錄",
  emptyMissingTitle: "已設定的根目錄不可用",
  emptyDescription: "請在預設檔案總管中對資料夾按右鍵，然後選擇「Folder Spaces」。",
  rootUnavailable: "所選根目錄不可用。",
  nativeCompatibilityTitle: "Folder Spaces 無法使用",
  nativeCompatibilityDescription:
    "目前的 Obsidian 未提供相容的原生檔案管理器 API。請更新 Obsidian 或確認相容性後再使用 Folder Spaces。",
  settingsViewIconName: "根目錄檢視圖示",
  settingsViewIconDesc: "Folder Space 頁籤顯示的圖示。",
  settingsViewIconChoose: "選擇圖示",
  settingsViewIconReset: "恢復預設",
  settingsViewIconCurrent: "目前圖示：{{icon}}",
  settingsViewIconModalPlaceholder: "搜尋圖示",
  settingsViewIconModalEmpty: "沒有符合的圖示。",
  settingsDefaultFolderViewName: "預設資料夾檢視",
  settingsDefaultFolderViewDesc: "資料夾的預設檢視模式。",
  settingsDefaultOpenLocationName: "預設開啟位置",
  settingsDefaultOpenLocationDesc: "新 Folder Space 開啟時的預設位置。",
  settingsDefaultOpenLocationMainWindow: "主視窗",
  settingsDefaultOpenLocationPopoutWindow: "彈出視窗",
  actionGoUp: "返回上層資料夾",
  actionTreeView: "樹狀檢視",
  actionFlatView: "扁平檢視",
  actionToggleFolderView: "切換資料夾檢視",
  actionFolderIcon: "設定資料夾空間圖示",
  rootFolderModalPlaceholder: "選擇資料夾",
  rootFolderModalEmpty: "沒有資料夾",
  actionSelectSubfolder: "進入子資料夾",
  noSubfolders: "沒有子資料夾",
  actionFolderMenu: "資料夾選項",
  renameFolderTitle: "重新命名資料夾"
};

const SIMPLIFIED_CHINESE: LocaleTable = {
  menuFolderSpaces: "Folder Spaces",
  menuFolderSpacesLeftSidebar: "在左侧边栏打开",
  menuFolderSpacesRightSidebar: "在右侧边栏打开",
  menuFolderSpacesEditor: "在编辑区打开",
  menuFolderSpacesWindow: "在新窗口打开",
  menuFolderSpacesDefault: "在默认位置打开",
  commandOpenFolderSpace: "打开 Folder Space",
  viewName: "Folder Space",
  emptyTitle: "未设置根目录",
  emptyMissingTitle: "已设置的根目录不可用",
  emptyDescription: "请在默认文件管理器中右键点击文件夹，然后选择\u201cFolder Spaces\u201d。",
  rootUnavailable: "所选根目录不可用。",
  nativeCompatibilityTitle: "Folder Spaces 无法使用",
  nativeCompatibilityDescription:
    "当前的 Obsidian 未提供兼容的原生文件管理器 API。请更新 Obsidian 或确认兼容性后再使用 Folder Spaces。",
  settingsViewIconName: "根目录视图图标",
  settingsViewIconDesc: "Folder Space 标签页显示的图标。",
  settingsViewIconChoose: "选择图标",
  settingsViewIconReset: "恢复默认",
  settingsViewIconCurrent: "当前图标：{{icon}}",
  settingsViewIconModalPlaceholder: "搜索图标",
  settingsViewIconModalEmpty: "没有匹配的图标。",
  settingsDefaultFolderViewName: "默认文件夹视图",
  settingsDefaultFolderViewDesc: "文件夹的默认视图模式。",
  settingsDefaultOpenLocationName: "默认打开位置",
  settingsDefaultOpenLocationDesc: "新 Folder Space 打开时的默认位置。",
  settingsDefaultOpenLocationMainWindow: "主窗口",
  settingsDefaultOpenLocationPopoutWindow: "弹出窗口",
  actionGoUp: "返回上层文件夹",
  actionTreeView: "树状视图",
  actionFlatView: "扁平视图",
  actionToggleFolderView: "切换文件夹视图",
  actionFolderIcon: "设置文件夹空间图标",
  rootFolderModalPlaceholder: "选择文件夹",
  rootFolderModalEmpty: "没有文件夹",
  actionSelectSubfolder: "进入子文件夹",
  noSubfolders: "没有子文件夹",
  actionFolderMenu: "文件夹选项",
  renameFolderTitle: "重命名文件夹"
};

function safeGetLanguage(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as unknown as { getLanguage?: () => string }).getLanguage === "function"
  ) {
    return (globalThis as unknown as { getLanguage: () => string }).getLanguage();
  }
  return "en";
}

export function getTable(lang: string = safeGetLanguage()): LocaleTable {
  const normalized = lang.toLowerCase();

  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-tw-") ||
    normalized.startsWith("zh-hk-")
  ) {
    return TRADITIONAL_CHINESE;
  }

  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-sg" ||
    normalized === "zh-hans" ||
    normalized.startsWith("zh-cn-") ||
    normalized.startsWith("zh-sg-")
  ) {
    return SIMPLIFIED_CHINESE;
  }

  return ENGLISH;
}

export function t(key: LocaleKey, lang?: string): string {
  return getTable(lang)[key];
}

export function tf(key: LocaleKey, values: Record<string, string>, lang?: string): string {
  let text = t(key, lang);
  for (const [name, value] of Object.entries(values)) {
    text = text.replace(`{{${name}}}`, value);
  }
  return text;
}
