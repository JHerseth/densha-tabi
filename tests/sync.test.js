"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { card, openGame, at, KEY } = require("./harness");

const now = at(2026, 10, 14, 19);

test("read-modify-write: a card paid on another page while the game is open survives a purchase here", () => {
  const stored = {};
  const seed = JSON.parse(JSON.stringify(require("./harness").api().fresh()));
  seed.queue = [];
  seed.coins = 100;
  stored[KEY] = JSON.stringify(seed);
  const a = card(stored, 1, { now });
  const root = openGame(a);
  a.wait(1000);
  card(stored, 2, { now });                          // page B: another card's back is shown meanwhile
  assert.equal(JSON.parse(stored[KEY]).perDay["2026-10-14"], 2);
  // page A buys a colour
  root.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  root.find("dt-tab").filter((b) => b.innerHTML.includes("いろ"))[0].click();
  root.find("dt-item").filter((n) => n.textContent.includes("あか"))[0].find("dt-ibtn")[0].click();
  root.find("dt-modal")[0].find("dt-primary")[0].click();
  const s = JSON.parse(stored[KEY]);
  same(s.owned.colors, ["red"]);
  assert.equal(s.coins, 80);
  assert.equal(s.perDay["2026-10-14"], 2);          // B's payment is still there
  assert.ok(s.paid["2"]);
});

test("a purchase that can't be saved doesn't look bought", () => {
  const stored = {};
  const seed = require("./harness").api().fresh();
  seed.queue = [];
  seed.coins = 100;
  stored[KEY] = JSON.stringify(seed);
  const a = card(stored, 1, { now });
  const root = openGame(a);
  const before = stored[KEY];
  // the storage fills up now
  a.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  root.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  root.find("dt-tab").filter((b) => b.innerHTML.includes("いろ"))[0].click();
  root.find("dt-item").filter((n) => n.textContent.includes("あか"))[0].find("dt-ibtn")[0].click();
  root.find("dt-modal")[0].find("dt-primary")[0].click();
  assert.equal(stored[KEY], before);
  assert.equal(root.find("dt-coins")[0].innerHTML.includes("100"), true);
  assert.equal(root.find("dt-toast").length, 1);
});
