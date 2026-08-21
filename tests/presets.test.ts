import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLDER_SPACE_PRESETS,
  getPreset,
  matchPreset,
  presetToState,
  resolvePresetId
} from "../src/presets.js";

test("preset list is ordered as expected with explorer first", () => {
  assert.deepEqual(
    FOLDER_SPACE_PRESETS.map((p) => p.id),
    ["explorer", "navigate", "columns", "context", "contents", "files"]
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
});

test("matchPreset returns null for custom depth in flat mode or custom combinations", () => {
  // Flat 模式下 depth 亦生效，非 all-level 的 flat 組合屬自訂模式
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

  const explorer = getPreset("explorer")!;
  assert.equal(presetToState(explorer).viewMode, "tree");

  const navigate = getPreset("navigate")!;
  assert.equal(presetToState(navigate).viewMode, "tree");
});

test("getPreset / resolvePresetId validate the id", () => {
  assert.equal(getPreset("explorer")?.id, "explorer");
  assert.equal(getPreset("navigate")?.id, "navigate");
  assert.equal(getPreset("bogus"), null);
  assert.equal(resolvePresetId("bogus", "contents"), "contents");
  assert.equal(resolvePresetId("context", "contents"), "context");
  assert.equal(resolvePresetId(undefined, "contents"), "contents");
});
