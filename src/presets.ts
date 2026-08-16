import type {
  FolderSpaceViewMode,
  FolderSpaceDepthMode,
  FolderSpaceContentMode
} from "./compatibility-helpers.js";

/**
 * Folder Space 「檢視預設集」：把 (viewMode, depthMode, contentMode) 三個維度
 * 包裝成易於理解的組合，特別針對父子 panel 連動（cascade）下的角色分工：
 *
 * - navigate（導覽）：純資料夾樹（tree / all / folders）——父側 Navigator。
 * - columns（欄位）：只列直屬子資料夾（tree / 1 level / folders）——Finder 欄位式
 *   Navigator；在連動鏈中逐層往下傳（depth=1 時資料夾子項目被隱藏，因此 standalone
 *   無法自行下鑽，需配合 follow child）。
 * - contents（內容）：扁平全覽（flat / all / all）——終端 child 的現有 flat 群組式總覽。
 * - files（檔案）：遞迴全部檔案清單（flat / all / files）——終端 child，自動 flat。
 * - context（脈絡）：受限 2 層的樹狀脈絡（tree / 2 levels / all）——中間 child。
 *
 * flat 模式下 depth 被忽略（「扁平」一律全層），故比對/套用時對 flat preset 不看 depth。
 */

export type FolderSpacePresetId = "navigate" | "columns" | "contents" | "files" | "context";

export interface FolderSpacePreset {
  id: FolderSpacePresetId;
  viewMode: FolderSpaceViewMode;
  depthMode: FolderSpaceDepthMode;
  contentMode: FolderSpaceContentMode;
}

/** UI 顯示順序（context 依需求排最後）。 */
export const FOLDER_SPACE_PRESETS: readonly FolderSpacePreset[] = [
  { id: "navigate", viewMode: "tree", depthMode: "all-level", contentMode: "folders" },
  { id: "columns", viewMode: "tree", depthMode: "one-level", contentMode: "folders" },
  { id: "contents", viewMode: "flat", depthMode: "all-level", contentMode: "all" },
  { id: "files", viewMode: "flat", depthMode: "all-level", contentMode: "files" },
  { id: "context", viewMode: "tree", depthMode: "two-level", contentMode: "all" }
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
    const matches =
      preset.viewMode === "flat"
        ? viewMode === "flat" && contentMode === preset.contentMode
        : viewMode === preset.viewMode && depthMode === preset.depthMode && contentMode === preset.contentMode;
    if (matches) {
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
