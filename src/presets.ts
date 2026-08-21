import type {
  FolderSpaceViewMode,
  FolderSpaceDepthMode,
  FolderSpaceContentMode
} from "./compatibility-helpers.js";

/**
 * Folder Space 「檢視預設集」：把 (viewMode, depthMode, contentMode) 三個維度
 * 包裝成易於理解的組合，特別針對父子 panel 連動（cascade）下的角色分工：
 *
 * - explorer（檔案總管）：標準樹狀總管（tree / all / all）——獨立面板最常見預設。
 * - navigate（導覽）：純資料夾樹（tree / all / folders）——父側 Navigator。
 * - columns（欄位）：只列直屬子資料夾（tree / 1 level / folders）——Finder 欄位式 Navigator。
 * - context（脈絡）：受限 2 層資料夾樹（tree / 2 levels / folders）——中間 Bridge 面板。
 * - contents（內容）：扁平全覽（flat / all / all）——終端 child 的現有 flat 群組式總覽。
 * - files（檔案）：遞迴全部檔案清單（flat / all / files）——終端 child，自動 flat。
 *
 * DepthMode 在 Tree 與 Flat 模式下皆完整生效（Flat 模式依 depthLimit 限制遞迴收集群組的深度）。
 */

export type FolderSpacePresetId = "explorer" | "navigate" | "columns" | "context" | "contents" | "files";

export interface FolderSpacePreset {
  id: FolderSpacePresetId;
  viewMode: FolderSpaceViewMode;
  depthMode: FolderSpaceDepthMode;
  contentMode: FolderSpaceContentMode;
}

/** UI 顯示順序。 */
export const FOLDER_SPACE_PRESETS: readonly FolderSpacePreset[] = [
  { id: "explorer", viewMode: "tree", depthMode: "all-level", contentMode: "all" },
  { id: "navigate", viewMode: "tree", depthMode: "all-level", contentMode: "folders" },
  { id: "columns", viewMode: "tree", depthMode: "one-level", contentMode: "folders" },
  { id: "context", viewMode: "tree", depthMode: "two-level", contentMode: "folders" },
  { id: "contents", viewMode: "flat", depthMode: "all-level", contentMode: "all" },
  { id: "files", viewMode: "flat", depthMode: "all-level", contentMode: "files" }
];

export function getPreset(id: unknown): FolderSpacePreset | null {
  return FOLDER_SPACE_PRESETS.find((p) => p.id === id) ?? null;
}

/** 回傳合法 preset id，否則 fallback（用於設定正規化）。 */
export function resolvePresetId(id: unknown, fallback: FolderSpacePresetId): FolderSpacePresetId {
  return getPreset(id)?.id ?? fallback;
}

/** 由目前三個維度比對出對應 preset；無匹配（自訂組合）回傳 null。 */
export function matchPreset(
  viewMode: FolderSpaceViewMode,
  depthMode: FolderSpaceDepthMode,
  contentMode: FolderSpaceContentMode
): FolderSpacePresetId | null {
  for (const preset of FOLDER_SPACE_PRESETS) {
    if (
      viewMode === preset.viewMode &&
      depthMode === preset.depthMode &&
      contentMode === preset.contentMode
    ) {
      return preset.id;
    }
  }
  return null;
}

/** 套用 preset 時要寫入的三個維度（含 files→flat 的一致性保證）。 */
export function presetToState(
  preset: FolderSpacePreset
): { viewMode: FolderSpaceViewMode; depthMode: FolderSpaceDepthMode; contentMode: FolderSpaceContentMode } {
  const viewMode = preset.contentMode === "files" ? "flat" : preset.viewMode;
  return { viewMode, depthMode: preset.depthMode, contentMode: preset.contentMode };
}
