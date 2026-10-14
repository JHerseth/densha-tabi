"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { api, card, page, at, KEY } = require("./harness");

test("a card pays once per day; another day it pays again", () => {
  const T = api(), s = T.fresh();
  const a = T.payCard(s, "11", "2026-10-14");
  assert.ok(a && a.first);
  assert.equal(T.payCard(s, "11", "2026-10-14"), null);     // the answer shown again, undo, re-opening
  const b = T.payCard(s, "12", "2026-10-14");
  assert.ok(b && !b.first);
  assert.equal(b.steps, 1);
  assert.equal(s.perDay["2026-10-14"], 2);
  assert.ok(T.payCard(s, "11", "2026-10-15"));
  same(s.days, ["2026-10-14", "2026-10-15"]);
});

test("paid cards are kept for today and yesterday only", () => {
  const T = api(), s = T.fresh();
  T.payCard(s, "1", "2026-10-10");
  T.payCard(s, "2", "2026-10-13");
  T.payCard(s, "3", "2026-10-14");
  same(Object.keys(s.paid).sort(), ["2", "3"]);
});

test("per-day counts are pruned to the last 30 days", () => {
  const T = api(), s = T.fresh();
  T.payCard(s, "1", "2026-09-01");
  T.payCard(s, "2", "2026-10-14");
  same(Object.keys(s.perDay), ["2026-10-14"]);
});

test("study days among the last 7 days, today included", () => {
  const T = api(), s = T.fresh();
  s.days = ["2026-10-01", "2026-10-07", "2026-10-08", "2026-10-10", "2026-10-13"];
  assert.equal(T.studyK(s, "2026-10-14"), 3);        // 10-08, 10-10, 10-13 (10-07 is 7 days back: out)
  s.days.push("2026-10-14");
  assert.equal(T.studyK(s, "2026-10-14"), 4);
});

test("the daily bonus is round(segment × k / 14), on the day's first card", () => {
  const T = api();
  assert.equal(T.bonusFor(12, 7), 6);
  assert.equal(T.bonusFor(12, 1), 1);
  assert.equal(T.bonusFor(20, 3), 4);
  assert.equal(T.bonusFor(200, 7), 100);
  const s = T.fresh();
  s.lines.japan.pos.seg = 20;
  s.days = ["2026-10-11", "2026-10-12", "2026-10-13"];
  const ev = T.payCard(s, "5", "2026-10-14");
  assert.equal(ev.k, 4);
  assert.equal(ev.bonus, 6);                  // round(20 × 4 / 14) = round(5.71)
  assert.equal(ev.steps, 7);
  assert.equal(s.lines.japan.pos.step, 7);
  assert.equal(s.card.boxes.length, 1);
  assert.equal(T.payCard(s, "6", "2026-10-14").bonus, 0);
});

test("on a card: it pays when the back is shown, and only once that day", () => {
  const stored = {}, now = at(2026, 10, 14, 20);
  const w1 = card(stored, 77, { now });
  assert.ok(w1.slot.find("dt-bubble").length === 1);
  const s1 = JSON.parse(stored[KEY]);
  assert.equal(s1.paid["77"], "2026-10-14");
  const w2 = card(stored, 77, { now });
  assert.equal(w2.slot.find("dt-bubble").length, 0);
  assert.equal(stored[KEY], JSON.stringify(s1));
  const w3 = card(stored, 77, { now: at(2026, 10, 15, 3, 30) });     // still the 14th (before 04:00)
  assert.equal(w3.slot.find("dt-bubble").length, 0);
  const w4 = card(stored, 77, { now: at(2026, 10, 15, 4, 1) });
  assert.equal(w4.slot.find("dt-bubble").length, 1);
});

test("without data-card the chip shows but nothing moves", () => {
  const stored = {};
  const w = page(stored, { slot: {}, now: at(2026, 10, 14) });
  assert.equal(w.slot.find("dt-chip").length, 1);
  assert.equal(w.slot.find("dt-bubble").length, 0);
  assert.equal(JSON.parse(stored[KEY]).lines.japan.pos.step, 0);
  page(stored, { slot: { card: "{{CardID}}" }, now: at(2026, 10, 14) });
  assert.equal(JSON.parse(stored[KEY]).lines.japan.pos.step, 0);
});

test("the first card's bubble names the stamp card and the bonus; the chip counts down", () => {
  const stored = {}, w = card(stored, 1, { now: at(2026, 10, 14) });
  const b = w.slot.find("dt-bubble")[0];
  assert.match(b.textContent, /スタンプカード ＋1 ・ まいにち ボーナス ×1/);
  assert.match(b.textContent, /つぎは あおもり/);
  assert.match(w.slot.find("dt-chip")[0].textContent, /🚉 1/);   // 北海道's welcome stamp waits
  w.wait(3200);
  assert.equal(w.slot.find("dt-bubble").length, 0);             // shrunk into the chip
});
