import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  FS_VIEW_TYPE,
  pickMain,
  evalOn,
  closeAllPopouts,
  sleep,
} from './helper.mjs';

let main;

before(async () => {
  main = await pickMain();
  await closeAllPopouts(main);
  await evalOn(
    `(async () => {
      const api = app.plugins.plugins['folder-spaces']?.api;
      if (!api) return;
      let leaves = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}');
      if (leaves.length === 0) {
        await api.openFolderSpace('', 'editor');
      }
      leaves = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}');
      if (leaves.length > 0) {
        const leaf = leaves[0];
        leaf.view.drillDownStack = [];
        leaf.view.folderPath = '';
        leaf.view.sort();
        leaf.view.tree.infinityScroll.compute();
      }
    })()`,
    main
  );
  await sleep(400);
});

after(async () => {
  if (main) {
    await closeAllPopouts(main);
  }
});

test('3-Zone Click: Click Name on folder without note toggles folder in single panel', async () => {
  const res = await evalOn(
    `(() => {
      const leaf = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}')[0];
      const folderEl = Array.from(leaf.view.navFileContainerEl.querySelectorAll('.nav-folder-title'))
        .find(el => el.getAttribute('data-path') === '00 Action');
      if (!folderEl) return { error: '00 Action folder not found' };
      const contentEl = folderEl.querySelector('.nav-folder-title-content');
      
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      contentEl.dispatchEvent(evt);

      return {
        isDrilled: leaf.view.folderPath === '00 Action',
        folderPath: leaf.view.folderPath
      };
    })()`,
    main
  );
  assert.equal(res.isDrilled, false, 'Clicking name without note should not drill down');
});

test('3-Zone Click: Click Row Background on folder drills down in single panel', async () => {
  const res = await evalOn(
    `(() => {
      const leaf = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}')[0];
      const folderEl = Array.from(leaf.view.navFileContainerEl.querySelectorAll('.nav-folder-title'))
        .find(el => el.getAttribute('data-path') === '00 Action');
      if (!folderEl) return { error: '00 Action folder not found' };

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      folderEl.dispatchEvent(evt);

      return {
        isDrilled: leaf.view.folderPath === '00 Action',
        stackLength: leaf.view.drillDownStack?.length || 0,
        viewMode: leaf.view.viewMode,
        contentMode: leaf.view.contentMode
      };
    })()`,
    main
  );
  assert.equal(res.isDrilled, true, 'Row background click should drill down');
  assert.equal(res.stackLength, 1, 'drillDownStack should have 1 entry');
});

test('Drill-down: Back button restores previous folder and presets', async () => {
  const res = await evalOn(
    `(() => {
      const leaf = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}')[0];
      const backBtn = leaf.view.containerEl.querySelector('.folder-spaces-status-icon');
      if (backBtn) {
        backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      return {
        folderPath: leaf.view.folderPath,
        stackLength: leaf.view.drillDownStack?.length || 0
      };
    })()`,
    main
  );
  assert.equal(res.folderPath, '', 'Should return to root');
  assert.equal(res.stackLength, 0, 'drillDownStack should be empty');
});

test('Twin panel: Click cascades to child panel instead of drilling down', async () => {
  const res = await evalOn(
    `(async () => {
      const plugin = app.plugins.plugins['folder-spaces'];
      const manager = plugin.panelBindingManager;
      const parentLeaf = app.workspace.getLeavesOfType('${FS_VIEW_TYPE}')[0];
      const parentView = parentLeaf.view;

      const childLeaf = app.workspace.getLeaf('split');
      await childLeaf.setViewState({ type: '${FS_VIEW_TYPE}', state: { folderPath: '' } });
      const childView = childLeaf.view;

      manager.register(parentView);
      manager.register(childView);
      manager.bind(parentView.panelId, childView.panelId);
      childView.followParent = true;

      parentView.drillDownStack = [];
      parentView.folderPath = '';
      parentView.sort();

      const folderEl = Array.from(parentView.navFileContainerEl.querySelectorAll('.nav-folder-title'))
        .find(el => el.getAttribute('data-path') === '00 Action');
      if (folderEl) {
        folderEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }

      const childPath = childView.folderPath;
      const parentDrilled = parentView.folderPath === '00 Action';

      childLeaf.detach();

      return {
        childPath,
        parentDrilled
      };
    })()`,
    main
  );
  assert.equal(res.childPath, '00 Action', 'Child view should receive cascaded path');
  assert.equal(res.parentDrilled, false, 'Parent view should not drill down');
});
