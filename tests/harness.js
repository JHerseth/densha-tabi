// A tiny fake DOM, localStorage and timer clock to run densha.js in node (node:vm), as AnkiDroid's study screen would.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "densha.js"), "utf8");
const KEY = "densha-tabi";

/** A DOM element: enough of one for densha.js (children, classes, style, dataset, listeners, innerHTML kept as text). */
class Node {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parent = null; this.text = ""; this.html = ""; this.className = "";
    this.dataset = {}; this.attrs = {}; this.on = {}; this.hidden = false; this.disabled = false; this.id = "";
    const props = {};
    this.style = { setProperty: (k, v) => { props[k] = v; }, getPropertyValue: (k) => props[k] };
    this.classList = {
      add: (...cs) => cs.forEach((c) => { if (!this.classList.contains(c)) this.className = (this.className + " " + c).trim(); }),
      remove: (...cs) => cs.forEach((c) => { this.className = this.className.split(" ").filter((x) => x && x !== c).join(" "); }),
      toggle: (c, on) => { if (on === undefined) on = !this.classList.contains(c); on ? this.classList.add(c) : this.classList.remove(c); return on; },
      contains: (c) => this.className.split(" ").includes(c),
    };
  }
  get textContent() { return this.text + this.html.replace(/<[^>]*>/g, "") + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.text = String(v); this.html = ""; this.children = []; }
  get innerHTML() { return this.html; }
  set innerHTML(v) { this.html = String(v); this.text = ""; this.children = []; }
  append(...ns) {
    for (let n of ns) {
      if (typeof n !== "object") n = Object.assign(new Node("#text"), { text: String(n) });
      if (n.parent) n.remove();
      n.parent = this; this.children.push(n);
    }
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n.tagName === "#document"; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
  removeEventListener(t, f) { this.on[t] = (this.on[t] || []).filter((g) => g !== f); }
  /** Fire event type t here and up through the parents (as a bubbling DOM event), until stopPropagation. */
  fire(t) {
    let stop = false, n = this;
    const e = { type: t, target: this, stopPropagation() { stop = true; }, preventDefault() {} };
    while (n && !stop) { (n.on[t] || []).slice().forEach((f) => f(e)); n = n.parent; }
  }
  click() { if (!this.disabled) this.fire("click"); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.all(pred, out)); return out; }
  /** Every element below (and including) this one with class c. */
  find(c) { return this.all((n) => n.classList.contains(c)); }
}

/** A page with densha.js loaded. stored: the localStorage map, shared between pages (as between cards).
 *  opts.now: the time (ms) DT_CLOCK gives (a function too); opts.ankidroid: false leaves out ankidroid.userAction;
 *  opts.slot: data- attributes for a #densha slot put on the page before the script runs (null: no slot);
 *  opts.storage: "none" (no localStorage), "throws" (every call throws), "full" (setItem throws);
 *  opts.reduceMotion; opts.test: set DT_TEST so the script hands over its pure functions.
 *  win.wait(ms) runs the timers due within ms. */
function page(stored, opts = {}) {
  const doc = new Node("#document"), html = new Node("html"), head = new Node("head"), body = new Node("body");
  doc.append(html); html.append(head, body);
  Object.assign(doc, {
    documentElement: html, head, body, hidden: false,
    createElement: (t) => new Node(t),
    getElementById: (id) => doc.all((n) => n.id === id)[0] || null,
  });
  let ls = {
    getItem: (k) => (k in stored ? stored[k] : null),
    setItem: (k, v) => { if (opts.storage === "full") throw new Error("QuotaExceededError"); stored[k] = String(v); },
    removeItem: (k) => { delete stored[k]; },
  };
  if (opts.storage === "throws") ls = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  const win = {
    document: doc, innerWidth: 360, innerHeight: 740,
    timers: {}, nextTimer: 1, clock: 0, observers: [],
    setTimeout(f, ms) { win.timers[win.nextTimer] = { f, at: win.clock + (ms || 0) }; return win.nextTimer++; },
    clearTimeout(id) { delete win.timers[id]; },
    wait(ms) {
      const end = win.clock + ms;
      for (;;) {
        const due = Object.keys(win.timers).filter((id) => win.timers[id].at <= end).sort((a, b) => win.timers[a].at - win.timers[b].at || a - b)[0];
        if (due == null) break;
        const t = win.timers[due]; delete win.timers[due]; win.clock = t.at; t.f();
      }
      win.clock = end;
    },
    matchMedia: (q) => ({ matches: !!opts.reduceMotion && q === "(prefers-reduced-motion: reduce)" }),
    MutationObserver: class { constructor(f) { this.f = f; win.observers.push(this); } observe() {} disconnect() { this.off = true; } },
    /** Run the mutation observers (as after the page changed). */
    mutated() { win.observers.filter((o) => !o.off).forEach((o) => o.f([])); },
  };
  if (opts.storage !== "none") {
    if (opts.storage === "throws") Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError"); } });
    else win.localStorage = ls;
  }
  if (opts.ankidroid !== false) win.ankidroid = { userAction() {} };
  if (opts.now != null) win.DT_CLOCK = typeof opts.now === "function" ? opts.now : () => opts.now;
  if (opts.test) win.DT_TEST = true;
  win.window = win;
  if (opts.slot !== null && opts.slot !== undefined) {
    const slot = new Node("div");
    slot.id = "densha";
    Object.assign(slot.dataset, opts.slot);
    body.append(slot);
    win.slot = slot;
  }
  if (opts.width) { win.innerWidth = opts.width; win.innerHeight = opts.height; }
  win.on = {};
  win.addEventListener = (t, f) => { (win.on[t] = win.on[t] || []).push(f); };
  win.removeEventListener = (t, f) => { win.on[t] = (win.on[t] || []).filter((x) => x !== f); };
  vm.createContext(win);
  if (opts.before) opts.before(win);
  vm.runInContext(SRC, win);
  return win;
}

/** Run densha.js again in the same page (as desktop Anki and AnkiDroid do for each card's <script>). */
function rerun(win) { vm.runInContext(SRC, win); }
/** Run some other code in the page. */
function run(win, code) { return vm.runInContext(code, win); }

/** Local time ms for y-m-d h:mm (months from 1). */
function at(y, m, d, h = 12, min = 0) { return new Date(y, m - 1, d, h, min).getTime(); }

/** The pure functions, on a page with no slot. */
function api(opts = {}) { return page({}, Object.assign({ test: true }, opts)).DT_TEST; }

/** Show the back of card id on a new page sharing stored (a new slot, the script run again). */
function card(stored, id, opts = {}) {
  return page(stored, Object.assign({ slot: Object.assign({ card: String(id) }, opts.data || {}) }, opts));
}

/** Tap the chip on a card page; returns the game's root. */
function openGame(win) {
  win.slot.find("dt-chip")[0].click();
  return win.document.body.find("dt-root")[0];
}

module.exports = { Node, page, api, card, openGame, at, KEY, rerun, run };
