import type { App, View, WorkspaceLeaf } from "obsidian";

export const FOLDER_SPACES_VIEW_TYPE = "folder-spaces-explorer";

export interface FolderSpaceView extends View {
	readonly isFolderSpace: true;
	readonly folderPath: string | null;
	getFolderPath(): string | null;
}

export interface FolderSpacesAPI {
  readonly version: string;
  readonly viewType: string;

	/** 判斷傳入的 WorkspaceLeaf 或 View 是否為 Folder Spaces 頁籤 */
	isFolderSpaceView(target: unknown): boolean;

	/** 取得傳入的 WorkspaceLeaf 或 View 所對應的資料夾路徑 */
	getFolderPath(target: unknown): string | null;

	/** 取得目前 Vault 工作區內所有開啟的 Folder Spaces View 實例 */
	getFolderSpaces(): FolderSpaceView[];

	/** 開啟或切換至指定資料夾的 Folder Space 頁籤 */
	openFolderSpace(
		folderPath: string,
    location?: "left-sidebar" | "right-sidebar" | "editor" | "window"
  ): Promise<WorkspaceLeaf | null>;
}

export function isFolderSpaceView(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const obj = target as Record<string, unknown>;
  const view = (obj.view && typeof obj.view === "object" ? obj.view : obj) as Record<string, unknown>;

	if (view.isFolderSpace === true) {
    return true;
  }

  if (typeof view.getViewType === "function" && view.getViewType() === FOLDER_SPACES_VIEW_TYPE) {
    return true;
  }

  return false;
}

export function getFolderPath(target: unknown): string | null {
  if (!target || typeof target !== "object") {
    return null;
  }

  const obj = target as Record<string, unknown>;
  const view = (obj.view && typeof obj.view === "object" ? obj.view : obj) as Record<string, unknown>;

	if (typeof view.getFolderPath === "function") {
		return (view.getFolderPath as () => string | null)();
	}

	if (typeof view.folderPath === "string") {
		return view.folderPath;
  }

  let stateRecord: Record<string, unknown> | null = null;

  if (typeof obj.getViewState === "function") {
    const viewState = (obj.getViewState as () => { state?: Record<string, unknown> })().state;
    if (viewState && typeof viewState === "object") {
      stateRecord = viewState;
    }
  } else if (typeof view.getState === "function") {
    const rawState = (view.getState as () => Record<string, unknown>)();
    if (rawState && typeof rawState === "object") {
      stateRecord = (rawState.state as Record<string, unknown> | undefined) ?? rawState;
    }
  }

	return typeof stateRecord?.folderPath === "string" ? stateRecord.folderPath : null;
}


export function getFolderSpaces(app: App): FolderSpaceView[] {
  const views: FolderSpaceView[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.getViewState().type !== FOLDER_SPACES_VIEW_TYPE) {
      return;
    }
    const view = leaf.view as unknown as FolderSpaceView | undefined;
    if (view) {
      views.push(view);
    }
  });
  return views;
}
