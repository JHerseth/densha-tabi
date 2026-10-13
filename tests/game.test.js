"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { card, openGame, api, at, KEY } = require("./harness");

const now = at(2026, 10, 14, 19);
function seeded(o) {
  const s = api().fresh();
  Object.assign(s, o);
  return { [KEY]: JSON.stringify(s) };
}

test("queued arrivals are stamped on opening, one at a time and in order; taps skip ahead", () => {
  const stored = seeded({ queue: [{ lap: 1, station: 0 }, { lap: 1, station: 1 }, { lap: 1, station: 2 }], pos: { lap: 1, station: 2, step: 0, seg: 12 } });
  const w = card(stored, "x", { now, slot: {} });
  const root = openGame(w);
  assert.match(w.slot.find("dt-chip")[0].textContent, /🚉 3/);
  w.wait(600);
  root.find("dt-scene")[0].click();                 // skip the flight to 北海道
  root.find("dt-scene")[0].click();                 // and the pull-in
  const sheet = root.find("dt-arr")[0];
  sheet.click();                                    // and the stamp's animation
  assert.equal(JSON.parse(stored[KEY]).coins, 10);
  assert.match(sheet.textContent, /北海道/);
  root.find("dt-go")[0].click();
  w.wait(5000);
  root.find("dt-go")[0].click();
  w.wait(5000);
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.queue.length, 0);
  assert.equal(s.coins, 30);
  assert.deepEqual(JSON.parse(JSON.stringify(s.stamps)), { 0: 1, 1: 1, 2: 1 });
  assert.match(root.find("dt-arr")[0].textContent, /青森|岩手/);
});

test("animations pause while the page is hidden", () => {
  const w = card(seeded({ queue: [] }), 5, { now });
  const root = openGame(w);
  w.document.hidden = true;
  w.document.fire("visibilitychange");
  assert.ok(root.classList.contains("dt-paused"));
  w.document.hidden = false;
  w.document.fire("visibilitychange");
  assert.ok(!root.classList.contains("dt-paused"));
});

test("the close button closes the game and the chip shows the steps left", () => {
  const stored = seeded({ queue: [] });
  const w = card(stored, 5, { now });
  const root = openGame(w);
  root.find("dt-x")[0].click();
  assert.equal(w.document.body.find("dt-root").length, 0);
  const s = JSON.parse(stored[KEY]);
  assert.match(w.slot.find("dt-chip")[0].textContent, new RegExp("あと " + (s.pos.seg - s.pos.step)));
});
