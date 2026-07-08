import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:4174/";
const debugPort = process.argv[3] || "9233";
const pdfPath = resolve(process.argv[4] || "output/pdf/wochenrapport-test.pdf");
const screenshotPath = resolve("output/pdf/wochenrapport-druckansicht.png");

const tabs = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
const tab = tabs.find((item) => item.type === "page");
assert(tab, "Kein Chrome-Tab für den Test gefunden.");

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

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function wait(milliseconds = 150) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await wait(500);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: baseUrl });
await wait(700);

await evaluate(`localStorage.clear(); location.reload();`);
await wait(700);

assert.equal(await evaluate(`document.querySelector('link[rel="manifest"]').getAttribute("href")`), "manifest.json");
assert.equal(await evaluate(`navigator.serviceWorker.ready.then((registration) => Boolean(registration.active))`), true);
assert.equal(await evaluate(`document.querySelectorAll(".day-card").length`), 5);
assert.equal(await evaluate(`document.querySelectorAll(".day-card:first-child .entry-row").length`), 1);

async function setInput(selector, value, blur = false) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    ${blur ? 'input.dispatchEvent(new Event("change", { bubbles: true })); input.blur();' : ""}
  })()`);
  await wait();
}

await setInput(".day-card:first-child .description-field input", "Gruppe");
await setInput(".day-card:first-child .time-input", "0730", true);
await setInput(".day-card:first-child .entry-row label:nth-child(3) .time-input", "1200", true);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "4,50 h");

await evaluate(`document.querySelector(".day-card:first-child .add-entry-button").click()`);
await wait();
assert.equal(await evaluate(`document.querySelectorAll(".day-card:first-child .entry-row").length`), 2);
await setInput(".day-card:first-child .entry-row:nth-child(2) .description-field input", "Elternarbeit");
await setInput(".day-card:first-child .entry-row:nth-child(2) .time-input", "1300", true);
await setInput(".day-card:first-child .entry-row:nth-child(2) label:nth-child(3) .time-input", "1400", true);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "5,50 h");

await evaluate(`document.querySelector(".day-card:first-child .entry-row:nth-child(2) .delete-entry-button").click()`);
await wait();
assert.equal(await evaluate(`document.querySelectorAll(".day-card:first-child .entry-row").length`), 1);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "4,50 h");

await setInput(".day-card:first-child .time-input", "2960", true);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .time-input").classList.contains("invalid")`), true);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "0,00 h");

await evaluate(`(() => {
  const select = document.querySelector(".day-card:first-child .day-type-select");
  select.value = "vacation";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await wait();
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .time-input").disabled`), true);
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "4,09 h");

await evaluate(`(() => {
  const select = document.querySelector(".day-card:first-child .day-type-select");
  select.value = "illness";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await wait();
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "4,09 h");

await evaluate(`(() => {
  const select = document.querySelector(".day-card:first-child .day-type-select");
  select.value = "free";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await wait();
assert.equal(await evaluate(`document.querySelector(".day-card:first-child .day-total").textContent`), "0,00 h");

await evaluate(`(() => {
  const date = document.querySelector("#dateInput");
  date.value = "2026-12-25";
  date.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await wait(300);
assert.equal(await evaluate(`getComputedStyle(document.querySelector(".day-card:last-child .holiday-button")).display !== "none"`), true);
assert.equal(await evaluate(`document.querySelector(".day-card:last-child .time-input").disabled`), true);
await evaluate(`document.querySelector(".day-card:last-child .holiday-button").click()`);
await wait();
assert.equal(await evaluate(`document.querySelector(".day-card:last-child .time-input").disabled`), false);

const migrationState = {
  weeks: {
    "2026-W27": {
      days: {
        "2026-06-29": {
          date: "2026-06-29",
          weekday: "Montag",
          dayType: "workday",
          allowHolidayWork: false,
          entries: [
            { category: "Alte Kategorie", from: "08:00", to: "09:30" },
            { category: "Elternarbeit", from: "10:00", to: "11:00" },
            { category: "Dienstbesprechung", from: "13:00", to: "14:15" }
          ],
          remark: "Altbestand"
        }
      }
    }
  },
  settings: {
    name: "Test",
    weeklyTarget: 20.44,
    startCarry: 36.12,
    region: "Baden-Württemberg",
    year: 2026
  }
};

await evaluate(`localStorage.setItem("stundenrapport-mama-v2", ${JSON.stringify(JSON.stringify(migrationState))});
  localStorage.setItem("stundenrapport-last-period", "2026-W27");
  location.reload();`);
await wait(700);
assert.equal(await evaluate(`document.querySelector(".description-field input").value`), "Alte Kategorie");
assert.equal(await evaluate(`document.querySelector(".time-input").value`), "08:00");
assert.equal(await evaluate(`document.querySelector(".day-total").textContent`), "3,75 h");

await evaluate(`document.querySelector('[data-view="reportView"]').click()`);
await wait();
assert.equal(await evaluate(`document.querySelector("#report").textContent.includes("Alte Kategorie")`), true);
const pdf = await send("Page.printToPDF", { printBackground: true });
assert(pdf.data.length > 1000, "Der PDF-Rapport ist leer.");
await mkdir(dirname(pdfPath), { recursive: true });
await writeFile(pdfPath, Buffer.from(pdf.data, "base64"));
await send("Emulation.setEmulatedMedia", { media: "print" });
const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true
});
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
await send("Emulation.setEmulatedMedia", { media: "screen" });

await evaluate(`document.querySelector('[data-view="settingsView"]').click()`);
await wait();
await evaluate(`window.confirm = () => true`);
const backup = {
  format: "stundenrapport-backup",
  version: 1,
  exportedAt: new Date().toISOString(),
  data: migrationState,
  selection: {
    period: { year: 2026, week: 27 },
    date: "2026-06-29",
    view: "entryView"
  }
};
await evaluate(`(() => {
  const input = document.querySelector("#backupFileInput");
  const transfer = new DataTransfer();
  transfer.items.add(new File(
    [${JSON.stringify(JSON.stringify(backup))}],
    "backup.json",
    { type: "application/json" }
  ));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await wait(300);
assert.equal(await evaluate(`document.querySelector("#backupNotice").textContent`), "Backup wurde geladen.");

assert.equal(await evaluate(`document.querySelector("#backupSaveButton").getBoundingClientRect().height >= 48`), true);
assert.equal(await evaluate(`document.querySelector("#csvExportButton").getBoundingClientRect().height >= 48`), true);
await evaluate(`document.querySelector("#backupSaveButton").click()`);
await wait();
assert.equal(await evaluate(`document.querySelector("#backupNotice").textContent`), "Backup wurde gespeichert.");
await evaluate(`document.querySelector("#csvExportButton").click()`);
await wait();
assert.equal(await evaluate(`document.querySelector("#backupNotice").textContent`), "CSV-Datei wurde erstellt.");

await evaluate(`document.querySelector('[data-view="entryView"]').click()`);
await wait();
assert.equal(await evaluate(`document.querySelector(".add-entry-button").getBoundingClientRect().height >= 48`), true);

console.log(`Smoke-Test erfolgreich: ${baseUrl}`);
socket.close();
