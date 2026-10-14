"use strict";
// Lines (LINES.md): one active line, each with its own trip; loops and there-and-back lines; a full set of stamps.
const test = require("node:test");
const assert = require("node:assert/strict");
const { api, card, openGame, page, at, KEY } = require("./harness");
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

const now = at(2026, 10, 14, 19);
const DAY = "2026-10-14";
/** A fresh save with lines ids bought (coins enough). */
function withLines(T, ids) {
  const s = T.fresh();
  s.queue = [];
  s.coins = 5000;
  ids.forEach((id) => assert.ok(T.buy(s, "line", id)));
  s.queue = [];
  return s;
}

test("a v: 1 save becomes v: 2: its trip, stamps and queue are line japan's; nothing else changes", () => {
  const v1 = { v: 1, paid: { 9: "2026-10-14" }, perDay: { "2026-10-14": 3 }, days: ["2026-10-14"], pos: { lap: 2, station: 7, step: 4, seg: 15 },
    queue: [{ lap: 2, station: 7 }], stamps: { 0: 2, 3: 1 }, coins: 77, card: { boxes: ["2026-10-14"], done: 1 },
    owned: { models: ["local", "sl"], colors: ["red"], cars: 1, passengers: ["🐼"] }, train: { model: "sl", color: "red", cars: 1, seats: ["🐼"] } };
  const stored = { [KEY]: JSON.stringify(v1) };
  page(stored, { slot: {}, now });
  const s = JSON.parse(stored[KEY]);
  assert.equal(s.v, 2);
  assert.equal(s.line, "japan");
  same(s.lines, { japan: { pos: { lap: 2, station: 7, step: 4, seg: 15, dir: 1 }, stamps: { 0: 2, 3: 1 } } });
  same(s.queue, [{ line: "japan", lap: 2, station: 7 }]);
  assert.equal(s.pos, undefined);
  assert.equal(s.stamps, undefined);
  assert.equal(s.coins, 77);
  same(s.owned, { models: ["local", "sl"], colors: ["red"], cars: 1, passengers: ["🐼"], lines: ["japan"] });
  same(s.train, v1.train);
  same(s.card, v1.card);
});

test("buying a line: its price, the line owned, its first stamp waiting; boarding is the child's choice", () => {
  const T = api(), s = T.fresh();
  s.queue = [];
  s.coins = 199;
  assert.equal(T.buy(s, "line", "yamanote"), false);
  s.coins = 250;
  assert.ok(T.buy(s, "line", "yamanote"));
  assert.equal(s.coins, 50);
  same(s.owned.lines, ["japan", "yamanote"]);
  same(s.queue, [{ line: "yamanote", lap: 1, station: 0 }]);
  assert.equal(s.line, "japan");
  assert.equal(T.buy(s, "line", "yamanote"), false);
  assert.equal(T.buy(s, "line", "japan"), false);
  assert.equal(T.board(s, "enoden"), false);             // not owned
  assert.ok(T.board(s, "yamanote"));
  assert.equal(s.line, "yamanote");
});

test("each line keeps its own trip: switching pauses the old one where it was", () => {
  const T = api(), s = withLines(T, ["yamanote"]);
  T.advance(s, 5, DAY);
  const japan = JSON.stringify(s.lines.japan);
  T.board(s, "yamanote");
  T.advance(s, 30, DAY);
  assert.equal(JSON.stringify(s.lines.japan), japan);
  same(s.lines.yamanote.pos, { lap: 1, station: 2, step: 6, seg: 12, dir: 1 });
  T.board(s, "japan");
  T.advance(s, 7, DAY);
  same(s.lines.japan.pos, { lap: 1, station: 1, step: 0, seg: 12, dir: 1 });
  same(s.lines.yamanote.pos, { lap: 1, station: 2, step: 6, seg: 12, dir: 1 });
});

test("a loop line wraps from its last station to its first, a lap a round", () => {
  const T = api(), s = withLines(T, ["yamanote"]);
  T.board(s, "yamanote");
  s.lines.yamanote.pos = { lap: 1, station: 28, step: 0, seg: 6, dir: 1 };
  const arr = T.advance(s, 6 + 12, DAY);
  same(arr.map((a) => [a.lap, a.station]), [[1, 29], [2, 0]]);
  assert.equal(s.lines.yamanote.pos.lap, 2);
});

test("there and back: the terminus is one arrival, then おりかえし; each end-to-end run is a lap", () => {
  const T = api(), s = withLines(T, ["enoden"]);
  T.board(s, "enoden");
  s.lines.enoden.pos = { lap: 1, station: 12, step: 0, seg: 6, dir: 1 };
  const arr = T.advance(s, 6 + 12 + 12, DAY);           // to 13, to 14 (the end), back to 13
  same(arr.map((a) => [a.lap, a.station, a.turn]), [[1, 13, false], [1, 14, true], [2, 13, false]]);
  same(s.queue.map((a) => a.station), [13, 14, 13]);     // the end station once, not twice
  assert.equal(s.lines.enoden.pos.dir, -1);
  // all the way back to the start: one arrival there too, then the third run heads out again
  s.lines.enoden.pos = { lap: 2, station: 1, step: 0, seg: 6, dir: -1 };
  s.queue = [];
  const back = T.advance(s, 6 + 12, DAY);
  same(back.map((a) => [a.lap, a.station, a.turn]), [[2, 0, true], [3, 1, false]]);
  same(s.lines.enoden.pos, { lap: 3, station: 1, step: 0, seg: 12, dir: 1 });
});

test("a whole line stamped: +100 once, and the line marked full", () => {
  const T = api(), s = withLines(T, ["enoden"]);
  const n = T.LINES.find((l) => l.id === "enoden").stations.length;
  s.coins = 0;
  for (let i = 0; i < n; i++) s.queue.push({ line: "enoden", lap: 1, station: i });
  const res = [];
  for (let i = 0; i < n; i++) res.push(T.pressStamp(s));
  assert.deepEqual(res.map((r) => r.full), Array.from({ length: n }, (_, i) => i === n - 1));
  assert.equal(s.coins, n * 10 + 100);
  assert.equal(s.lines.enoden.full, true);
  s.queue.push({ line: "enoden", lap: 2, station: 3 });
  assert.equal(T.pressStamp(s).full, false);
  assert.equal(s.coins, n * 10 + 100 + 10);
});

test("a queue with arrivals from several lines stamps each on its own line", () => {
  const T = api(), s = withLines(T, ["yamanote", "yui"]);
  s.queue = [{ line: "japan", lap: 1, station: 4 }, { line: "yamanote", lap: 1, station: 4 }, { line: "yui", lap: 2, station: 4 }];
  T.pressStamp(s); T.pressStamp(s); T.pressStamp(s);
  same(s.lines.japan.stamps, { 4: 1 });
  same(s.lines.yamanote.stamps, { 4: 1 });
  same(s.lines.yui.stamps, { 4: 2 });
  assert.equal(s.coins, 5000 - 450 + 30);
});

test("the pace is the same on every line: switching lines doesn't change stations per day", () => {
  const T = api();
  for (const plan of [["japan"], ["yamanote"], ["enoden", "japan", "tokaido"]]) {
    const s = withLines(T, ["yamanote", "enoden", "tokaido"]), n0 = T.dayNo("2026-01-01"), per = [];
    let id = 0;
    for (let d = 0; d < 40; d++) {
      T.board(s, plan[d % plan.length]);
      let got = 0;
      for (let k = 0; k < 40; k++) got += T.payCard(s, String(++id), T.dayOf(n0 + d)).arrivals.length;
      per.push(got);
    }
    const tail = per.slice(14), avg = tail.reduce((a, b) => a + b, 0) / tail.length;
    assert.ok(avg >= 1 && avg <= 2 && Math.max(...tail) <= 2, plan.join(",") + ": " + avg);
  }
});

test("unknown line ids stay in the save; the train runs japan meanwhile", () => {
  const T = api(), s = T.fresh();
  s.queue = [];
  s.owned.lines.push("mars");
  s.lines.mars = { pos: "far away" };
  s.line = "mars";
  s.queue.push({ line: "mars", lap: 1, station: 3 });
  const raw = JSON.stringify(s), stored = { [KEY]: raw };
  const w = card(stored, 1, { now });
  const after = JSON.parse(stored[KEY]);
  assert.equal(after.line, "mars");
  same(after.lines.mars, { pos: "far away" });
  same(after.queue, [{ line: "mars", lap: 1, station: 3 }]);
  assert.ok(after.lines.japan.pos.step > 0);           // the card moved the japan trip
  assert.match(w.slot.find("dt-chip")[0].textContent, /あと/);
});

test("the shop's first tab is ろせん: buy, then 「いま のる？」 boards the line", () => {
  const s = api().fresh();
  s.queue = [];
  s.coins = 300;
  const stored = { [KEY]: JSON.stringify(s) };
  const w = card(stored, 1, { now });
  const root = openGame(w);
  root.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  const tabs = root.find("dt-tab");
  assert.match(tabs[0].innerHTML, /ろせん/);
  assert.ok(tabs[0].classList.contains("dt-on"));
  const yam = root.find("dt-lcard").filter((n) => n.textContent.includes("山手線"))[0];
  yam.find("dt-ibtn")[0].click();
  root.find("dt-modal")[0].find("dt-primary")[0].click();         // かう！
  assert.match(root.find("dt-modal")[0].textContent, /いま のる？/);
  root.find("dt-modal")[0].find("dt-primary")[0].click();         // のる！
  const after = JSON.parse(stored[KEY]);
  assert.equal(after.line, "yamanote");
  assert.equal(after.coins, 100);
  assert.match(root.find("dt-sign")[0].innerHTML, /やまのてせん/);
});

test("the stamp book's line picker: owned lines to choose, the rest locked with their price; a ring for 山手線", () => {
  const T = api(), s = withLines(T, ["yamanote"]);
  const w = card({ [KEY]: JSON.stringify(s) }, 1, { now });
  const root = openGame(w);
  root.find("dt-tb").filter((b) => b.innerHTML.includes("スタンプ"))[0].click();
  const chips = root.find("dt-lchip");
  assert.equal(chips.length, 6);
  assert.equal(chips.filter((c) => c.classList.contains("dt-locked")).length, 4);
  assert.match(chips.find((c) => c.innerHTML.includes("江ノ電")).innerHTML, /🔒/);
  chips.find((c) => c.innerHTML.includes("山手線")).click();
  assert.equal(root.find("dt-cell").length, 30);
  root.find("dt-tab").filter((b) => b.innerHTML.includes("ろせんず"))[0].click();
  const svg = root.find("dt-route")[0].innerHTML;
  assert.match(svg, /A32 32 0 0 0/);                                 // the ring's round ends
  assert.equal((svg.match(/font-weight="700" fill=/g) || []).length, 30);
  root.find("dt-lboard")[0].click();                                  // この せんに のる
  assert.equal(JSON.parse(w.localStorage.getItem(KEY)).line, "yamanote");
});

test("arrivals on a line at its terminus say おりかえし, and the train turns round", () => {
  const T = api(), s = withLines(T, ["enoden"]);
  T.board(s, "enoden");
  s.lines.enoden.pos = { lap: 1, station: 14, step: 0, seg: 12, dir: -1 };
  s.queue = [{ line: "enoden", lap: 1, station: 14 }];
  const w = card({ [KEY]: JSON.stringify(s) }, "x", { now, slot: {} });
  const root = openGame(w);
  assert.ok(root.classList.contains("dt-back"));
  w.wait(6000);
  const sheet = root.find("dt-sheet")[0];
  assert.match(sheet.textContent, /おりかえし/);
  root.find("dt-go")[0].click();
  assert.equal(root.find("dt-banner").length, 1);
});

test("the first full set of a line's stamps brings ぜんえき せいは！", () => {
  const T = api(), s = withLines(T, ["enoden"]);
  for (let i = 0; i < 14; i++) s.lines.enoden.stamps[i] = 1;
  s.queue = [{ line: "enoden", lap: 1, station: 14 }];
  const stored = { [KEY]: JSON.stringify(s) };
  const w = card(stored, "x", { now, slot: {} });
  const root = openGame(w);
  w.wait(6000);
  root.find("dt-go")[0].click();
  const fan = root.find("dt-fan")[0];
  assert.match(fan.find("dt-fanbox")[0].innerHTML, /ぜんえき せいは！/);
  assert.equal(JSON.parse(stored[KEY]).coins, 5000 - 150 + 10 + 100);
  fan.find("dt-go")[0].click();
  assert.equal(root.find("dt-fan").length, 0);
});

test("a line boarded before it has moved takes its first segment from the pace, not 12", () => {
  const T = api(), s = withLines(T, ["yamanote"]);
  for (let d = 1; d <= 7; d++) s.perDay[T.dayOf(T.dayNo(DAY) - d)] = 80;
  T.board(s, "yamanote", DAY);
  assert.equal(s.lines.yamanote.pos.seg, 80);
  // once it has moved, boarding again leaves its segment as it was
  s.lines.yamanote.pos.step = 3;
  s.perDay[T.dayOf(T.dayNo(DAY) - 1)] = 5;
  T.board(s, "japan", DAY);
  T.board(s, "yamanote", DAY);
  assert.equal(s.lines.yamanote.pos.seg, 80);
  // the day's bonus on the new line follows the pace too
  const ev = T.payCard(s, "1", DAY);
  assert.equal(ev.bonus, Math.round(80 * ev.k / 14));
});

test("a migrated save with every japan station stamped gets ぜんえき せいは once, on its first press", () => {
  const stamps = Object.fromEntries(Array.from({ length: 47 }, (_, i) => [i, 1]));
  const v1 = { v: 1, paid: {}, perDay: {}, days: [], pos: { lap: 2, station: 3, step: 0, seg: 12 }, queue: [{ lap: 2, station: 3 }, { lap: 2, station: 4 }],
    stamps, coins: 0, card: { boxes: [], done: 0 }, owned: { models: ["local"], colors: [], cars: 0, passengers: [] }, train: { model: "local", color: "", cars: 0, seats: [] } };
  const stored = { [KEY]: JSON.stringify(v1) };
  page(stored, { slot: {}, now });
  const T = api(), s = JSON.parse(stored[KEY]);
  assert.equal(T.pressStamp(s).full, true);
  assert.equal(s.coins, 110);
  assert.equal(T.pressStamp(s).full, false);
  assert.equal(s.coins, 120);
});

test("shop のる closes the shop; おりかえし shows only for the line the train is on; waiting stamps have a button", () => {
  const T = api(), s = withLines(T, ["enoden", "yamanote"]);
  s.queue = [{ line: "enoden", lap: 1, station: 14 }];
  const stored = { [KEY]: JSON.stringify(s) };
  const w = card(stored, "x", { now, slot: {} });
  const root = openGame(w);
  w.wait(6000);
  root.find("dt-go")[0].click();                                   // terminus of 江ノ電, but the train is on japan
  assert.equal(root.find("dt-banner").length, 0);
  w.wait(3000);
  // buy nothing, just board 山手線 from the shop's ろせん tab
  root.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  root.find("dt-lcard").filter((n) => n.textContent.includes("山手線"))[0].find("dt-ibtn")[0].click();
  assert.equal(root.find("dt-shop").length, 0);
  assert.equal(JSON.parse(stored[KEY]).line, "yamanote");
  // a line bought for later: its first stamp waits, with a 🚉 button in the top bar
  const s2 = T.fresh();
  s2.queue = [];
  s2.coins = 500;
  const st2 = { [KEY]: JSON.stringify(s2) };
  const w2 = card(st2, "x", { now, slot: {} });
  const r2 = openGame(w2);
  r2.find("dt-tb").filter((b) => b.innerHTML.includes("おみせ"))[0].click();
  r2.find("dt-lcard").filter((n) => n.textContent.includes("江ノ電"))[0].find("dt-ibtn")[0].click();
  r2.find("dt-modal")[0].find("dt-primary")[0].click();             // かう！
  r2.find("dt-modal")[0].find("dt-btn").filter((b) => b.innerHTML.includes("あとで"))[0].click();
  r2.find("dt-shop")[0].find("dt-back")[0].click();
  const wb = r2.find("dt-waitbtn")[0];
  assert.equal(wb.hidden, false);
  assert.match(wb.innerHTML, /🚉<small>1こ<\/small>/);
  wb.click();
  w2.wait(6000);
  assert.equal(JSON.parse(st2[KEY]).queue.length, 0);
});
