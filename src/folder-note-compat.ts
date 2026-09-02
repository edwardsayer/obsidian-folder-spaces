import type { TFolder } from "obsidian";

/**
 * Folder Note 相容層：解析「哪個檔案是某資料夾的 Folder Note」。
 *
 * 設計原則（見 doc/folder-note-compat-design.md）：
 * - 以 folder-notes plugin 自己的 settings 為準，不自行猜測。
 * - plugin 未安裝時以放寬慣例偵測（`資料夾名.*`），且傾向顯示而非隱藏（fail-open）。
 * - 偵測結果用於兩個用途：是否隱藏檔案（follow `hideFolderNote`）與是否顯示 icon。
 *
 * 本模組刻意只依賴 plugin 的 settings 資料結構（公開可讀、相對穩定），
 * 不呼叫 plugin 的內部函數（bundle 私有、不可存取），因此可純函數化、可單元測試。
 */

/** folder-notes plugin 的 settings 中，與 folder note 解析相關的欄位。 */
export interface FolderNotesPluginSettings {
  folderNoteName?: unknown;
  folderNoteType?: unknown;
  storageLocation?: unknown;
  supportedFileTypes?: unknown;
  hideFolderNote?: unknown;
  excludeFolders?: unknown;
  whitelistFolders?: unknown;
}

/** 從 Obsidian plugin registry 讀取 folder-notes 的 settings；未安裝時回傳 null。 */
export function readFolderNotesSettings(app: unknown): FolderNotesPluginSettings | null {
  const plugins = (app as { plugins?: { plugins?: Record<string, { settings?: unknown }> } })?.plugins
    ?.plugins;
  const plugin = plugins?.["folder-notes"];
  const settings = plugin?.settings;
  return settings && typeof settings === "object" ? (settings as FolderNotesPluginSettings) : null;
}

/** 解析 folder note 的結果。 */
export interface FolderNoteInfo {
  /** 解析出的 folder note 檔案路徑；無 note 時為 null。 */
  notePath: string | null;
  /** 是否確定有 note（解析成功，或 has-folder-note class 出現）。 */
  hasNote: boolean;
  /** 是否應隱藏 folder note 檔案（follow plugin hideFolderNote）。 */
  shouldHide: boolean;
}

export interface ResolveFolderNoteOptions {
  /** folder-notes plugin 的 settings（未安裝時為 null）。 */
  folderNotesSettings: FolderNotesPluginSettings | null;
  /** 資料夾 title 是否帶 has-folder-note class（輔助信號，僅在解析失敗時使用）。 */
  hasFolderNoteClass: boolean;
}

const FOLDER_NAME_TEMPLATE = "{{folder_name}}";

/** 依副檔名排序：.md 優先，其餘字母序。 */
function compareNoteExtensions(left: string, right: string): number {
  const leftIsMd = left === ".md";
  const rightIsMd = right === ".md";
  if (leftIsMd !== rightIsMd) {
    return leftIsMd ? -1 : 1;
  }
  return left.localeCompare(right);
}

/**
 * 無 plugin 慣例：`資料夾名.*`（任何副檔名）。
 * 多檔符合時依副檔名優先序取第一個（.md 優先，其餘字母序）。
 * 其餘符合檔一律視為一般檔案（正常顯示）。
 */
function resolveByConvention(folder: TFolder): string | null {
  const candidates: string[] = [];
  for (const child of folder.children) {
    if (!child.name.startsWith(`${folder.name}.`)) {
      continue;
    }
    const dotIndex = child.name.lastIndexOf(".");
    if (dotIndex > 0) {
      candidates.push(child.name.slice(dotIndex));
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort(compareNoteExtensions);
  const noteName = `${folder.name}${candidates[0]}`;
  return folder.path === "/" ? noteName : `${folder.path}/${noteName}`;
}

/**
 * 依 plugin settings 解析 folder note 路徑。
 * 對齊 folder-notes 的 `getFolderNote` 邏輯：
 * - `folderNoteName` 模板（`{{folder_name}}`）代入資料夾名。
 * - `storageLocation === "parentFolder"` 時 note 在父資料夾。
 * - `folderNoteType` 優先，其次 `supportedFileTypes` 依序嘗試。
 */
function resolveByPluginSettings(
  folder: TFolder,
  settings: FolderNotesPluginSettings
): string | null {
  const template = typeof settings.folderNoteName === "string" ? settings.folderNoteName : null;
  if (!template) {
    return null;
  }

  const folderName = folder.name;
  const fileName = template.replace(FOLDER_NAME_TEMPLATE, folderName);

  const isParentFolder =
    settings.storageLocation === "parentFolder" || settings.storageLocation === "outsideFolder";
  const basePath = isParentFolder
    ? folder.path.includes("/")
      ? folder.path.slice(0, folder.path.lastIndexOf("/"))
      : "/"
    : folder.path;
  const pathPrefix = basePath === "/" ? "" : `${basePath}/`;

  const primaryType = normalizeType(settings.folderNoteType);
  const supportedTypes = Array.isArray(settings.supportedFileTypes)
    ? settings.supportedFileTypes
        .map((type) => normalizeType(type))
        .filter((type): type is string => Boolean(type) && type !== primaryType)
    : [];

  // 驗證候選路徑存在：檢查 folder 自身與其父資料夾的 children。
  const candidates = [primaryType, ...supportedTypes].filter(Boolean);
  const searchFolders: TFolder[] = [folder];
  const parent = (folder as { parent?: TFolder | null }).parent;
  if (parent && parent !== folder) {
    searchFolders.push(parent);
  }
  for (const type of candidates) {
    const notePath = `${pathPrefix}${fileName}${type}`;
    if (searchFolders.some((f) => f.children.some((child) => child.path === notePath))) {
      return notePath;
    }
  }
  return null;
}

function normalizeType(type: unknown): string | null {
  if (typeof type !== "string" || !type) {
    return null;
  }
  // folder-notes 的 ".excalidraw" 實際對應 .md
  const normalized = type === ".excalidraw" ? ".md" : type;
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

/** 是否為 folder-notes 排除清單中的資料夾（disableFolderNote 或 whitelist 設為不顯示）。 */
function isExcluded(folder: TFolder, settings: FolderNotesPluginSettings): boolean {
  const excluded = Array.isArray(settings.excludeFolders) ? settings.excludeFolders : [];
  for (const entry of excluded) {
    const path = (entry as { path?: unknown })?.path;
    if (typeof path !== "string") {
      continue;
    }
    // 依 folder-notes 慣例：excludeFolders 中的 disableFolderNote 表示該資料夾不視為有 note
    const disableFolderNote = (entry as { disableFolderNote?: unknown })?.disableFolderNote;
    if (disableFolderNote === true && (path === folder.path || path === "")) {
      return true;
    }
  }
  return false;
}

/**
 * 解析某資料夾的 folder note。
 *
 * - plugin 存在：以 plugin settings 解析（A 層）；失敗時以 `has-folder-note` class 為輔助信號（C 層）。
 * - plugin 不存在：以 `資料夾名.*` 慣例解析（B 層）。
 */
export function resolveFolderNote(folder: TFolder, options: ResolveFolderNoteOptions): FolderNoteInfo {
  const { folderNotesSettings, hasFolderNoteClass } = options;

  if (folderNotesSettings) {
    if (isExcluded(folder, folderNotesSettings)) {
      return { notePath: null, hasNote: false, shouldHide: false };
    }
    const notePath = resolveByPluginSettings(folder, folderNotesSettings);
    if (notePath) {
      const shouldHide = folderNotesSettings.hideFolderNote === true;
      return { notePath, hasNote: true, shouldHide };
    }
    // plugin 存在但解析失敗：不降級到慣例（plugin 可能刻意用非慣例設定）。
    // 以 has-folder-note class 為唯一信號。
    if (hasFolderNoteClass) {
      return { notePath: null, hasNote: true, shouldHide: false };
    }
    return { notePath: null, hasNote: false, shouldHide: false };
  }

  // 無 plugin：慣例偵測，一律不隱藏（fail-open）。
  const notePath = resolveByConvention(folder);
  return {
    notePath,
    hasNote: Boolean(notePath),
    shouldHide: false
  };
}
