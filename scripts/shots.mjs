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
/** A v: 2 save on line `line` at station, with every station before it stamped there (and japan up to 熊本). */
function save2(o = {}) {
  const s = save({ station: 42, coins: o.coins ?? 260, train: o.train });
  const japan = { pos: Object.assign(s.pos, { dir: 1 }), stamps: s.stamps };
  delete s.pos; delete s.stamps;
  const line = o.line || "yamanote", st = o.station ?? 5, stamps = {};
  for (let i = 0; i <= (o.stamped ?? st); i++) stamps[i] = 1;
  Object.assign(stamps, o.stamps || {});
  s.v = 2;
  s.line = line;
  s.lines = { japan, [line]: { pos: { lap: o.lap ?? 1, station: st, step: o.step ?? 6, seg: 20, dir: o.dir ?? 1 }, stamps } };
  Object.assign(s.lines, o.more || {});
  s.owned.lines = ["japan", line].concat(o.owns || []);
  s.queue = o.queue || [];
  return s;
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
  { name: "14-stamp-book", save: save({ station: 20, stamps: { 2: 2, 5: 3, 9: 4 } }), run: open + tapText(".dt-tb", "スタンプ"), wait: 700 },
  { name: "15-stamp-big", save: save({ station: 20, stamps: { 2: 2 } }), run: open + tapText(".dt-tb", "スタンプ") + "setTimeout(()=>document.querySelectorAll('.dt-cell')[2].click(),300);", wait: 1100 },
  { name: "16-route-map", save: save({ station: 20, step: 10 }), run: open + tapText(".dt-tb", "スタンプ") + "setTimeout(()=>" + tapText(".dt-tab", "ろせんず").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "17-stamp-card", save: save({ station: 20 }), run: open + tap(".dt-week"), wait: 700 },
  { name: "18-shop-models", save: Object.assign(save({ station: 20, coins: 75 }), { owned: { models: ["local"], colors: [], cars: 1, passengers: ["🐶", "🐱"] } }), run: open + tapText(".dt-tb", "おみせ"), wait: 700 },
  { name: "19-shop-colors", save: save({ station: 20 }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "いろ").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "20-shop-passengers", save: save({ station: 20 }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "じょうきゃく").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "21-shop-cars", save: save({ station: 20, train: { model: "sl" } }), run: open + tapText(".dt-tb", "おみせ") + "setTimeout(()=>" + tapText(".dt-tab", "しゃりょう").replace(/;$/, "") + ",200);", wait: 900 },
  { name: "22-landscape", save: save({ station: 22, train: { model: "shin", cars: 2 } }), run: open, wait: 900, w: 740, h: 360 },
  { name: "23-topbar-99999-dev", save: save({ station: 5, coins: 99999 }), dev: true, run: open, wait: 800 },
  { name: "24-dev-panel", save: save({ station: 5 }), dev: true, run: open + tap(".dt-gear"), wait: 700 },
  { name: "25-flight", save: null, run: open, wait: 1700 },
  { name: "26-stamp-queue-offer", save: save({ station: 9, step: 0, queue: [5, 6, 7, 8, 9].map((i) => ({ lap: 1, station: i })) }), run: open +
    "setTimeout(()=>document.querySelector('.dt-scene').click(),900);setTimeout(()=>document.querySelector('.dt-arr').click(),1000);" +
    "setTimeout(()=>document.querySelector('.dt-go:not([hidden])').click(),1300);setTimeout(()=>document.querySelector('.dt-scene').click(),3000);" +
    "setTimeout(()=>document.querySelector('.dt-arr').click(),3100);", wait: 3800 },
  { name: "27-stamp-queue-all", save: save({ station: 9, step: 0, queue: [5, 6, 7, 8, 9].map((i) => ({ lap: 1, station: i })) }), run: open +
    "setTimeout(()=>document.querySelector('.dt-scene').click(),900);setTimeout(()=>document.querySelector('.dt-arr').click(),1000);" +
    "setTimeout(()=>document.querySelector('.dt-go:not([hidden])').click(),1300);setTimeout(()=>document.querySelector('.dt-scene').click(),3000);" +
    "setTimeout(()=>document.querySelector('.dt-arr').click(),3100);setTimeout(()=>document.querySelector('.dt-all').click(),3400);", wait: 4300 },
  { name: "28-route-map-flight", save: save({ station: 46, step: 4 }), run: open + tapText(".dt-tb", "スタンプ") + "setTimeout(()=>" + tapText(".dt-tab", "ろせんず").replace(/;$/, "") + ",200);" +
    "setTimeout(()=>document.querySelector('.dt-pbody').scrollTop=2000,500);", wait: 1100 },
  { name: "29-garden-card", save: save({ station: 9 }), garden: true, card: true, run: "", wait: 1500 },
  { name: "30-garden-open", save: save({ station: 9 }), garden: true, card: true, run: "setTimeout(()=>document.querySelector('.kg-chip').click(),1600);", wait: 2600 },
  { name: "31-garden-dt-open", save: save({ station: 9 }), garden: true, card: true, run: "setTimeout(()=>document.querySelector('.dt-chip').click(),3200);", wait: 4200 },
];

// Text zoom as Android's WebView applies it (system font size / AnkiDroid card zoom): every HTML element's font size
// times Z, kept up as the page adds elements (an element that only inherits its size gets it from its parent).
const TEXT_ZOOM = (z) => `(() => { const Z = ${z};
  function scale(top) {
    const els = [top, ...top.querySelectorAll("*")].filter((e) => e instanceof HTMLElement && !e.closest("svg") && !e.dataset.tz);
    const sizes = els.map((e) => [e, parseFloat(getComputedStyle(e).fontSize), e.parentElement ? parseFloat(getComputedStyle(e.parentElement).fontSize) : 0]);
    for (const [e, fs, pfs] of sizes) {
      e.dataset.tz = 1;
      if (e.parentElement && e.parentElement.dataset.tz && Math.abs(fs - pfs) < 0.01) continue;
      e.style.setProperty("font-size", fs * Z + "px", "important");
    }
  }
  const go = () => { scale(document.body); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scale(n); })))
    .observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();`;
for (const [w, h] of [[412, 690], [360, 600], [393, 640]]) {
  SCENES.push({ name: `z-${w}x${h}-main`, save: save({ station: 5, coins: 99999 }), dev: true, run: open, wait: 900, w, h, zoom: 1.3 });
  SCENES.push({ name: `z-${w}x${h}-bubble`, save: save({ station: 7, step: 19, seg: 20, days: [1, 2, 3], boxes: [6, 5, 3, 2, 1, 7, 8, 9, 10] }), card: true, run: "", wait: 1700, w, h, zoom: 1.3 });
  SCENES.push({ name: `z-${w}x${h}-stamp`, save: save({ station: 12, step: 0, coins: 99999, queue: [{ lap: 1, station: 12 }, { lap: 1, station: 13 }] }), dev: true, run: open, wait: 5400, w, h, zoom: 1.3 });
}
SCENES.push({ name: "z-740x360-landscape", save: save({ station: 22, coins: 99999, train: { model: "shin", cars: 2 } }), dev: true, run: open, wait: 900, w: 740, h: 360, zoom: 1.3 });
SCENES.push({ name: "z-412x690-shop", save: save({ station: 20, coins: 99999 }), dev: true, run: open + "setTimeout(()=>" + tapText(".dt-tb", "おみせ").replace(/;$/, "") + ",300);", wait: 900, w: 412, h: 690, zoom: 1.3 });
SCENES.push({ name: "z-412x690-card", save: save({ station: 20 }), run: open + tap(".dt-week"), wait: 800, w: 412, h: 690, zoom: 1.3 });

const book = (tab) => open + tapText(".dt-tb", "スタンプ") + (tab ? "setTimeout(()=>" + tapText(".dt-tab", tab).replace(/;$/, "") + ",250);" : "");
SCENES.push(
  { name: "L01-shop-lines", save: save2({ line: "yamanote", station: 3, coins: 320, owns: ["enoden"], more: { enoden: { pos: { lap: 1, station: 2, step: 0, seg: 12, dir: 1 }, stamps: {}, full: true } } }),
    run: open + "setTimeout(()=>" + tapText(".dt-tb", "おみせ").replace(/;$/, "") + ",300);", wait: 900 },
  { name: "L02-yamanote-main", save: save2({ line: "yamanote", station: 15, train: { model: "local", cars: 1 } }), run: open, wait: 900 },
  { name: "L03-yamanote-ring", save: save2({ line: "yamanote", station: 15, step: 10 }), run: book("ろせんず"), wait: 1000 },
  { name: "L04-enoden-seaside", save: save2({ line: "enoden", station: 6, train: { model: "tram", cars: 1, color: "" } }), run: open, wait: 900 },
  { name: "L05-orikaeshi", save: save2({ line: "enoden", station: 14, step: 0, dir: -1, stamped: 12, train: { model: "tram", cars: 0 },
    queue: [{ line: "enoden", lap: 1, station: 14 }] }), run: open + "setTimeout(()=>document.querySelector('.dt-scene').click(),600);" +
    "setTimeout(()=>document.querySelector('.dt-arr').click(),800);setTimeout(()=>document.querySelector('.dt-go:not([hidden])').click(),1200);", wait: 2000 },
  { name: "L06-orikaeshi-sheet", save: save2({ line: "enoden", station: 14, step: 0, dir: -1, stamped: 12, train: { model: "tram", cars: 0 },
    queue: [{ line: "enoden", lap: 1, station: 14 }] }), run: open + "setTimeout(()=>document.querySelector('.dt-scene').click(),600);" +
    "setTimeout(()=>document.querySelector('.dt-arr').click(),800);", wait: 1500 },
  { name: "L07-zenneki-seiha", save: save2({ line: "enoden", station: 14, step: 0, dir: -1, stamped: 13, train: { model: "tram", cars: 0 },
    queue: [{ line: "enoden", lap: 1, station: 14 }] }), run: open + "setTimeout(()=>document.querySelector('.dt-scene').click(),600);" +
    "setTimeout(()=>document.querySelector('.dt-arr').click(),800);setTimeout(()=>document.querySelector('.dt-go:not([hidden])').click(),1200);", wait: 2600 },
  { name: "L08-book-picker", save: save2({ line: "yamanote", station: 13, owns: ["yui"], stamps: { 2: 2 }, more: { yui: { pos: { lap: 1, station: 0, step: 0, seg: 12, dir: 1 }, stamps: { 0: 1 } } } }), run: book(), wait: 900 },
  { name: "L09-odakyu-map", save: save2({ line: "odakyu", station: 20, dir: -1, lap: 2, stamped: 30 }), run: book("ろせんず"), wait: 1000 },
  { name: "L10-tokaido-fuji", save: save2({ line: "tokaido", station: 4, train: { model: "shin", cars: 2 } }), run: open, wait: 900 },
  { name: "L11-yui-mono", save: save2({ line: "yui", station: 9, train: { model: "mono", cars: 1 } }), run: open, wait: 900 },
  { name: "L13-waiting-button", save: save2({ line: "yamanote", station: 3, coins: 99999 }), dev: true, run: open +
    "setTimeout(()=>" + tapText(".dt-tb", "おみせ").replace(/;$/, "") + ",300);" +
    "setTimeout(()=>[...document.querySelectorAll('.dt-lcard')].find(n=>n.textContent.includes('江ノ電')).querySelector('.dt-ibtn').click(),600);" +
    "setTimeout(()=>document.querySelector('.dt-modal .dt-primary').click(),800);" +
    "setTimeout(()=>[...document.querySelectorAll('.dt-modal .dt-btn')].find(b=>b.textContent.includes('あとで')).click(),1000);" +
    "setTimeout(()=>document.querySelector('.dt-shop .dt-back').click(),1200);", wait: 1700, w: 360, h: 600, zoom: 1.3 },
  { name: "L14-book-mixed", save: save2({ line: "yamanote", station: 6, stamped: 2, stamps: { 1: 3, 5: 2, 8: 1 } }), run: book(), wait: 900 },
  { name: "L15-book-mixed-japan", save: Object.assign(save({ station: 0, stamps: { 2: 2, 4: 1, 9: 3, 12: 1 } }), {}), run: open + tapText(".dt-tb", "スタンプ"), wait: 900 },
  { name: "zL-360x600-book-mixed", save: save({ station: 0, stamps: { 2: 2, 4: 1, 9: 3, 12: 1 } }), run: open + tapText(".dt-tb", "スタンプ") + "setTimeout(()=>document.querySelector('.dt-pbody').scrollTop=430,400);", wait: 1000, w: 360, h: 600, zoom: 1.3 },
  { name: "L12-enoden-back", save: save2({ line: "enoden", station: 9, dir: -1, lap: 2, train: { model: "tram", cars: 1 } }), run: open, wait: 900 },
);
for (const [w, h] of [[412, 690], [360, 600], [393, 640]]) {
  SCENES.push({ name: `zL-${w}x${h}-enoden-long`, save: save2({ line: "enoden", station: 3, coins: 99999, train: { model: "tram" } }), dev: true, run: open, wait: 900, w, h, zoom: 1.3 });
  SCENES.push({ name: `zL-${w}x${h}-shop-lines`, save: save2({ line: "yamanote", station: 3, coins: 99999 }), dev: true,
    run: open + "setTimeout(()=>" + tapText(".dt-tb", "おみせ").replace(/;$/, "") + ",300);", wait: 900, w, h, zoom: 1.3 });
  SCENES.push({ name: `zL-${w}x${h}-book`, save: save2({ line: "yamanote", station: 25, coins: 99999, owns: ["tokaido"] }), dev: true, run: book(), wait: 900, w, h, zoom: 1.3 });
}
SCENES.push({ name: "zL-412x690-fanfare", save: save2({ line: "enoden", station: 14, step: 0, dir: -1, stamped: 13, train: { model: "tram", cars: 0 },
  queue: [{ line: "enoden", lap: 1, station: 14 }] }), run: open + "setTimeout(()=>document.querySelector('.dt-scene').click(),600);" +
  "setTimeout(()=>document.querySelector('.dt-arr').click(),800);setTimeout(()=>document.querySelector('.dt-go:not([hidden])').click(),1200);", wait: 3600, w: 412, h: 690, zoom: 1.3 });

// desktop Anki with the add-on, at 1280×800
SCENES.push(
  { name: "D01-desktop-card", desktop: true, save: save({ station: 7, step: 3, seg: 20 }), card: true, run: "", wait: 1500, w: 1280, h: 800 },
  { name: "D02-desktop-game", desktop: true, save: save({ station: 18, train: { model: "sl", cars: 2 } }), run: open, wait: 1000, w: 1280, h: 800 },
  { name: "D03-desktop-stamp", desktop: true, save: save({ station: 12, step: 0, queue: [{ lap: 1, station: 12 }] }), run: open, wait: 4200, w: 1280, h: 800 },
  { name: "D04-desktop-shop", desktop: true, save: save2({ line: "yamanote", station: 5 }), run: open + "setTimeout(()=>" + tapText(".dt-tb", "おみせ").replace(/;$/, "") + ",300);", wait: 900, w: 1280, h: 800 },
  { name: "D05-desktop-first-card", desktop: true, save: null, run: "", wait: 1500, w: 1280, h: 800 },
);

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
  const zs = sc.zoom ? (await send("Page.addScriptToEvaluateOnNewDocument", { source: TEXT_ZOOM(sc.zoom) })).result.identifier : null;
  await send("Page.navigate", { url });
  await sleep(500);
  await evaluate(`localStorage.clear();` + (sc.save ? `localStorage.setItem("densha-tabi", ${JSON.stringify(JSON.stringify(sc.save))});` : ""));
  const garden = sc.garden ? "&garden=" + encodeURIComponent("file://" + join(ROOT, "..", "kanpeki-garden", "media", "_garden.js")) : "";
  await send("Page.navigate", { url: url + (sc.dev ? "&dev=1" : "") + garden + "&card=" + (sc.card || !sc.save ? "5001" : "x") });
  await sleep(700);
  if (sc.run) await evaluate(sc.run);
  await sleep(sc.wait);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, sc.name + ".png"), Buffer.from(shot.result.data, "base64"));
  if (zs) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: zs });
  console.log("wrote", sc.name);
}
ws.close(); chr.kill();
process.exit(0);
