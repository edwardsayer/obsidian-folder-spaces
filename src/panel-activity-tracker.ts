import type { EventRef, WorkspaceLeaf, WorkspaceParent } from "obsidian";

export interface ActivityWorkspace {
  activeLeaf: WorkspaceLeaf | null;
  rootSplit: WorkspaceParent;
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void;
  getMostRecentLeaf(root: WorkspaceParent): WorkspaceLeaf | null;
  on(
    name: "active-leaf-change",
    callback: (leaf: WorkspaceLeaf | null) => unknown
  ): EventRef;
  offref(ref: EventRef): void;
}

export class PanelActivityTracker {
  private nextOrder = 0;
  private readonly panelOrder = new WeakMap<WorkspaceParent, number>();
  private readonly lastLeaf = new WeakMap<WorkspaceParent, WorkspaceLeaf>();
  private disposed = false;
  private readonly activeLeafChangeRef: EventRef;

  constructor(
    private readonly workspace: ActivityWorkspace,
    private readonly shouldIgnore: (leaf: WorkspaceLeaf) => boolean
  ) {
    workspace.iterateAllLeaves((leaf) => {
      if (!shouldIgnore(leaf)) {
        this.touch(leaf);
      }
    });

    const activeLeaf = workspace.activeLeaf;
    if (activeLeaf && !shouldIgnore(activeLeaf)) {
      this.touch(activeLeaf);
    }

    const recentRootLeaf = workspace.getMostRecentLeaf(
      workspace.rootSplit as WorkspaceParent
    );
    if (recentRootLeaf && !shouldIgnore(recentRootLeaf)) {
      this.touch(recentRootLeaf);
    }

    this.activeLeafChangeRef = workspace.on("active-leaf-change", (leaf) => {
      if (!this.disposed && leaf && !this.shouldIgnore(leaf)) {
        this.touch(leaf);
      }
    });
  }

  getPanelOrder(parent: WorkspaceParent): number {
    return this.panelOrder.get(parent) ?? 0;
  }

  getLastLeaf(parent: WorkspaceParent): WorkspaceLeaf | undefined {
    return this.lastLeaf.get(parent);
  }

  getLeafActivityScore(leaf: WorkspaceLeaf): number {
    const panelOrder = this.getPanelOrder(leaf.parent);
    const lastLeafBonus = this.getLastLeaf(leaf.parent) === leaf ? 0.5 : 0;
    const activeLeafBonus = leaf.getViewState().active ? 0.25 : 0;
    return panelOrder + lastLeafBonus + activeLeafBonus;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.workspace.offref(this.activeLeafChangeRef);
  }

  private touch(leaf: WorkspaceLeaf): void {
    this.nextOrder += 1;
    this.panelOrder.set(leaf.parent, this.nextOrder);
    this.lastLeaf.set(leaf.parent, leaf);
  }
}
