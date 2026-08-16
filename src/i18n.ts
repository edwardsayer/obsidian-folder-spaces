import type { FolderSpacePresetId } from "./presets.js";

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
  | "iconPickerModalPlaceholder"
  | "iconPickerModalEmpty"
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
  | "renameFolderTitle"
  | "actionSyncFollowParent"
  | "actionSyncSourceFolder"
  | "settingsShowRibbonIconName"
  | "settingsShowRibbonIconDesc"
  | "settingsDefaultFollowParentName"
  | "settingsDefaultFollowParentDesc"
  | "settingsSameWindowName"
  | "settingsNewWindowName"
  | "settingsDisplayOptionsName"
  | "settingsDisplayOptionsDesc"
  | "settingsDefaultDepthModeName"
  | "settingsDefaultDepthModeDesc"
  | "settingsDefaultContentModeName"
  | "settingsDefaultContentModeDesc"
  | "actionViewSettings"
  | "depthModeOneLevel"
  | "depthModeTwoLevel"
  | "depthModeAllLevel"
  | "contentModeFolders"
  | "contentModeFiles"
  | "contentModeAll"
  | "settingsDefaultPresetName"
  | "settingsDefaultPresetDesc"
  | "settingsDefaultChildPresetName"
  | "settingsDefaultChildPresetDesc"
  | "settingsAutoApplyChildPresetName"
  | "settingsAutoApplyChildPresetDesc"
  | "presetNavigate"
  | "presetColumns"
  | "presetContents"
  | "presetFiles"
  | "presetContext"
  | "presetCustom"
  | "presetSection";

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
  iconPickerModalPlaceholder: "Search icons",
  iconPickerModalEmpty: "No icons found.",
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
  renameFolderTitle: "Rename folder",
  actionSyncFollowParent: "Sync focus with parent panel",
  actionSyncSourceFolder: "Synced source folder",
  settingsShowRibbonIconName: "Show ribbon icon",
  settingsShowRibbonIconDesc: "Show a Folder Space icon in the ribbon to open the folder picker.",
  settingsDefaultFollowParentName: "Default follow parent panel",
  settingsDefaultFollowParentDesc: "Whether new child panels sync their folder focus with the parent panel by default.",
  settingsSameWindowName: "Same window",
  settingsNewWindowName: "New window",
  settingsDisplayOptionsName: "Display options",
  settingsDisplayOptionsDesc: "Default display settings for Folder Space views.",
  settingsDefaultDepthModeName: "Default depth",
  settingsDefaultDepthModeDesc: "Whether subfolders are expanded or collapsed by default.",
  settingsDefaultContentModeName: "Default content",
  settingsDefaultContentModeDesc: "What items to show in the folder view by default.",
  actionViewSettings: "View settings",
  depthModeOneLevel: "1 level",
  depthModeTwoLevel: "2 levels",
  depthModeAllLevel: "All levels",
  contentModeFolders: "Folders",
  contentModeFiles: "Files",
  contentModeAll: "All",
  settingsDefaultPresetName: "Default view preset",
  settingsDefaultPresetDesc: "Preset applied to new Folder Space panels.",
  settingsDefaultChildPresetName: "Default child panel preset",
  settingsDefaultChildPresetDesc: "Preset applied to new child panels opened from a parent panel.",
  settingsAutoApplyChildPresetName: "Auto-apply child panel preset",
  settingsAutoApplyChildPresetDesc: "Apply the child preset to panels opened from a parent panel.",
  presetNavigate: "Preset: Navigate",
  presetColumns: "Preset: Columns",
  presetContents: "Preset: Contents",
  presetFiles: "Preset: Files",
  presetContext: "Preset: Context",
  presetCustom: "Custom",
  presetSection: "Preset"
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
  iconPickerModalPlaceholder: "搜尋圖示",
  iconPickerModalEmpty: "沒有符合的圖示。",
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
  renameFolderTitle: "重新命名資料夾",
  actionSyncFollowParent: "與父面板資料夾焦點連動",
  actionSyncSourceFolder: "與子面板連動中的來源資料夾",
  settingsShowRibbonIconName: "顯示功能區圖示",
  settingsShowRibbonIconDesc: "在功能區顯示 Folder Space 圖示，點擊可開啟資料夾選擇器。",
  settingsDefaultFollowParentName: "預設跟隨父面板",
  settingsDefaultFollowParentDesc: "新開啟的子面板是否預設與父面板資料夾焦點連動。",
  settingsSameWindowName: "同視窗",
  settingsNewWindowName: "新視窗",
  settingsDisplayOptionsName: "顯示選項",
  settingsDisplayOptionsDesc: "Folder Space 檢視的預設顯示設定。",
  settingsDefaultDepthModeName: "預設展開層級",
  settingsDefaultDepthModeDesc: "子資料夾的預設展開或收合狀態。",
  settingsDefaultContentModeName: "預設顯示內容",
  settingsDefaultContentModeDesc: "資料夾檢視中預設顯示的項目類型。",
  actionViewSettings: "檢視設定",
  depthModeOneLevel: "1 層",
  depthModeTwoLevel: "2 層",
  depthModeAllLevel: "所有層級",
  contentModeFolders: "資料夾",
  contentModeFiles: "檔案",
  contentModeAll: "全部",
  settingsDefaultPresetName: "預設檢視預設集",
  settingsDefaultPresetDesc: "套用於新開啟的 Folder Space 面板的預設集。",
  settingsDefaultChildPresetName: "預設子面板檢視預設集",
  settingsDefaultChildPresetDesc: "由父面板開啟新子面板時套用的檢視預設集。",
  settingsAutoApplyChildPresetName: "自動套用子面板預設集",
  settingsAutoApplyChildPresetDesc: "從父面板開啟的子面板自動套用子面板預設集。",
  presetNavigate: "預設集：導覽",
  presetColumns: "預設集：欄位",
  presetContents: "預設集：內容",
  presetFiles: "預設集：檔案",
  presetContext: "預設集：脈絡",
  presetCustom: "自訂",
  presetSection: "檢視預設集"
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
  iconPickerModalPlaceholder: "搜索图标",
  iconPickerModalEmpty: "没有匹配的图标。",
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
  renameFolderTitle: "重命名文件夹",
  actionSyncFollowParent: "与父面板文件夹焦点联动",
  actionSyncSourceFolder: "与子面板联动中的来源文件夹",
  settingsShowRibbonIconName: "显示功能区图标",
  settingsShowRibbonIconDesc: "在功能区显示 Folder Space 图标，点击可打开文件夹选择器。",
  settingsDefaultFollowParentName: "默认跟随父面板",
  settingsDefaultFollowParentDesc: "新打开的子面板是否默认与父面板文件夹焦点联动。",
  settingsSameWindowName: "同窗口",
  settingsNewWindowName: "新窗口",
  settingsDisplayOptionsName: "显示选项",
  settingsDisplayOptionsDesc: "Folder Space 视图的默认显示设置。",
  settingsDefaultDepthModeName: "默认展开层级",
  settingsDefaultDepthModeDesc: "子文件夹的默认展开或收起状态。",
  settingsDefaultContentModeName: "默认显示内容",
  settingsDefaultContentModeDesc: "文件夹视图中默认显示的项目类型。",
  actionViewSettings: "视图设置",
  depthModeOneLevel: "1 层",
  depthModeTwoLevel: "2 层",
  depthModeAllLevel: "所有层级",
  contentModeFolders: "文件夹",
  contentModeFiles: "文件",
  contentModeAll: "全部",
  settingsDefaultPresetName: "默认视图预设",
  settingsDefaultPresetDesc: "应用于新打开的 Folder Space 面板的预设。",
  settingsDefaultChildPresetName: "默认子面板视图预设",
  settingsDefaultChildPresetDesc: "从父面板打开新的子面板时应用的视图预设。",
  settingsAutoApplyChildPresetName: "自动应用子面板预设",
  settingsAutoApplyChildPresetDesc: "从父面板打开的子面板自动应用子面板预设。",
  presetNavigate: "预设：导航",
  presetColumns: "预设：栏目",
  presetContents: "预设：内容",
  presetFiles: "预设：文件",
  presetContext: "预设：脉络",
  presetCustom: "自定义",
  presetSection: "视图预设"
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

const PRESET_NAME_KEYS: Record<FolderSpacePresetId, LocaleKey> = {
  navigate: "presetNavigate",
  columns: "presetColumns",
  contents: "presetContents",
  files: "presetFiles",
  context: "presetContext"
};

/** 回傳 presets 的本地化名稱（型別安全的 key lookup）。 */
export function presetLabel(id: FolderSpacePresetId, lang?: string): string {
  return t(PRESET_NAME_KEYS[id], lang);
}
