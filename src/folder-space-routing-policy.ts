export type FolderSpaceLocation = "left-sidebar" | "right-sidebar" | "editor" | "window";

export interface FolderSpaceScope {
  folderPath: string;
  location: FolderSpaceLocation;
  window: Window | null;
}

export interface FolderSpaceScopeCandidate<Leaf> extends FolderSpaceScope {
  leaf: Leaf;
}

export function isSameFolderSpaceScope(
  left: FolderSpaceScope,
  right: FolderSpaceScope
): boolean {
  return (
    left.folderPath === right.folderPath &&
    left.location === right.location &&
    left.window === right.window
  );
}

export function findExistingFolderSpace<Leaf>(
  candidates: readonly FolderSpaceScopeCandidate<Leaf>[],
  target: FolderSpaceScope
): Leaf | null {
  let existing: Leaf | null = null;
  for (const candidate of candidates) {
    if (isSameFolderSpaceScope(candidate, target)) {
      existing = candidate.leaf;
    }
  }
  return existing;
}

export interface PanelCandidate<Panel, Leaf> {
  panel: Panel;
  order: number;
  activeLeaf: Leaf | null;
  activePinned: boolean;
}

export type PanelTarget<Panel, Leaf> =
  | { kind: "existing"; leaf: Leaf }
  | { kind: "new-tab"; panel: Panel };

export function chooseRecentPanel<Panel, Leaf>(
  candidates: readonly PanelCandidate<Panel, Leaf>[]
): PanelCandidate<Panel, Leaf> | null {
  let recent: PanelCandidate<Panel, Leaf> | null = null;

  for (const candidate of candidates) {
    if (!recent || candidate.order > recent.order) {
      recent = candidate;
    }
  }

  return recent;
}

export function choosePanelTarget<Panel, Leaf>(
  candidate: PanelCandidate<Panel, Leaf> | null
): PanelTarget<Panel, Leaf> | null {
  if (!candidate) {
    return null;
  }

  if (candidate.activeLeaf && !candidate.activePinned) {
    return { kind: "existing", leaf: candidate.activeLeaf };
  }

  return { kind: "new-tab", panel: candidate.panel };
}

export interface FolderSpaceCreationCandidate {
  path: string;
  kind: "file" | "folder";
  parentPath: string | null;
}

export function chooseFolderSpaceCreationTarget(
  folderPath: string | null | undefined,
  focused: FolderSpaceCreationCandidate | null,
  activeFile: FolderSpaceCreationCandidate | null
): string | null {
  const normalizedFolderPath = folderPath ?? "";

  for (const candidate of [focused, activeFile]) {
    if (!candidate) {
      continue;
    }

    const targetPath = candidate.kind === "folder" ? candidate.path : candidate.parentPath;
    if (targetPath && isInsideFolder(normalizedFolderPath, targetPath)) {
      return targetPath;
    }
  }

  return normalizedFolderPath;
}

function isInsideFolder(folderPath: string, path: string): boolean {
  if (folderPath === "") {
    // The vault root contains every path.
    return true;
  }
  return path === folderPath || path.startsWith(`${folderPath}/`);
}
