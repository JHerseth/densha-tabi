// node shot.mjs <url> <out.png> [w] [h] [waitMs] [js-to-eval-before-shot]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const [url, out, w = "360", h = "740", wait = "800", js = ""] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(process.env.SCRATCH || tmpdir(), "chr-"));
const chr = spawn("/usr/bin/chromium-browser", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  "--no-first-run", "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(+wait);
if (js) { const r = await send("Runtime.evaluate", { expression: js, awaitPromise: true }); if (r.result?.exceptionDetails) console.error(JSON.stringify(r.result.exceptionDetails)); await sleep(+wait); }
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
ws.close(); chr.kill();
console.log("wrote", out);
process.exit(0);
