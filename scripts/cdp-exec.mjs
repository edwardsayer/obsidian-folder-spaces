// CDP helper: 對指定 target（title 子字串）執行 JS 並印出結果
// 用法: node scripts/cdp-exec.mjs <title-substring> <js-code>
const PORT = process.env.FOLDER_SPACES_DEBUG_PORT || "9223";
const targetArg = process.argv[2];
const code = process.argv[3];

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
const pages = targets.filter((t) => t.type === "page");
const target = pages.find((t) => t.title.includes(targetArg));
if (!target) {
  console.error("找不到 target。可用:");
  pages.forEach((t, i) => console.error(`[${i}] ${t.title}`));
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

const result = await send("Runtime.evaluate", {
  expression: code,
  returnByValue: true,
  awaitPromise: true,
});
if (result.exceptionDetails) {
  console.error("EXCEPTION:", JSON.stringify(result.exceptionDetails.exception?.description || result.exceptionDetails, null, 2));
} else {
  console.log(JSON.stringify(result.result.value, null, 2));
}
ws.close();
