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
  folderPath: string | null,
  focused: FolderSpaceCreationCandidate | null,
  activeFile: FolderSpaceCreationCandidate | null
): string | null {
  if (!folderPath) {
    return null;
  }

  for (const candidate of [focused, activeFile]) {
    if (!candidate) {
      continue;
    }

    const targetPath = candidate.kind === "folder" ? candidate.path : candidate.parentPath;
    if (targetPath && isInsideFolder(folderPath, targetPath)) {
      return targetPath;
    }
  }

  return folderPath;
}

function isInsideFolder(folderPath: string, path: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}
