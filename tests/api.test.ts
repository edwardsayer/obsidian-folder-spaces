import assert from "node:assert/strict";
import test from "node:test";

import { getFolderPath, isFolderSpaceView } from "../src/api.js";
import { makeNavigable } from "../src/compatibility-helpers.js";

test("isFolderSpaceView correctly identifies Folder Space view or leaf", () => {
  assert.equal(isFolderSpaceView(null), false);
  assert.equal(isFolderSpaceView(undefined), false);
  assert.equal(isFolderSpaceView({} as unknown as null), false);

  const nonFolderSpaceLeaf = {
    view: {
      getViewType: () => "markdown"
    }
  };
  assert.equal(isFolderSpaceView(nonFolderSpaceLeaf), false);

  const folderSpaceLeafByMarker = {
    view: {
      isFolderSpace: true,
      getViewType: () => "folder-spaces-explorer"
    }
  };
  assert.equal(isFolderSpaceView(folderSpaceLeafByMarker), true);

  const folderSpaceLeafByType = {
    view: {
      getViewType: () => "folder-spaces-explorer"
    }
  };
  assert.equal(isFolderSpaceView(folderSpaceLeafByType), true);
});

test("getFolderPath extracts folderPath accurately from view or state", () => {
  assert.equal(getFolderPath(null), null);

  const viewWithMethod = {
    getFolderPath: () => "Projects/Active",
    folderPath: "Projects/Active"
  };
  assert.equal(getFolderPath(viewWithMethod), "Projects/Active");

  const leafWithMethod = {
    view: viewWithMethod
  };
  assert.equal(getFolderPath(leafWithMethod), "Projects/Active");

  const viewWithProperty = {
    folderPath: "Notes/2026"
  };
  assert.equal(getFolderPath(viewWithProperty), "Notes/2026");

  const leafWithState = {
    getViewState: () => ({
      type: "folder-spaces-explorer",
      state: { folderPath: "Archives/Old" }
    })
  };
  assert.equal(getFolderPath(leafWithState), "Archives/Old");
});

test("makeNavigable safely attaches navigation property to object target", () => {
  assert.equal(makeNavigable(null), false);
  assert.equal(makeNavigable(undefined), false);

  const target: { navigation?: boolean } = {};
  assert.equal(makeNavigable(target), true);
  assert.equal(target.navigation, true);
});
