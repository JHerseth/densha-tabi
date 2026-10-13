"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { api } = require("./harness");

test("a study day stamps one box; a full card pays +50, brings the next special passenger, and starts afresh", () => {
  const T = api(), s = T.fresh(), n = T.dayNo("2026-10-01");
  for (let i = 0; i < 9; i++) T.payCard(s, "c" + i, T.dayOf(n + i));
  assert.equal(s.card.boxes.length, 9);
  const coins = s.coins;
  const ev = T.payCard(s, "c9", T.dayOf(n + 9));
  same(ev.card, { full: true, special: "🐼", seated: true, boxes: 10 });
  assert.equal(s.coins, coins + 50);
  assert.equal(s.card.done, 1);
  same(s.card.boxes, []);
  assert.ok(s.owned.passengers.includes("🐼"));
  assert.equal(s.train.seats[0], "🐼");            // seated in the first free window
});

test("specials come in a fixed order, then only coins", () => {
  const T = api(), s = T.fresh();
  const got = [];
  for (let c = 0; c < 10; c++) {
    for (let b = 0; b < 9; b++) T.stampBox(s, "2026-01-01");
    got.push(T.stampBox(s, "2026-01-01").special);
  }
  same(got, ["🐼", "🦊", "🐧", "🐨", "🦉", "🐯", "🦁", "🐸", null, null]);
  assert.equal(s.coins, 500);
  assert.equal(s.card.done, 10);
});

test("the dev past day adds a study day before today and stamps its box", () => {
  const T = api(), s = T.fresh();
  s.days = ["2026-10-13", "2026-10-14"];
  T.devPastDay(s, "2026-10-14");
  same(s.days, ["2026-10-12", "2026-10-13", "2026-10-14"]);
  same(s.card.boxes, ["2026-10-12"]);
});
