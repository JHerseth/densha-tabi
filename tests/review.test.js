"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { api, card, page, openGame, at, KEY } = require("./harness");

const now = at(2026, 10, 14, 19);
/** A stored save from a v: 1-shaped partial (pos, stamps, queue of the japan trip): written as v: 1, it loads
 *  through the migration, as an old save would. */
function seeded(o) {
  const s = api().fresh();
  delete s.line; delete s.lines; s.v = 1;
  s.pos = { lap: 1, station: 0, step: 0, seg: 12 }; s.stamps = {}; s.queue = [{ lap: 1, station: 0 }];
  delete s.owned.lines;
  Object.assign(s, o);
  return { [KEY]: JSON.stringify(s) };
}

test("ids from a newer script are kept, drawn as something known, and the save isn't rewritten for them", () => {
  const s = api().fresh();
  s.owned = { models: ["local", "maglev"], colors: ["gold"], cars: 0, passengers: ["🦄"], lines: ["japan", "subway9"] };
  s.lines.subway9 = { anything: 1 };
  s.line = "subway9";
  s.queue.push({ line: "subway9", lap: 1, station: 99 });
  s.train = { model: "maglev", color: "gold", cars: 0, seats: ["🦄"] };
  const raw = JSON.stringify(s), stored = { [KEY]: raw };
  const w = page(stored, { slot: {}, now });
  assert.equal(stored[KEY], raw);
  assert.match(w.slot.find("dt-chip")[0].innerHTML, /<svg/);
  const T = api();
  assert.equal(T.windowsOf(s.train), 3);
  const t2 = card(stored, 9, { now });                  // a payment keeps them too
  assert.ok(t2);
  const after = JSON.parse(stored[KEY]);
  assert.deepEqual(JSON.parse(JSON.stringify(after.owned)), s.owned);
  assert.equal(after.train.model, "maglev");
});

test("a special passenger with every window full joins the list, and the bubble says so", () => {
  const T = api(), s = T.fresh();
  s.owned.passengers = ["🐶", "🐱", "🐰"];
  s.train.seats = ["🐶", "🐱", "🐰"];
  for (let i = 0; i < 9; i++) T.stampBox(s, "2026-10-01");
  const r = T.stampBox(s, "2026-10-02");
  assert.equal(r.special, "🐼");
  assert.equal(r.seated, false);
  assert.ok(s.owned.passengers.includes("🐼"));
  assert.ok(!s.train.seats.includes("🐼"));
  const s2 = T.fresh();
  s2.queue = [];
  s2.owned.passengers = ["🐶", "🐱", "🐰"];
  s2.train.seats = ["🐶", "🐱", "🐰"];
  s2.card.boxes = Array.from({ length: 9 }, (_, i) => T.dayOf(T.dayNo("2026-10-01") + i));
  const w = card({ [KEY]: JSON.stringify(s2) }, 3, { now });
  assert.match(w.slot.find("dt-bubble")[0].textContent, /🐼 が なかまに なったよ！ おみせで すわらせてね/);
});

test("full storage says so (not the localStorage-setting line)", () => {
  const w = card({}, 5, { now, storage: "full" });
  const note = w.slot.find("dt-note")[0];
  assert.match(note.textContent, /セーブが いっぱいだよ/);
  assert.doesNotMatch(note.textContent, /localStorage in Study Screen/);
  assert.match(note.textContent, /Parents/);
});

test("chip and bubble sit under Kanpeki Garden's view and hide while it is open; the game covers everything", () => {
  const w = card({}, 5, { now });
  const css = w.document.head.children.find((n) => n.id === "dt-style").textContent;
  const z = (sel) => +css.match(new RegExp("\\." + sel + "\\{[^}]*z-index:(\\d+)"))[1];
  assert.ok(z("dt-chip") < 9500 && z("dt-bubble") < 9500);
  assert.ok(z("dt-root") > 9500);
  assert.match(css, /html\.kg-open \.dt-chip,html\.kg-open \.dt-bubble\{display:none\}/);
});

test("a long stamp queue: after two stamps, 「ぜんぶ おす」 presses the rest in one save", () => {
  const stored = seeded({ queue: [1, 2, 3, 4, 5].map((i) => ({ lap: 1, station: i })), pos: { lap: 1, station: 5, step: 0, seg: 12 } });
  const w = card(stored, "x", { now, slot: {} });
  const root = openGame(w);
  w.wait(6000);
  assert.ok(root.find("dt-all")[0].hidden);            // not after the first one
  root.find("dt-go")[0].click();
  w.wait(6000);
  const all = root.find("dt-all")[0];
  assert.equal(all.hidden, false);
  assert.match(all.innerHTML, /ぜんぶ おす（あと 3）/);
  all.click();
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.queue.length, 0);
  assert.equal(s.coins, 50);
  assert.match(root.find("dt-sheet")[0].textContent, /スタンプ 3こ ポン！/);
  assert.equal(root.find("dt-allone").length, 3);
  root.find("dt-sheet")[0].find("dt-go")[0].click();
  assert.equal(root.find("dt-arr").length, 0);
});

test("✕ stays reachable while stamps are pressed (closing keeps what was pressed)", () => {
  const stored = seeded({ queue: [{ lap: 1, station: 1 }, { lap: 1, station: 2 }], pos: { lap: 1, station: 2, step: 0, seg: 12 } });
  const w = card(stored, "x", { now, slot: {} });
  const root = openGame(w);
  w.wait(6000);
  assert.ok(root.classList.contains("dt-busy"));
  root.find("dt-arrx")[0].click();                 // the sheet's own ✕
  assert.equal(w.document.body.find("dt-root").length, 0);
  assert.equal(JSON.parse(stored[KEY]).queue.length, 1);
});

test("the top bar holds only coins and buttons; the stamp card's progress is on the week strip, which opens it", () => {
  const w = card(seeded({ queue: [], card: { boxes: ["2026-10-12", "2026-10-13"], done: 0 } }), 5, { now });
  const root = openGame(w);
  assert.doesNotMatch(root.find("dt-top")[0].textContent, /📮/);
  const week = root.find("dt-week")[0];
  assert.match(week.innerHTML, /📮 <b>3<\/b>\/10/);
  week.click();
  assert.equal(root.find("dt-cardp").length, 1);
});

test("the lap is on the station sign, not in the top bar", () => {
  const w = card(seeded({ queue: [], pos: { lap: 2, station: 4, step: 0, seg: 12 } }), 5, { now });
  const root = openGame(w);
  assert.doesNotMatch(root.find("dt-top")[0].textContent, /しゅうめ/);
  assert.match(root.find("dt-sign")[0].innerHTML, /2しゅうめ/);
});

test("route map: kana readable, and between 沖縄 and 北海道 the train is a plane", () => {
  const w = card(seeded({ queue: [], pos: { lap: 1, station: 46, step: 3, seg: 12 } }), 5, { now });
  const root = openGame(w);
  root.find("dt-tb").filter((b) => b.innerHTML.includes("スタンプ"))[0].click();
  root.find("dt-tab").filter((b) => b.innerHTML.includes("ろせんず"))[0].click();
  const svg = root.find("dt-route")[0].innerHTML;
  assert.match(svg, />✈️<\/text>/);
  const sizes = [...svg.matchAll(/font-size="([\d.]+)"[^>]*>[ぁ-んー・]+</g)].map((m) => +m[1]);
  assert.ok(sizes.length >= 47 && Math.min(...sizes) >= 11.5, String(Math.min(...sizes)));
});
