"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { page, card, openGame, at, KEY } = require("./harness");

const now = at(2026, 10, 14, 19);

test("a save that isn't JSON locks the game: nothing pays, the chip says so, the save is untouched", () => {
  const stored = { [KEY]: "{not json" };
  const w = card(stored, 5, { now });
  assert.equal(stored[KEY], "{not json");
  const chip = w.slot.find("dt-chip")[0];
  assert.match(chip.textContent, /いま ひらけないよ/);
  assert.equal(w.slot.find("dt-bubble").length, 0);
  chip.click();
  assert.equal(w.document.body.find("dt-root").length, 0);
});

test("a save from a newer game (v: 2) is left exactly as it is", () => {
  const raw = JSON.stringify({ v: 2, coins: 999, whatever: [1, 2] });
  const stored = { [KEY]: raw };
  const w = card(stored, 5, { now });
  assert.equal(stored[KEY], raw);
  assert.match(w.slot.find("dt-chip")[0].textContent, /いま ひらけないよ/);
});

test("other unreadable saves lock too: not an object, no v", () => {
  for (const raw of ["[]", "null", "42", JSON.stringify({ coins: 5 })]) {
    const stored = { [KEY]: raw };
    card(stored, 5, { now });
    assert.equal(stored[KEY], raw);
  }
});

test("damage that can be mended is mended, keeping what is owned", () => {
  const stored = { [KEY]: JSON.stringify({ v: 1, coins: "x", pos: { lap: 2, station: 99, step: -1, seg: 3 }, queue: [null, { lap: 1, station: 4 }],
    stamps: { 3: 2, 77: 1, a: 1 }, owned: { models: ["shin", "nope"], colors: ["red"], cars: 9, passengers: ["🐶", "🐶", "🦖"] },
    train: { model: "shin", color: "green", cars: 7, seats: ["🐶", "🐶", "🐱"] } }) };
  page(stored, { slot: {}, now });
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.coins, 0);
  same(s.pos, { lap: 2, station: 0, step: 0, seg: 12 });
  same(s.queue, [{ lap: 1, station: 4 }]);
  same(s.stamps, { 3: 2 });
  same(s.owned, { models: ["local", "shin", "nope"], colors: ["red"], cars: 4, passengers: ["🐶", "🦖"] });
  same(s.train, { model: "shin", color: "", cars: 4, seats: ["🐶", null, null] });
  same(s.days, []);
});

test("no localStorage: one line asking for the setting, instead of the chip", () => {
  for (const storage of ["none", "throws"]) {
    const w = card({}, 5, { now, storage });
    assert.equal(w.slot.find("dt-chip").length, 0);
    const note = w.slot.find("dt-note")[0];
    assert.match(note.textContent, /localStorage in Study Screen/);
  }
});

test("a payment that can't be stored isn't celebrated: the note shows instead", () => {
  const stored = {};
  const w = card(stored, 5, { now, storage: "full" });
  assert.equal(w.slot.find("dt-bubble").length, 0);
  assert.equal(w.slot.find("dt-note").length, 1);
  assert.equal(stored[KEY], undefined);
});

test("every change is written at once (the page may be torn down any moment)", () => {
  const stored = {};
  const w = card(stored, 5, { now });
  const root = openGame(w);
  w.wait(10000);                                   // the welcome stamp is pressed
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.queue.length, 0);
  assert.equal(s.stamps[0], 1);
  assert.equal(s.coins, 10);
  assert.ok(root);
});
