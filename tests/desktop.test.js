"use strict";
// Desktop Anki (DESKTOP.md): the add-on's store, injected before the card's own scripts, runs the game there.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Node, page, api, openGame, at, KEY, rerun, run } = require("./harness");

const now = at(2026, 10, 14, 19);
const INJECT = fs.readFileSync(path.join(__dirname, "..", "addon", "inject.js"), "utf8");
/** The add-on's injected script for a card, as core.py fills it in (data: the stored dict, seqs: applied seqs). */
function injected(data, seqs, card) {
  const j = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return INJECT.replace("__DATA__", j(data)).replace("__SEQS__", j(seqs)).replace("__CARD__", j(card));
}
/** A desktop reviewer page showing the answer of card id: the add-on's script, then densha.js. The config dict
 *  (what the add-on stored) is updated from the bridge messages, as core.py would. */
function desktop(config, card, opts = {}) {
  const sent = [];
  const win = page({}, Object.assign({ ankidroid: false, storage: "none", now, slot: opts.slot || { card: String(card) } }, opts, {
    before(w) { w.pycmd = (m) => { sent.push(m); apply(config, m); }; run(w, injected(config, {}, card)); },
  }));
  win.sent = sent;
  return win;
}
function apply(config, m) {
  if (m.startsWith("densha:set:")) { const [k, v] = JSON.parse(m.slice(11)); config[k] = v; }
  else if (m.startsWith("densha:del:")) delete config[JSON.parse(m.slice(11))[0]];
}

test("desktop with the add-on: mounts without ankidroid, and the save goes to the add-on's store", () => {
  const config = {};
  const w = desktop(config, 41);
  assert.equal(w.slot.find("dt-chip").length, 1);
  assert.equal(w.slot.find("dt-note").length, 0);              // no 'turn on localStorage' line on desktop
  const s = JSON.parse(config[KEY]);
  assert.equal(s.paid["41"], "2026-10-14");
  assert.ok(w.sent.length >= 1 && w.sent.every((m) => m.startsWith("densha:set:")));
  const seqs = w.sent.map((m) => JSON.parse(m.slice(11))[2]);
  assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b));   // writes go out in order, sequence rising
  assert.equal(w.DENSHA_DESKTOP, undefined);                      // taken off window for the next question side
  assert.equal(w.DENSHA_STORE, undefined);
});

test("desktop without the add-on (no store) shows nothing; so does a page with neither", () => {
  const w = page({}, { ankidroid: false, now, slot: { card: "5" } });
  assert.equal(w.slot.children.length, 0);
  const w2 = page({}, { ankidroid: false, now, slot: { card: "5" }, before(x) { x.DENSHA_DESKTOP = { v: 1, card: 5 }; } });
  assert.equal(w2.slot.children.length, 0);
});

test("the card id falls back to the add-on's when data-card is missing or not a number", () => {
  const config = {};
  desktop(config, 77, { slot: { card: "{{CardID}}" } });
  assert.equal(JSON.parse(config[KEY]).paid["77"], "2026-10-14");
  const c2 = {};
  desktop(c2, 78, { slot: {} });
  assert.equal(JSON.parse(c2[KEY]).paid["78"], "2026-10-14");
});

test("one page, card after card: one stylesheet, one live mount; the old game closes when its card goes", () => {
  const config = {};
  const w = desktop(config, 1);
  const root = openGame(w);
  assert.ok(root);
  for (const id of [2, 3]) {
    // Anki swaps #qa's HTML: the old slot goes, the new one comes, its scripts run in order
    w.slot.remove();
    const slot = new Node("div");
    slot.id = "densha";
    slot.dataset.card = String(id);
    w.document.body.append(slot);
    w.slot = slot;
    w.mutated();
    run(w, injected(config, {}, id));
    rerun(w);
  }
  assert.equal(w.document.head.children.filter((n) => n.id === "dt-style").length, 1);
  assert.equal(w.document.body.find("dt-chip").length, 1);
  assert.equal(w.document.body.find("dt-root").length, 0);       // the first card's game closed with its slot
  assert.equal(w.document.body.find("dt-backdrop").length, 0);
  const s = JSON.parse(config[KEY]);
  assert.deepEqual(Object.keys(s.paid).sort(), ["1", "2", "3"]);
  assert.equal(s.perDay["2026-10-14"], 3);
});

test("a write the add-on hasn't applied yet survives the next card's (stale) injection", () => {
  const w = page({}, { ankidroid: false, storage: "none", now, slot: null });
  w.pycmd = () => {};                                             // messages not processed yet
  run(w, injected({ "densha-tabi": "old" }, {}, 1));
  run(w, "DENSHA_STORE.setItem('densha-tabi', 'new')");
  run(w, injected({ "densha-tabi": "old" }, {}, 2));              // the add-on still has the old value
  assert.equal(run(w, "DENSHA_STORE.getItem('densha-tabi')"), "new");
  // once the add-on has applied that write (its seq), its stored value is trusted again
  const seq = run(w, "__dtPage.seqs['densha-tabi']");
  run(w, injected({ "densha-tabi": "newer from another desktop" }, { "densha-tabi": seq }, 3));
  assert.equal(run(w, "DENSHA_STORE.getItem('densha-tabi')"), "newer from another desktop");
  run(w, "DENSHA_STORE.removeItem('densha-tabi')");
  run(w, injected({ "densha-tabi": "x" }, { "densha-tabi": seq }, 4));
  assert.equal(run(w, "DENSHA_STORE.getItem('densha-tabi')"), null);
});

test("Esc closes the top box or panel first, then the game", () => {
  const w = desktop({}, 5);
  const root = openGame(w);
  w.wait(10000);
  root.find("dt-go")[0].click();                                 // the welcome stamp
  w.wait(3000);
  root.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  const esc = () => (w.document.on.keydown || []).forEach((f) => f({ key: "Escape" }));
  esc();
  assert.equal(root.find("dt-shop").length, 0);
  assert.ok(root.isConnected);
  esc();
  assert.equal(w.document.body.find("dt-root").length, 0);
  assert.equal((w.document.on.keydown || []).length, 0);         // its listener is gone too
});

test("a big window gets the phone column over a backdrop; phones (upright or sideways) don't", () => {
  const w = desktop({}, 5, { width: 1280, height: 800 });
  const root = openGame(w);
  assert.ok(root.classList.contains("dt-wide"));
  const bd = w.document.body.find("dt-backdrop")[0];
  assert.equal(bd.hidden, false);
  bd.click();
  assert.equal(w.document.body.find("dt-root").length, 0);
  for (const [width, height] of [[360, 740], [740, 360]]) {
    const p = desktop({}, 6, { width, height });
    const r = openGame(p);
    assert.ok(!r.classList.contains("dt-wide"), width + "x" + height);
    assert.equal(p.document.body.find("dt-backdrop")[0].hidden, true);
  }
});
