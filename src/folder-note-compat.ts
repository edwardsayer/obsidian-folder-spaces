import type { App, TFolder } from "obsidian";
import { isExtensionRegisteredByRegistry, isShowUnsupportedFilesEnabled } from "./types.js";

/**
 * Folder Note 相容層：解析「哪個檔案是某資料夾的 Folder Note」。
 *
 * 設計原則（見 dev/specs/folder-note-compat-design.md）：
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
  /** Obsidian App 實例（可選，用於判斷 vault 的 showUnsupportedFiles 與 viewRegistry 是否支援該檔案類型）。 */
  app?: App;
}

const FOLDER_NAME_TEMPLATE = "{{folder_name}}";

/**
 * 判定檔案類型在當前 Obsidian 環境中是否可顯示／開啟：
 * 1. 若 vault 設定 showUnsupportedFiles 為 true，表示使用者允許顯示所有未支援檔案。
 * 2. 否則，副檔名必須已被 Obsidian 視圖註冊（app.viewRegistry.isExtensionRegistered(ext)）。
 * 3. 若無 app 或 viewRegistry 實例（如純 Node 單元測試），預設支援 Obsidian 核心筆記類型：.md 與 .canvas。
 */
export function isNoteFileTypeSupported(extWithoutDotOrWithDot: string, app?: App): boolean {
  const ext = extWithoutDotOrWithDot.startsWith(".")
    ? extWithoutDotOrWithDot.slice(1).toLowerCase()
    : extWithoutDotOrWithDot.toLowerCase();

  if (!ext) {
    return false;
  }

  if (app && isShowUnsupportedFilesEnabled(app)) {
    return true;
  }

  const registered = app ? isExtensionRegisteredByRegistry(app, ext) : null;
  if (registered !== null) {
    return registered;
  }

  return ext === "md" || ext === "canvas";
}

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
 * 無 plugin 慣例：`資料夾名.*`（限制為 Obsidian 可顯示／開啟之筆記檔案類型）。
 * 多檔符合時依副檔名優先序取第一個（.md 優先，其餘字母序）。
 * 其餘符合檔一律視為一般檔案（正常顯示）。
 */
function resolveByConvention(folder: TFolder, app?: App): string | null {
  const candidates: Array<{ path: string; ext: string }> = [];
  for (const child of folder.children) {
    if ("children" in child) {
      continue;
    }
    const dotIndex = child.name.lastIndexOf(".");
    if (dotIndex <= 0) {
      continue;
    }
    const baseName = child.name.slice(0, dotIndex);
    if (baseName !== folder.name) {
      continue;
    }
    const ext = child.name.slice(dotIndex);
    if (!isNoteFileTypeSupported(ext, app)) {
      continue;
    }
    candidates.push({ path: child.path, ext });
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((left, right) => compareNoteExtensions(left.ext, right.ext));
  return candidates[0]?.path ?? null;
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
  const { folderNotesSettings, hasFolderNoteClass, app } = options;

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

  // 無 plugin：慣例偵測（限制為 Obsidian 可顯示／開啟之筆記類型），一律不隱藏（fail-open）。
  const notePath = resolveByConvention(folder, app);
  return {
    notePath,
    hasNote: Boolean(notePath),
    shouldHide: false
  };
}
