// 捕獲 console 警告並執行表達式
const wsUrl = process.argv[2];
const expression = process.argv[3];
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const warnings = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(msg.params.type)) {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(" ");
    warnings.push(`[${msg.params.type}] ${text}`);
  }
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
    console.log("RESULT:", JSON.stringify(result.result, null, 1));
    console.log("WARNINGS:", JSON.stringify(warnings, null, 1));
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});

ws.addEventListener("error", () => {
  console.error("WS ERROR");
  process.exitCode = 1;
});

setTimeout(() => {
  console.error("TIMEOUT");
  process.exit(1);
}, 20000);
