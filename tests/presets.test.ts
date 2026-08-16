import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLDER_SPACE_PRESETS,
  getPreset,
  matchPreset,
  presetToState,
  resolvePresetId
} from "../src/presets.js";

test("preset list is ordered with context last", () => {
  assert.deepEqual(
    FOLDER_SPACE_PRESETS.map((p) => p.id),
    ["navigate", "columns", "contents", "files", "context"]
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

test("matchPreset identifies the preset from current modes", () => {
  assert.equal(matchPreset("tree", "all-level", "folders"), "navigate");
  assert.equal(matchPreset("tree", "one-level", "folders"), "columns");
  assert.equal(matchPreset("flat", "all-level", "all"), "contents");
  assert.equal(matchPreset("flat", "two-level", "files"), "files"); // flat 看 content，depth 忽略
  assert.equal(matchPreset("tree", "two-level", "all"), "context");
});

test("matchPreset ignores depth for flat presets", () => {
  // flat 下 depth 被忽略：「內容」preset (flat/all) 無論 depth 都匹配
  assert.equal(matchPreset("flat", "all-level", "all"), "contents");
  assert.equal(matchPreset("flat", "one-level", "all"), "contents");
  assert.equal(matchPreset("flat", "two-level", "files"), "files");
});

test("matchPreset returns null for unsaved/custom combinations", () => {
  assert.equal(matchPreset("tree", "all-level", "all"), null); // tree/all/all 非預設組合
  assert.equal(matchPreset("flat", "all-level", "folders"), null); // folders-only flat 非 preset
  assert.equal(matchPreset("tree", "one-level", "all"), null);
});

test("presetToState forces flat for files content", () => {
  const files = getPreset("files")!;
  assert.equal(files.contentMode, "files");
  assert.equal(presetToState(files).viewMode, "flat");

  const navigate = getPreset("navigate")!;
  assert.equal(presetToState(navigate).viewMode, "tree");
});

test("getPreset / resolvePresetId validate the id", () => {
  assert.equal(getPreset("navigate")?.id, "navigate");
  assert.equal(getPreset("bogus"), null);
  assert.equal(resolvePresetId("bogus", "contents"), "contents");
  assert.equal(resolvePresetId("context", "contents"), "context");
  assert.equal(resolvePresetId(undefined, "contents"), "contents");
});
