// CDP 輔助 script：連線至指定 target 並執行 Runtime.evaluate
// 用法: node scripts/cdp-eval.mjs <ws-url> "<expression>"
const wsUrl = process.argv[2];
const expression = process.argv[3];

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Runtime.enable");
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    console.log(JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});

ws.addEventListener("error", (event) => {
  console.error("WS ERROR", event.message ?? "");
  process.exitCode = 1;
});

setTimeout(() => {
  console.error("TIMEOUT");
  process.exit(1);
}, 15000);
