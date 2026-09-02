import assert from "node:assert/strict";
import test from "node:test";

import {
  WindowActiveFileTracker,
  type PatchableFileExplorerView
} from "../src/shared/windowActiveFileTracker.js";

function createMockWindow(id: string): Window {
  return { id, isMockWindow: true } as unknown as Window;
}

function createMockFile(path: string): any {
  return { path, name: path.split("/").pop() ?? path };
}

function createMockLeaf(win: Window, file?: any): any {
  const containerEl = {
    ownerDocument: {
      defaultView: win
    }
  };
  return {
    view: {
      containerEl,
      file: file ?? null
    },
    containerEl,
    getContainer: () => ({ win })
  };
}

test("WindowActiveFileTracker tracks active file per window", () => {
  const mockApp: any = {
    workspace: {
      activeLeaf: null,
      getActiveFile: () => null
    }
  };
  const tracker = new WindowActiveFileTracker(mockApp);

  const win1 = createMockWindow("win1");
  const win2 = createMockWindow("win2");

  const file1 = createMockFile("Docs/Note1.md");
  const file2 = createMockFile("Projects/Plan.md");

  const leaf1 = createMockLeaf(win1, file1);
  const leaf2 = createMockLeaf(win2, file2);

  // Focus leaf 1 in window 1
  tracker.trackActiveLeaf(leaf1);
  assert.equal(tracker.getActiveFileForWindow(win1), file1);
  assert.equal(tracker.getActiveFileForWindow(win2), null);
  assert.equal(tracker.getLastActiveWindow(), win1);

  // Focus leaf 2 in window 2
  tracker.trackActiveLeaf(leaf2);
  assert.equal(tracker.getActiveFileForWindow(win1), file1);
  assert.equal(tracker.getActiveFileForWindow(win2), file2);
  assert.equal(tracker.getLastActiveWindow(), win2);
});

test("shouldProcessFileOpen suppresses cross-window file open", () => {
  const mockApp: any = { workspace: {} };
  const tracker = new WindowActiveFileTracker(mockApp);

  const win1 = createMockWindow("win1");
  const win2 = createMockWindow("win2");

  const file1 = createMockFile("Note1.md");
  const leaf1 = createMockLeaf(win1, file1);
  const leaf2 = createMockLeaf(win2);

  // Focus window 1
  tracker.trackActiveLeaf(leaf1);

  // View in window 1 should process file-open
  assert.equal(tracker.shouldProcessFileOpen(leaf1), true);

  // View in window 2 should NOT process file-open
  assert.equal(tracker.shouldProcessFileOpen(leaf2), false);

  // View with no leaf / no window should fallback to true
  assert.equal(tracker.shouldProcessFileOpen(null), true);
});

test("patchViewInstance intercepts onFileOpen and blocks cross-window calls", () => {
  const mockApp: any = { workspace: {} };
  const tracker = new WindowActiveFileTracker(mockApp);

  const winMain = createMockWindow("main");
  const winPopout = createMockWindow("popout");

  const noteInPopout = createMockFile("PopoutNote.md");
  const popoutEditorLeaf = createMockLeaf(winPopout, noteInPopout);

  const mainExplorerLeaf = createMockLeaf(winMain);
  const popoutExplorerLeaf = createMockLeaf(winPopout);

  let mainReceived: any = null;
  let popoutReceived: any = null;

  const mainView: PatchableFileExplorerView = {
    leaf: mainExplorerLeaf,
    onFileOpen: (f) => {
      mainReceived = f;
    }
  };

  const popoutView: PatchableFileExplorerView = {
    leaf: popoutExplorerLeaf,
    onFileOpen: (f) => {
      popoutReceived = f;
    }
  };

  tracker.patchViewInstance(mainView);
  tracker.patchViewInstance(popoutView);

  // User activates file in popout window
  tracker.trackActiveLeaf(popoutEditorLeaf);
  tracker.trackFileOpen(noteInPopout, popoutEditorLeaf);

  // Global event broadcast triggers onFileOpen on both views
  mainView.onFileOpen!(noteInPopout);
  popoutView.onFileOpen!(noteInPopout);

  // Main window explorer must have ignored the event
  assert.equal(mainReceived, null, "Main window explorer should ignore popout file open");

  // Popout explorer must have processed the event
  assert.equal(popoutReceived, noteInPopout, "Popout explorer should process popout file open");
});

test("restoreAll cleanly restores original onFileOpen on plugin teardown", () => {
  const mockApp: any = { workspace: {} };
  const tracker = new WindowActiveFileTracker(mockApp);

  const win = createMockWindow("main");
  const leaf = createMockLeaf(win);

  let callCount = 0;
  const originalHandler = (_file?: any) => {
    callCount += 1;
  };

  const view: PatchableFileExplorerView = {
    leaf,
    onFileOpen: originalHandler
  };

  tracker.patchViewInstance(view);
  assert.notEqual(view.onFileOpen, originalHandler);
  assert.equal(view._fsOriginalOnFileOpen, originalHandler);

  // Teardown
  tracker.restoreAll();
  assert.equal(view.onFileOpen, originalHandler);
  assert.equal(view._fsOriginalOnFileOpen, undefined);

  // Calling original handler directly works normally
  view.onFileOpen!(createMockFile("Test.md"));
  assert.equal(callCount, 1);
});
