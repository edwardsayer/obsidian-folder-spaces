import * as h from "../tests/integration/helper.mjs";

const EXPR = `(async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const p = app.plugins.plugins['window-spaces'];
    const mgr = p.manager;
    const anchor =
      document.querySelector('.window-spaces-layout-switcher') ||
      document.querySelector('.side-dock-ribbon') ||
      document.body;
    const evt = new MouseEvent('click', { clientX: 500, clientY: 400, bubbles: true });
    mgr.showSpaceMenu(window, anchor, evt);
    await sleep(400);
    const menu = document.querySelector('.menu');
    if (!menu) return { error: 'menu not opened' };
    const items = Array.from(menu.querySelectorAll('.menu-item'));
    const data = items.map((item) => {
      const titleEl = item.querySelector('.menu-item-title');
      const iconEl = item.querySelector('.menu-item-icon');
      const after = getComputedStyle(item, '::after');
      const before = getComputedStyle(item, '::before');
      return {
        title: (titleEl ? titleEl.textContent : '') || '',
        isSpaceMenu: item.classList.contains('window-spaces-space-menu'),
        activeClass: item.classList.contains('window-spaces-menu-active'),
        afterContent: after.content,
        afterMarginLeft: after.marginLeft,
        titleContainsCheck: ((titleEl ? titleEl.textContent : '') || '').indexOf('\\u2713') >= 0,
        iconColor: iconEl ? getComputedStyle(iconEl).color : null,
        titleColor: titleEl ? getComputedStyle(titleEl).color : null,
        accentVar: item.style.getPropertyValue('--menu-item-accent') || null,
        foldClass: item.classList.contains('has-space-menu-fold'),
        foldSize: before.width + ' x ' + before.height,
        foldContent: before.content
      };
    });
    const activeSpaces = [];
    const seen = new Set();
    const add = (name) => { if (name && !seen.has(name)) { seen.add(name); activeSpaces.push(name); } };
    add(document.body.dataset.layoutName);
    app.workspace.iterateAllLeaves((l) => {
      const w = l.containerEl && l.containerEl.ownerDocument ? l.containerEl.ownerDocument.defaultView : null;
      if (w && w !== window) add(w.document.body.dataset.layoutName);
    });
    const result = { menuClass: menu.className, activeSpaces: activeSpaces, data: data };
    const wrapper = menu.parentElement;
    if (wrapper && wrapper !== document.body) wrapper.remove(); else menu.remove();
    return result;
  } catch (e) {
    return { error: String(e && e.message ? e.message : e), stack: e && e.stack ? String(e.stack).split(String.fromCharCode(10)).slice(0, 6).join(' | ') : null };
  }
})()`;

const targets = await h.listTargets();
const main = targets.find((t) => t.title.startsWith("Untitled 1")) ?? targets.find((t) => t.url.includes("index.html"));
if (!main) throw new Error("no main target");
const r = await h.evalOn(EXPR, main);
console.log(JSON.stringify(r, null, 2));
