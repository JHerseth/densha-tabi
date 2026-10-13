"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { api } = require("./harness");

function withDays(T, counts, last = "2026-10-13") {
  const s = T.fresh(), n = T.dayNo(last);
  counts.forEach((c, i) => { s.perDay[T.dayOf(n - counts.length + 1 + i)] = c; });
  return s;
}

test("no history: segments are 12", () => {
  const T = api();
  assert.equal(T.segLength(T.fresh(), "2026-10-14"), 12);
});

test("segment length is the median of the last 7 study days, clamped to 6..200", () => {
  const T = api();
  assert.equal(T.segLength(withDays(T, [10, 30, 20]), "2026-10-14"), 20);
  assert.equal(T.segLength(withDays(T, [10, 30, 20, 40]), "2026-10-14"), 25);
  assert.equal(T.segLength(withDays(T, [2, 3, 1]), "2026-10-14"), 6);
  assert.equal(T.segLength(withDays(T, [900, 500, 1000]), "2026-10-14"), 200);
  // only the last 7 study days count: the three old 100s fall out
  assert.equal(T.segLength(withDays(T, [100, 100, 100, 9, 9, 9, 9, 5, 5, 5]), "2026-10-14"), 9);
});

test("today's count is left out (the day is still going)", () => {
  const T = api(), s = withDays(T, [30, 30, 30]);
  s.perDay["2026-10-14"] = 2;
  assert.equal(T.segLength(s, "2026-10-14"), 30);
});

test("a segment's length is fixed when the train leaves the station", () => {
  const T = api(), s = withDays(T, [30, 30, 30]);
  s.days = Object.keys(s.perDay);
  assert.equal(s.pos.seg, 12);                   // set at departure, before this history existed
  T.payCard(s, "1", "2026-10-14");
  assert.equal(s.pos.seg, 12);
  s.pos.step = 11;
  const arr = T.advance(s, 1, "2026-10-14");
  assert.equal(arr.length, 1);
  assert.equal(s.pos.seg, 30);                   // the next one from the pace
});

test("overshoot carries over across several stations in one day, each queued", () => {
  const T = api(), s = T.fresh();
  s.queue = [];
  s.pos = { lap: 1, station: 3, step: 10, seg: 12 };
  const arr = T.advance(s, 2 + 12 + 12 + 5, "2026-10-14");
  same(arr.map((a) => a.station), [4, 5, 6]);
  same(s.queue, [{ lap: 1, station: 4 }, { lap: 1, station: 5 }, { lap: 1, station: 6 }]);
  same(s.pos, { lap: 1, station: 6, step: 5, seg: 12 });
});

test("a big bonus on a tiny deck passes stations and queues them for the game", () => {
  const T = api(), s = T.fresh();
  s.queue = [];
  s.pos = { lap: 1, station: 0, step: 5, seg: 6 };
  s.days = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];
  const ev = T.payCard(s, "1", "2026-10-14");        // 1 + round(6 × 7 / 14) = 4 steps
  assert.equal(ev.steps, 4);
  assert.equal(ev.arrivals.length, 1);
  assert.equal(s.queue.length, 1);
  assert.equal(s.pos.step, 3);
});
