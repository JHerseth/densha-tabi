"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { api } = require("./harness");

test("after 沖縄 the next lap starts at 北海道", () => {
  const T = api(), s = T.fresh();
  s.queue = [];
  s.pos = { lap: 1, station: 45, step: 0, seg: 6 };
  const arr = T.advance(s, 18, "2026-10-14");      // 6 to 沖縄, then 12 (a new segment) on to 北海道
  same(arr, [{ lap: 1, station: 46 }, { lap: 2, station: 0 }]);
  same(s.pos, { lap: 2, station: 0, step: 0, seg: 12 });
});

test("+10 coins per arrival, paid as its stamp is pressed, one at a time in order", () => {
  const T = api(), s = T.fresh();
  T.pressStamp(s);                                  // 北海道's welcome stamp
  assert.equal(s.coins, 10);
  T.advance(s, 24, "2026-10-14");
  assert.equal(s.queue.length, 2);
  assert.equal(T.pressStamp(s).station, 1);
  assert.equal(T.pressStamp(s).station, 2);
  assert.equal(T.pressStamp(s), null);
  assert.equal(s.coins, 30);
  same(s.stamps, { 0: 1, 1: 1, 2: 1 });
});

test("the stamp book keeps each station's best lap", () => {
  const T = api(), s = T.fresh();
  s.queue = [{ lap: 2, station: 5 }, { lap: 1, station: 5 }, { lap: 3, station: 5 }];
  T.pressStamp(s);
  assert.equal(s.stamps[5], 2);
  T.pressStamp(s);
  assert.equal(s.stamps[5], 2);                     // a lower lap never replaces a better stamp
  T.pressStamp(s);
  assert.equal(s.stamps[5], 3);
  assert.equal(s.coins, 30);
});
