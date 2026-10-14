"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { page, card, openGame, at, KEY } = require("./harness");

const now = at(2026, 10, 14, 19);

test("it mounts only in AnkiDroid's study screen (ankidroid.userAction)", () => {
  const stored = {};
  const w = page(stored, { slot: { card: "5" }, now, ankidroid: false });
  assert.equal(w.slot.children.length, 0);
  assert.equal(stored[KEY], undefined);
  const w2 = page(stored, { slot: { card: "5" }, now });
  w2.ankidroid = { userAction: "nope" };
  const w3 = page({}, { slot: { card: "5" }, now, ankidroid: false });
  w3.ankidroid = {};
  assert.equal(w3.slot.children.length, 0);
  assert.equal(w2.slot.find("dt-chip").length, 1);
});

test("a page without the slot does nothing; the style is injected once", () => {
  const w = page({}, { slot: null, now });
  assert.equal(w.document.head.children.length, 0);
  const w2 = card({}, 5, { now });
  w2.DenshaTabi.mount(w2.slot);                    // the script run twice on one card
  assert.equal(w2.document.head.find("dt-chip").length, 0);
  assert.equal(w2.document.head.children.filter((n) => n.id === "dt-style").length, 1);
  assert.equal(w2.slot.find("dt-chip").length, 1);
});

test("test controls only with data-dev", () => {
  const stored = {};
  const root = openGame(card(stored, 5, { now }));
  assert.equal(root.find("dt-gear").length, 0);
  const root2 = openGame(card(stored, 6, { now, data: { dev: "1" } }));
  assert.equal(root2.find("dt-gear").length, 1);
});

test("the dev day offset is read only with data-dev", () => {
  const stored = { "densha-tabi-dev-day": "3" };
  card(stored, 5, { now });
  assert.equal(JSON.parse(stored[KEY]).paid["5"], "2026-10-14");
  card(stored, 6, { now, data: { dev: "1" } });
  assert.equal(JSON.parse(stored[KEY]).paid["6"], "2026-10-17");
});

test("the dev panel's buttons: coins, a past study day, steps, arrive now", () => {
  const stored = {};
  const w = card(stored, 5, { now, data: { dev: "1" } });
  const root = openGame(w);
  w.wait(10000);                                    // the welcome stamp first
  root.find("dt-go")[0].click();                    // しゅっぱつ！
  w.wait(2000);
  const press = (label) => { root.find("dt-gear")[0].click(); root.find("dt-btn").filter((b) => b.innerHTML.includes(label))[0].click(); };
  press("🪙＋50");
  assert.equal(JSON.parse(stored[KEY]).coins, 60);
  press("しゅっせき");
  same(JSON.parse(stored[KEY]).days, ["2026-10-13", "2026-10-14"]);
  press("つぎの えきへ");
  assert.equal(JSON.parse(stored[KEY]).queue.length, 1);
  w.wait(10000);
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.queue.length, 0);
  assert.equal(s.lines.japan.stamps[1], 1);
});

test("answering (the slot removed) closes the game", () => {
  const w = card({}, 5, { now });
  openGame(w);
  w.slot.remove();
  w.mutated();
  assert.equal(w.document.body.find("dt-root").length, 0);
  assert.equal(w.document.documentElement.classList.contains("dt-open"), false);
});
