"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { api, at } = require("./harness");

test("the day starts at 04:00 local time", () => {
  let now = at(2026, 10, 14, 3, 59);
  const T = api({ now: () => now });
  assert.equal(T.today(), "2026-10-13");
  now = at(2026, 10, 14, 4, 0);
  assert.equal(T.today(), "2026-10-14");
  now = at(2026, 10, 14, 23, 59);
  assert.equal(T.today(), "2026-10-14");
  now = at(2026, 1, 1, 1, 0);           // past midnight on new year's day: still the old year's last day
  assert.equal(T.today(), "2025-12-31");
});

test("a dev day shift moves today by calendar days", () => {
  const T = api({ now: at(2026, 3, 31, 9) });
  T.setShift(1);
  assert.equal(T.today(), "2026-04-01");
  T.setShift(-31);
  assert.equal(T.today(), "2026-02-28");
});

test("dayNo and dayOf go both ways", () => {
  const T = api();
  assert.equal(T.dayOf(T.dayNo("2026-10-14")), "2026-10-14");
  assert.equal(T.dayNo("2026-10-14") - T.dayNo("2026-10-07"), 7);
});
