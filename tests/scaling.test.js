"use strict";
// One ordinary study day ≈ one station, for any deck size, and no single unusual day races through the map.
const test = require("node:test");
const assert = require("node:assert/strict");
const { api } = require("./harness");

/** Study counts[i] cards on day i (0 = no study); returns the stations reached each day. */
function simulate(T, counts, start = "2026-01-01") {
  const s = T.fresh(), n0 = T.dayNo(start);
  s.queue = [];
  let id = 0;
  return counts.map((c, i) => {
    const day = T.dayOf(n0 + i);
    let got = 0;
    for (let k = 0; k < c; k++) got += T.payCard(s, String(++id), day).arrivals.length;
    return got;
  });
}
const days = (n, c) => Array.from({ length: n }, () => c);
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test("regular daily study: 1–2 stations a day, whatever the deck size", () => {
  const T = api();
  for (const c of [8, 20, 60, 150, 300, 600]) {
    const per = simulate(T, days(60, c)).slice(14);       // after the pace has settled
    const a = avg(per);
    assert.ok(a >= 1 && a <= 2, `${c} cards a day: ${a.toFixed(2)} stations a day`);
    assert.ok(Math.max(...per) <= 2, `${c} cards a day: ${Math.max(...per)} on one day`);
  }
});

test("studying every other day still gets about a station a study day", () => {
  const T = api();
  const per = simulate(T, Array.from({ length: 60 }, (_, i) => (i % 2 ? 0 : 40))).slice(14).filter((_, i) => i % 2 === 0);
  const a = avg(per);
  assert.ok(a >= 0.7 && a <= 2, a);
});

test("a first-ever 500-card day doesn't race through the map", () => {
  const T = api();
  const [first] = simulate(T, [500]);
  assert.ok(first <= 8, `${first} stations on day one`);
});

test("an erratic deck (0, 200, 3, …) stays within a dozen stations on its biggest day", () => {
  const T = api();
  const per = simulate(T, Array.from({ length: 60 }, (_, i) => [0, 200, 3, 15, 0, 120, 1][i % 7]));
  assert.ok(Math.max(...per) <= 14, `max ${Math.max(...per)} in a day`);
});

test("back after a break longer than a month, a 300-card day is a handful of stations", () => {
  const T = api();
  const per = simulate(T, days(20, 20).concat(days(40, 0), [300]));
  assert.ok(per[per.length - 1] <= 8, `${per[per.length - 1]} stations`);
});
