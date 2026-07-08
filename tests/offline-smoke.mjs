import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const debugPort = process.argv[3] || "9233";
const tabs = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
const tab = tabs.find((item) => item.type === "page");
assert(tab, "Kein Chrome-Tab für den Offline-Test gefunden.");

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) {
    return;
  }
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    reject(new Error(message.error.message));
  } else {
    resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const result = await send("Runtime.evaluate", {
  expression: `fetch(${JSON.stringify(pageUrl)})
    .then((response) => ({ status: response.status, text: response.text() }))
    .then(async ({ status, text }) => ({ status, hasApp: (await text).includes("Arbeitsstunden") }))
    .catch((error) => ({ status: 0, error: error.message }))`,
  awaitPromise: true,
  returnByValue: true
});

assert.equal(result.result.value.status, 200);
assert.equal(result.result.value.hasApp, true);
console.log(`Offline-Test erfolgreich: ${pageUrl}`);
socket.close();
