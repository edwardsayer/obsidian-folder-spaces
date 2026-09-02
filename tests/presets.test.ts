import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLDER_SPACE_PRESETS,
  applyPresetModes,
  getPreset,
  matchPreset,
  presetToState,
  resolvePresetId,
  resolveCascadeParentPresetId
} from "../src/presets.js";

test("preset list is ordered as expected with explorer first", () => {
  assert.deepEqual(
    FOLDER_SPACE_PRESETS.map((p) => p.id),
    ["explorer", "navigate", "columns", "context", "contents", "files", "list"]
  );
});

test("each preset maps to a distinct (view, depth, content) tuple", () => {
  const seen = new Set<string>();
  for (const preset of FOLDER_SPACE_PRESETS) {
    const key = `${preset.viewMode}|${preset.depthMode}|${preset.contentMode}`;
    assert.equal(seen.has(key), false, `duplicate preset tuple ${key}`);
    seen.add(key);
  }
});

test("matchPreset identifies the preset from exact (view, depth, content) modes", () => {
  assert.equal(matchPreset("tree", "all-level", "all"), "explorer");
  assert.equal(matchPreset("tree", "all-level", "folders"), "navigate");
  assert.equal(matchPreset("tree", "one-level", "folders"), "columns");
  assert.equal(matchPreset("tree", "two-level", "folders"), "context");
  assert.equal(matchPreset("flat", "all-level", "all"), "contents");
  assert.equal(matchPreset("flat", "all-level", "files"), "files");
  assert.equal(matchPreset("flat", "one-level", "files"), "list");
});

test("matchPreset returns null for custom depth in flat mode or custom combinations", () => {
  // Flat 模式下 depth 亦生效，非預設集組合屬自訂模式
  assert.equal(matchPreset("flat", "one-level", "all"), null);
  assert.equal(matchPreset("flat", "two-level", "all"), null);
  assert.equal(matchPreset("flat", "two-level", "files"), null);
  assert.equal(matchPreset("flat", "all-level", "folders"), null);
  assert.equal(matchPreset("tree", "one-level", "all"), null);
  assert.equal(matchPreset("tree", "two-level", "all"), null);
});

test("presetToState forces flat for files content", () => {
  const files = getPreset("files")!;
  assert.equal(files.contentMode, "files");
  assert.equal(presetToState(files).viewMode, "flat");

  const list = getPreset("list")!;
  assert.equal(list.contentMode, "files");
  assert.equal(presetToState(list).viewMode, "flat");
  assert.equal(list.depthMode, "one-level");

  const explorer = getPreset("explorer")!;
  assert.equal(presetToState(explorer).viewMode, "tree");

  const navigate = getPreset("navigate")!;
  assert.equal(presetToState(navigate).viewMode, "tree");
});

type TestPresetModes = {
  viewMode: "tree" | "flat";
  depthMode: "one-level" | "two-level" | "all-level";
  contentMode: "folders" | "files" | "all";
};

function applyPresetFromFiles(presetId: "explorer" | "navigate" | "columns" | "context" | "list"): TestPresetModes {
  const modes: TestPresetModes = {
    viewMode: "flat",
    depthMode: "all-level",
    contentMode: "files"
  };

  applyPresetModes(getPreset(presetId)!, {
    setContentMode: (contentMode) => {
      if (contentMode === "files" && modes.viewMode !== "flat") {
        modes.viewMode = "flat";
      }
      modes.contentMode = contentMode;
    },
    setDepthMode: (depthMode) => {
      modes.depthMode = depthMode;
    },
    setViewMode: (viewMode) => {
      modes.viewMode = modes.contentMode === "files" && viewMode === "tree" ? "flat" : viewMode;
    }
  });

  return modes;
}

test("Files to Explorer switches back to the tree presentation", () => {
  assert.deepEqual(applyPresetFromFiles("explorer"), {
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "all"
  });
});

test("Files to Navigate switches back to the tree presentation", () => {
  assert.deepEqual(applyPresetFromFiles("navigate"), {
    viewMode: "tree",
    depthMode: "all-level",
    contentMode: "folders"
  });
});

test("Files to Columns switches back to the tree presentation", () => {
  assert.deepEqual(applyPresetFromFiles("columns"), {
    viewMode: "tree",
    depthMode: "one-level",
    contentMode: "folders"
  });
});

test("Files to Context switches back to the tree presentation", () => {
  assert.deepEqual(applyPresetFromFiles("context"), {
    viewMode: "tree",
    depthMode: "two-level",
    contentMode: "folders"
  });
});

test("Files to List sets one-level depth while maintaining flat and files mode", () => {
  assert.deepEqual(applyPresetFromFiles("list"), {
    viewMode: "flat",
    depthMode: "one-level",
    contentMode: "files"
  });
});

test("getPreset / resolvePresetId validate the id", () => {
  assert.equal(getPreset("explorer")?.id, "explorer");
  assert.equal(getPreset("navigate")?.id, "navigate");
  assert.equal(getPreset("list")?.id, "list");
  assert.equal(getPreset("bogus"), null);
  assert.equal(resolvePresetId("bogus", "contents"), "contents");
  assert.equal(resolvePresetId("context", "contents"), "context");
  assert.equal(resolvePresetId("list", "contents"), "list");
  assert.equal(resolvePresetId(undefined, "contents"), "contents");
});

test("resolveCascadeParentPresetId validates folder-only presets", () => {
  assert.equal(resolveCascadeParentPresetId("navigate"), "navigate");
  assert.equal(resolveCascadeParentPresetId("columns"), "columns");
  assert.equal(resolveCascadeParentPresetId("context"), "context");
  assert.equal(resolveCascadeParentPresetId("explorer"), "navigate");
  assert.equal(resolveCascadeParentPresetId("contents"), "navigate");
  assert.equal(resolveCascadeParentPresetId("files"), "navigate");
  assert.equal(resolveCascadeParentPresetId("list"), "navigate");
  assert.equal(resolveCascadeParentPresetId("bogus"), "navigate");
  assert.equal(resolveCascadeParentPresetId("bogus", "columns"), "columns");
});
