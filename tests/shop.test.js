"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
/** Deep equality across the vm realm (its objects have other prototypes). */
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const { api } = require("./harness");

test("buying needs the coins, puts the thing to use, and takes only its price", () => {
  const T = api(), s = T.fresh();
  s.coins = 39;
  assert.equal(T.buy(s, "model", "tram"), false);
  assert.equal(s.coins, 39);
  s.coins = 45;
  assert.equal(T.buy(s, "model", "tram"), true);
  assert.equal(s.coins, 5);
  assert.equal(s.train.model, "tram");
  assert.equal(T.buy(s, "model", "tram"), false);       // owned: never bought twice
  s.coins = 1000;
  assert.ok(T.buy(s, "color", "red"));
  assert.equal(s.train.color, "red");
  assert.ok(T.buy(s, "pass", "🐶"));
  assert.ok(T.buy(s, "car", ""));
  assert.equal(s.coins, 1000 - 20 - 15 - 30);
  assert.equal(T.buy(s, "pass", "🐼"), false);          // specials aren't for sale
});

test("cars: up to 4 extra, and taking cars off keeps them", () => {
  const T = api(), s = T.fresh();
  s.coins = 1000;
  for (let i = 0; i < 6; i++) T.buy(s, "car", "");
  assert.equal(s.owned.cars, 4);
  assert.equal(s.coins, 1000 - 4 * 30);
  assert.ok(T.equip(s, "cars", 1));
  assert.equal(s.owned.cars, 4);
  assert.equal(T.equip(s, "cars", 5), false);
});

test("switching models and colours never loses anything owned", () => {
  const T = api(), s = T.fresh();
  s.coins = 1000;
  T.buy(s, "model", "shin"); T.buy(s, "color", "blue"); T.buy(s, "color", "pink");
  assert.ok(T.equip(s, "model", "local"));
  assert.ok(T.equip(s, "color", ""));
  assert.ok(T.equip(s, "model", "shin"));
  assert.ok(T.equip(s, "color", "blue"));
  assert.equal(T.equip(s, "model", "sl"), false);       // not owned
  same(s.owned.models, ["local", "shin"]);
  same(s.owned.colors, ["blue", "pink"]);
});

test("passengers move between windows and step off, but stay owned", () => {
  const T = api(), s = T.fresh();
  s.coins = 100;
  T.buy(s, "pass", "🐶"); T.buy(s, "pass", "🐱");
  same(s.train.seats, ["🐶", "🐱"]);
  T.seat(s, 2, "🐶");
  same(s.train.seats, [null, "🐱", "🐶"]);
  T.seat(s, 1, null);
  same(s.train.seats, [null, null, "🐶"]);
  same(s.owned.passengers, ["🐶", "🐱"]);
  assert.equal(T.seat(s, 0, "🐷"), false);             // not owned
});

test("windows: lead car plus each extra car", () => {
  const T = api();
  assert.equal(T.windowsOf({ model: "local", cars: 0 }), 3);
  assert.equal(T.windowsOf({ model: "shin", cars: 2 }), 16);
  assert.equal(T.windowsOf({ model: "sl", cars: 1 }), 5);
});
