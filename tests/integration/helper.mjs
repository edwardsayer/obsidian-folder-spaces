// Integration test 共用 bridge：連 Obsidian debug port（預設 9223，與
// `npm run obsidian:debug` 及 opencode.json 的 chrome-devtools MCP 一致），
// 選 target、執行 evaluate、斷言。零依賴（Node 20+ 全域 WebSocket）。
//
// 此 helper 改編自 ObsidianWindowSpaces `tests/integration/helper.mjs`
// （同作者、MIT），僅調整預設 port 與環境變數名稱，另加
// `waitForNewTarget`（配合開新 popout 的測試）。用法見 ./README.md。
import http from "node:http";

export const PORT = Number(process.env.FOLDER_SPACES_DEBUG_PORT || 9223);

/** Folder Space 的自訂 view type（與 src/main.ts 註冊一致）。 */
export const FS_VIEW_TYPE = "folder-spaces-explorer";

export function getJSON(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${path}`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

export async function listTargets() {
  const targets = await getJSON("/json");
  return targets.filter((t) => t.type === "page");
}

/** 連 WebSocket 並回傳 { ws, send(method, params) }。 */
export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const msgId = ++id;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    ws.onopen = () =>
      resolve({
        ws,
        send,
        close: () => ws.close(),
      });
    ws.onerror = (e) => reject(new Error(`WS connect failed: ${e.message ?? "unknown"}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
  });
}

/** 對連線執行 expression，回傳 value；有 exception 時丟錯。 */
export async function evaluate(client, expression, { timeoutMs = 15000 } = {}) {
  const timer = setTimeout(() => {
    throw new Error(`evaluate timeout after ${timeoutMs}ms`);
  }, timeoutMs);
  try {
    const res = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    const r = res?.result ?? {};
    if (r.exceptionDetails) {
      throw new Error(
        `EXC: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`
      );
    }
    if (r.subtype === "error") throw new Error(`JS error: ${r.description}`);
    return r.value;
  } finally {
    clearTimeout(timer);
  }
}

/** 取得所有 leaves 的 expression（Obsidian 無 public getLeaves，用 iterateAllLeaves）。 */
export const GET_ALL_LEAVES_EXPR = `(() => {
  const ws = app.workspace;
  const all = [];
  const collect = (l) => {
    const vs = l.getViewState?.() ?? {};
    all.push({
      type: vs.type ?? '?',
      file: vs.state?.file ?? '',
      title: l.view?.getDisplayText?.() ?? '',
      pinned: vs.pinned ?? false,
      win: l.containerEl?.ownerDocument?.defaultView === window ? 'this' : 'other',
    });
  };
  if (typeof ws.iterateAllLeaves === 'function') ws.iterateAllLeaves(collect);
  else (ws.getLeaves?.() ?? []).forEach(collect);
  return all;
})()`;

/** 便捷：對指定 target 執行並關閉連線。 */
export async function evalOn(expr, target) {
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    return await evaluate(client, expr);
  } finally {
    client.close();
  }
}

/** 主視窗 target：url 含 index.html 的 page target。 */
export async function pickMain() {
  const targets = await listTargets();
  const mains = targets.filter((t) => t.url.includes("index.html"));
  const main = mains[0];
  if (!main) {
    const all = targets.map((t) => `${t.title} (${t.url})`).join(" | ");
    throw new Error(`找不到主視窗 target（url 含 index.html）。現有 targets: ${all}`);
  }
  return main;
}

/** 依 title 子字串找 popout target；找不到或重複時丟錯。 */
export async function pickPopout(substr) {
  const targets = await listTargets();
  const hits = targets.filter((t) => t.title.includes(substr));
  if (hits.length === 0)
    throw new Error(`找不到 title 含 "${substr}" 的 popout target。現有：${targets.map((t) => t.title).join(" | ")}`);
  if (hits.length > 1)
    throw new Error(`title 含 "${substr}" 有多個 target：${hits.map((t) => t.title).join(" | ")}`);
  return hits[0];
}

/** 輪詢等待「id 不在 exceptIds 內」的新 page target 出現（開新 popout 用）。 */
export async function waitForNewTarget(exceptIds, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = await listTargets();
    const fresh = targets.find((t) => !exceptIds.has(t.id));
    if (fresh) return fresh;
    await sleep(500);
  }
  throw new Error(`等待新 page target 逾時 ${timeoutMs}ms（原 targets: ${[...exceptIds].join(", ")}）`);
}

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 清理：關閉主視窗以外的所有視窗（整合測試會真實開/關 popout，僅限開發環境）。 */
export async function closeAllPopouts(main) {
  return evalOn(
    `(async () => {
      const winSet = new Set();
      app.workspace.iterateAllLeaves?.((l) => {
        const w = l.containerEl?.ownerDocument?.defaultView;
        if (w && w !== window) winSet.add(w);
      });
      let closed = 0;
      for (const w of winSet) {
        try { w.close(); closed++; } catch {}
      }
      return closed;
    })()`,
    main
  );
}