// node scripts/shots.mjs [only-name...] — screenshots of preview.html scenarios into out/screens/ (headless Chromium,
// 360 x 740 phone, deviceScaleFactor 2, via CDP). Each scenario: an optional save to start from, then JS to run.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "screens");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A save at station `station` (index), lap, with every station before it stamped. */
function save(o = {}) {
  const st = o.station ?? 0, lap = o.lap ?? 1, stamps = {};
  for (let i = 0; i <= st; i++) stamps[i] = lap;
  for (const [k, v] of Object.entries(o.stamps || {})) stamps[k] = v;
  const d = new Date(); const day = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12); return x.toISOString().slice(0, 10); };
  const days = (o.days ?? [1, 2, 3, 5, 6]).map(day).sort();
  return { v: 1, paid: {}, perDay: Object.fromEntries(days.map((x) => [x, 20])), days,
    pos: { lap, station: st, step: o.step ?? 7, seg: o.seg ?? 20 }, queue: o.queue || [], stamps, coins: o.coins ?? 135,
    card: { boxes: (o.boxes ?? [6, 5, 3, 2, 1]).map(day), done: o.done ?? 1 },
    owned: { models: ["local", "tram", "mono", "sl", "shin"], colors: ["red", "sky", "yellow"], cars: 4,
      passengers: ["🐶", "🐱", "🐰", "🐻", "🐼", "🦊"] },
    train: Object.assign({ model: "local", color: "", cars: 1, seats: ["🐶", "🐱", null, "🐰", "🐼", "🦊"] }, o.train || {}) };
}
const open = "document.querySelector('.dt-chip').click();";
const tap = (sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;
const tapText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)})).click();`;

const SCENES = [
  { name: "01-bubble-first-card", save: null, run: "", wait: 1600 },
  { name: "02-bubble-arrival", save: save({ station: 7, step: 19, seg: 20, days: [1, 2, 3] }), card: true, run: "", wait: 1700 },
  { name: "03-main-hokkaido-local", save: save({ station: 0, step: 3, seg: 12, train: { cars: 0, seats: ["🐶", "🐱", "🐰"] } }), run: open, wait: 900 },
  { name: "04-main-tohoku-tram", save: save({ station: 3, train: { model: "tram", cars: 1, seats: ["🐻", "🐶", "🐱", "🐼", "🐰", "🦊"] } }), run: open, wait: 900 },
  { name: "05-main-kanto-mono", save: save({ station: 10, train: { model: "mono", color: "red", cars: 1 } }), run: open, wait: 900 },
  { name: "06-main-chubu-sl", save: save({ station: 18, train: { model: "sl", cars: 2, seats: ["🐻", "🐶", "🐱", "🐼", "🐰", "🦊"] } }), run: open, wait: 1000 },
  { name: "07-main-kinki-shin", save: save({ station: 26, train: { model: "shin", cars: 1 } }), run: open, wait: 900 },
  { name: "08-main-chugoku-local-sky", save: save({ station: 31, train: { model: "local", color: "sky", cars: 2 } }), run: open, wait: 900 },
  { name: "09-main-shikoku-tram-yellow", save: save({ station: 36, train: { model: "tram", color: "yellow", cars: 0 } }), run: open, wait: 900 },
  { name: "10-main-kyushu-shin-red", save: save({ station: 42, lap: 2, train: { model: "shin", color: "red", cars: 0 } }), run: open, wait: 900 },
  { name: "11-arrive-platform", save: save({ station: 12, step: 0, queue: [{ lap: 1, station: 12 }] }), run: open, wait: 1900 },
  { name: "12-arrive-pon", save: save({ station: 12, step: 0, queue: [{ lap: 1, station: 12 }] }), run: open, wait: 3150 },
  { name: "13-arrive-done", save: save({ station: 12, step: 0, queue: [{ lap: 2, station: 12 }] }), run: open, wait: 5200 },
  { name: "14-stamp-book", save: save({ station: 20, stamps: { 2: 2, 5: 3, 9: 4 } }), run: open + tap(".dt-tb"), wait: 700 },
  { name: "15-stamp-big", save: save({ station: 20, stamps: { 2: 2 } }), run: open + tap(".dt-tb") + "setTimeout(()=>document.querySelectorAll('.dt-cell')[2].click(),300);", wait: 1100 },
  { name: "16-route-map", save: save({ station: 20, step: 10 }), run: open + tap(".dt-tb") + "setTimeout(()=>" + tapText(".dt-tab", "ろせんず").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "17-stamp-card", save: save({ station: 20 }), run: open + tap(".dt-cardbtn"), wait: 700 },
  { name: "18-shop-models", save: Object.assign(save({ station: 20, coins: 75 }), { owned: { models: ["local"], colors: [], cars: 1, passengers: ["🐶", "🐱"] } }), run: open + tapText(".dt-tb", "おみせ"), wait: 700 },
  { name: "19-shop-colors", save: save({ station: 20 }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "いろ").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "20-shop-passengers", save: save({ station: 20 }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "じょうきゃく").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "21-shop-cars", save: save({ station: 20, train: { model: "sl" } }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "しゃりょう").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "22-landscape", save: save({ station: 22, train: { model: "shin", cars: 2 } }), run: open, wait: 900, w: 740, h: 360 },
  { name: "23-topbar-99999-dev", save: save({ station: 5, coins: 99999 }), dev: true, run: open, wait: 800 },
  { name: "24-dev-panel", save: save({ station: 5 }), dev: true, run: open + tap(".dt-gear"), wait: 700 },
  { name: "25-flight", save: null, run: open, wait: 1700 },
];

const only = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(process.env.SCRATCH || tmpdir(), "chr-"));
const chr = spawn("/usr/bin/chromium-browser", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  "--no-first-run", "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true });
  if (r.result?.exceptionDetails) console.error(expression.slice(0, 80), JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
};
await send("Page.enable");
await send("Runtime.enable");
const url = `file://${ROOT}/preview.html?strip=0`;
for (const sc of SCENES) {
  if (only.length && !only.some((o) => sc.name.includes(o))) continue;
  await send("Emulation.setDeviceMetricsOverride", { width: sc.w || 360, height: sc.h || 740, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url });
  await sleep(500);
  await evaluate(`localStorage.clear();` + (sc.save ? `localStorage.setItem("densha-tabi", ${JSON.stringify(JSON.stringify(sc.save))});` : ""));
  await send("Page.navigate", { url: url + (sc.dev ? "&dev=1" : "") + "&card=" + (sc.card || !sc.save ? "5001" : "x") });
  await sleep(700);
  if (sc.run) await evaluate(sc.run);
  await sleep(sc.wait);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, sc.name + ".png"), Buffer.from(shot.result.data, "base64"));
  console.log("wrote", sc.name);
}
ws.close(); chr.kill();
process.exit(0);
