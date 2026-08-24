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

export interface CandidateLeafDescriptor<Panel = unknown> {
  parent: Panel;
  root: unknown;
  pinned: boolean;
  viewType: string;
  isSideColumn?: boolean;
}

export const KNOWN_TOOL_VIEW_TYPES: ReadonlySet<string> = new Set([
  "file-explorer",
  "folder-spaces-explorer",
  "tag",
  "search",
  "bookmarks",
  "outline",
  "all-properties",
  "backlink",
  "recent-files",
  "window-spaces-layouts",
  "notebook-navigator"
]);

export function isToolViewType(viewType: string): boolean {
  return KNOWN_TOOL_VIEW_TYPES.has(viewType);
}

export type ContentAreaRoutingDecision<Leaf> =
  | { kind: "reuse-leaf"; leaf: Leaf }
  | { kind: "new-tab-in-group"; leaf: Leaf }
  | { kind: "split" }
  | { kind: "fallback" };

export function resolveContentAreaRouting<Leaf extends CandidateLeafDescriptor<Panel>, Panel>(
  currentLeaf: Leaf,
  allLeaves: readonly Leaf[],
  getScore: (leaf: Leaf) => number,
  sidebarRoots: ReadonlySet<unknown>,
  alwaysOpenInOtherPanel: boolean
): ContentAreaRoutingDecision<Leaf> {
  const root = currentLeaf.root;
  if (sidebarRoots.has(root)) {
    return { kind: "fallback" };
  }

  const currentTabGroup = currentLeaf.parent;
  const candidateLeaves = allLeaves.filter(
    (leaf) =>
      leaf !== currentLeaf &&
      leaf.root === root &&
      leaf.parent !== currentTabGroup &&
      !leaf.isSideColumn &&
      !isToolViewType(leaf.viewType)
  );

  if (candidateLeaves.length > 0) {
    let best = candidateLeaves[0];
    if (best) {
      let bestScore = getScore(best);
      for (let i = 1; i < candidateLeaves.length; i++) {
        const candidate = candidateLeaves[i];
        if (candidate) {
          const score = getScore(candidate);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      if (!best.pinned) {
        return { kind: "reuse-leaf", leaf: best };
      }
      return { kind: "new-tab-in-group", leaf: best };
    }
  }

  if (alwaysOpenInOtherPanel) {
    return { kind: "split" };
  }

  return { kind: "fallback" };
}

export function getLastLeafInRoot<Leaf extends { getRoot: () => unknown }>(
  workspace: { iterateAllLeaves: (callback: (leaf: Leaf) => unknown) => void },
  root: unknown
): Leaf | null {
  let lastLeaf: Leaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (leaf.getRoot() === root) {
      lastLeaf = leaf;
    }
  });
  return lastLeaf;
}

export function createTabInLastSplit<Leaf extends { getRoot: () => unknown; parent?: unknown }>(
  workspace: {
    iterateAllLeaves: (callback: (leaf: Leaf) => unknown) => void;
    createLeafInParent: (parent: unknown, index: number) => Leaf;
  },
  root: unknown,
  createFirstLeaf: () => Leaf
): Leaf {
  const lastLeaf = getLastLeafInRoot(workspace, root);
  return lastLeaf && lastLeaf.parent
    ? workspace.createLeafInParent(lastLeaf.parent, -1)
    : createFirstLeaf();
}


