/* でんしゃ たび (Train Trip) — a study-reward game on the back of Anki cards (AnkiDroid's new study screen).
 *
 * Every card whose back is shown moves a little drawn train one step along the 47 prefectures of Japan, 北海道 → 沖縄
 * and round again. The game knows nothing about the card but its id (data-card="{{CardID}}"), so it works on any
 * deck: the distance between stations follows the player's own pace (one ordinary study day ≈ one station), and
 * coins come from stations and study days, never from card counts. See DESIGN.md.
 *
 * The slot, at the end of any back template:
 *   <div id="densha" data-card="{{CardID}}"></div>
 *   <script src="_densha.js"></script>
 * Desktop Anki: with the でんしゃ たび add-on, the reviewer's answer side gets window.DENSHA_DESKTOP and
 * window.DENSHA_STORE (a localStorage-like store kept in the collection config, so it syncs); see DESKTOP.md.
 * data-dev="1" on the slot adds test controls. It mounts only where ankidroid.userAction exists (AnkiDroid's study
 * screen); the page can be swapped away at any moment, so every change is saved at once.
 *
 * Hooks: globalThis.DT_CLOCK() (ms) replaces Date.now() for tests; globalThis.DT_TEST === true before load makes
 * DT_TEST the game's pure functions. One global otherwise: DenshaTabi = { mount }.
 */
(function () {
  "use strict";
  var g = typeof globalThis !== "undefined" ? globalThis : window;
  var doc = g.document;
  /** Desktop Anki with the add-on: its store and the card id, taken once as this script runs (the add-on sets them
   *  just before, on the answer side only). They're removed from window so that the next card's question side,
   *  which runs in the same page, finds nothing; this script keeps them. */
  var DESK = g.DENSHA_DESKTOP && g.DENSHA_STORE && typeof g.DENSHA_STORE.getItem === "function"
    ? { card: g.DENSHA_DESKTOP.card, store: g.DENSHA_STORE } : null;
  if (DESK) { try { delete g.DENSHA_DESKTOP; delete g.DENSHA_STORE; } catch (e) { /* not removable: keep them */ } }

  // ---- data -------------------------------------------------------------------------------------
  var KEY = "densha-tabi", DEV_DAY_KEY = "densha-tabi-dev-day", V = 2;
  var DEFAULT_SEG = 12, MIN_SEG = 6, MAX_SEG = 2000;
  var ARRIVAL_COINS = 10, CARD_COINS = 50, CARD_BOXES = 10, FULL_COINS = 100;

  /** The 47 stations in JIS order: [kanji, kana, souvenir emoji, souvenir kana]. */
  var STATIONS = [
    ["北海道", "ほっかいどう", "🦀", "かに"], ["青森", "あおもり", "🍎", "りんご"], ["岩手", "いわて", "🥢", "わんこそば"],
    ["宮城", "みやぎ", "🎋", "たなばた"], ["秋田", "あきた", "🐕", "あきたいぬ"], ["山形", "やまがた", "🍒", "さくらんぼ"],
    ["福島", "ふくしま", "🐂", "あかべこ"], ["茨城", "いばらき", "🍈", "メロン"], ["栃木", "とちぎ", "🍓", "いちご"],
    ["群馬", "ぐんま", "🥬", "キャベツ"], ["埼玉", "さいたま", "🍠", "さつまいも"], ["千葉", "ちば", "🥜", "らっかせい"],
    ["東京", "とうきょう", "🗼", "とうきょうタワー"], ["神奈川", "かながわ", "🥟", "ちゅうかまん"], ["新潟", "にいがた", "🍙", "おこめ"],
    ["富山", "とやま", "🦑", "ほたるいか"], ["石川", "いしかわ", "✨", "きんぱく"], ["福井", "ふくい", "🦕", "きょうりゅう"],
    ["山梨", "やまなし", "🍇", "ぶどう"], ["長野", "ながの", "🏔️", "やま"], ["岐阜", "ぎふ", "🌰", "くり"],
    ["静岡", "しずおか", "🍵", "おちゃ"], ["愛知", "あいち", "🍤", "えびフライ"], ["三重", "みえ", "🦞", "いせえび"],
    ["滋賀", "しが", "🛶", "びわこ"], ["京都", "きょうと", "⛩️", "じんじゃ"], ["大阪", "おおさか", "🐙", "たこやき"],
    ["兵庫", "ひょうご", "🌉", "おおはし"], ["奈良", "なら", "🦌", "しか"], ["和歌山", "わかやま", "🐼", "パンダ"],
    ["鳥取", "とっとり", "🐫", "さきゅう"], ["島根", "しまね", "🐚", "しじみ"], ["岡山", "おかやま", "🍑", "もも"],
    ["広島", "ひろしま", "🦪", "かき"], ["山口", "やまぐち", "🐡", "ふぐ"], ["徳島", "とくしま", "💃", "あわおどり"],
    ["香川", "かがわ", "🍜", "うどん"], ["愛媛", "えひめ", "🍊", "みかん"], ["高知", "こうち", "🐋", "くじら"],
    ["福岡", "ふくおか", "🏮", "やたい"], ["佐賀", "さが", "🏺", "やきもの"], ["長崎", "ながさき", "🍰", "カステラ"],
    ["熊本", "くまもと", "🐻", "くま"], ["大分", "おおいた", "♨️", "おんせん"], ["宮崎", "みやざき", "🥭", "マンゴー"],
    ["鹿児島", "かごしま", "🌋", "さくらじま"], ["沖縄", "おきなわ", "🍍", "パイナップル"]
  ];
  var N = STATIONS.length;

  // ---- lines data: generated from lines.json by scripts/build.sh (edit lines.json, then build; not this block) ----
  /* LINES-DATA:BEGIN */
  var LINE_DATA = {
    "yamanote": Object.assign({"name":"山手線","yomi":"やまのてせん","color":"#9acd32","type":"loop","price":200,"scenery":[[0,"kanto"]]}, { stations: [
      ["東京","とうきょう","🍱","えきべん"],
      ["神田","かんだ",null,null],
      ["秋葉原","あきはばら","🎮","でんきがい"],
      ["御徒町","おかちまち",null,null],
      ["上野","うえの","🐼","パンダ"],
      ["鶯谷","うぐいすだに",null,null],
      ["日暮里","にっぽり",null,null],
      ["西日暮里","にしにっぽり",null,null],
      ["田端","たばた",null,null],
      ["駒込","こまごめ",null,null],
      ["巣鴨","すがも",null,null],
      ["大塚","おおつか",null,null],
      ["池袋","いけぶくろ","🐧","ペンギン"],
      ["目白","めじろ",null,null],
      ["高田馬場","たかだのばば",null,null],
      ["新大久保","しんおおくぼ",null,null],
      ["新宿","しんじゅく","🏙️","こうそうビル"],
      ["代々木","よよぎ",null,null],
      ["原宿","はらじゅく","🍭","カラフル スイーツ"],
      ["渋谷","しぶや","🐕","ハチこう"],
      ["恵比寿","えびす",null,null],
      ["目黒","めぐろ",null,null],
      ["五反田","ごたんだ",null,null],
      ["大崎","おおさき",null,null],
      ["品川","しながわ","🐬","すいぞくかん"],
      ["高輪ゲートウェイ","たかなわゲートウェイ",null,null],
      ["田町","たまち",null,null],
      ["浜松町","はままつちょう",null,null],
      ["新橋","しんばし","🚂","SLひろば"],
      ["有楽町","ゆうらくちょう",null,null]
    ] }),
    "enoden": Object.assign({"name":"江ノ電","yomi":"えのでん","color":"#009a44","type":"line","price":150,"scenery":[[0,"kanto"],[3,"chugoku"]]}, { stations: [
      ["藤沢","ふじさわ",null,null],
      ["石上","いしがみ",null,null],
      ["柳小路","やなぎこうじ",null,null],
      ["鵠沼","くげぬま",null,null],
      ["湘南海岸公園","しょうなんかいがんこうえん","🐠","すいぞくかん"],
      ["江ノ島","えのしま","🏝️","えのしま"],
      ["腰越","こしごえ",null,null],
      ["鎌倉高校前","かまくらこうこうまえ","🌊","うみの みえる えき"],
      ["七里ヶ浜","しちりがはま",null,null],
      ["稲村ヶ崎","いなむらがさき",null,null],
      ["極楽寺","ごくらくじ",null,null],
      ["長谷","はせ","🙏","かまくらの だいぶつ"],
      ["由比ヶ浜","ゆいがはま",null,null],
      ["和田塚","わだづか",null,null],
      ["鎌倉","かまくら","⛩️","つるがおか はちまんぐう"]
    ] }),
    "yui": Object.assign({"name":"ゆいレール","yomi":"ゆいレール","color":"#e8618c","type":"line","price":250,"scenery":[[0,"kyushu"]]}, { stations: [
      ["那覇空港","なはくうこう","✈️","ひこうき"],
      ["赤嶺","あかみね","⭐","にっぽんで いちばん みなみの えき"],
      ["小禄","おろく",null,null],
      ["奥武山公園","おうのやまこうえん",null,null],
      ["壺川","つぼがわ",null,null],
      ["旭橋","あさひばし",null,null],
      ["県庁前","けんちょうまえ",null,null],
      ["美栄橋","みえばし",null,null],
      ["牧志","まきし","🏪","こくさいどおり"],
      ["安里","あさと",null,null],
      ["おもろまち","おもろまち",null,null],
      ["古島","ふるじま",null,null],
      ["市立病院前","しりつびょういんまえ",null,null],
      ["儀保","ぎぼ",null,null],
      ["首里","しゅり","🏯","しゅりじょう"],
      ["石嶺","いしみね",null,null],
      ["経塚","きょうづか",null,null],
      ["浦添前田","うらそえまえだ",null,null],
      ["てだこ浦西","てだこうらにし",null,null]
    ] }),
    "odakyu": Object.assign({"name":"小田急小田原線","yomi":"おだきゅう おだわらせん","color":"#2288cc","type":"line","price":300,"scenery":[[0,"kanto"],[38,"chubu"]]}, { stations: [
      ["新宿","しんじゅく","🏙️","こうそうビル"],
      ["南新宿","みなみしんじゅく",null,null],
      ["参宮橋","さんぐうばし",null,null],
      ["代々木八幡","よよぎはちまん",null,null],
      ["代々木上原","よよぎうえはら",null,null],
      ["東北沢","ひがしきたざわ",null,null],
      ["下北沢","しもきたざわ","🎸","おんがくの まち"],
      ["世田谷代田","せたがやだいた",null,null],
      ["梅ヶ丘","うめがおか",null,null],
      ["豪徳寺","ごうとくじ","🐱","まねきねこ"],
      ["経堂","きょうどう",null,null],
      ["千歳船橋","ちとせふなばし",null,null],
      ["祖師ヶ谷大蔵","そしがやおおくら",null,null],
      ["成城学園前","せいじょうがくえんまえ",null,null],
      ["喜多見","きたみ",null,null],
      ["狛江","こまえ",null,null],
      ["和泉多摩川","いずみたまがわ",null,null],
      ["登戸","のぼりと",null,null],
      ["向ヶ丘遊園","むこうがおかゆうえん","🌹","ばらえん"],
      ["生田","いくた",null,null],
      ["読売ランド前","よみうりランドまえ","🎢","ゆうえんち"],
      ["百合ヶ丘","ゆりがおか",null,null],
      ["新百合ヶ丘","しんゆりがおか",null,null],
      ["柿生","かきお",null,null],
      ["鶴川","つるかわ",null,null],
      ["玉川学園前","たまがわがくえんまえ",null,null],
      ["町田","まちだ","🐿️","リスえん"],
      ["相模大野","さがみおおの",null,null],
      ["小田急相模原","おだきゅうさがみはら",null,null],
      ["相武台前","そうぶだいまえ",null,null],
      ["座間","ざま",null,null],
      ["海老名","えびな",null,null],
      ["厚木","あつぎ",null,null],
      ["本厚木","ほんあつぎ",null,null],
      ["愛甲石田","あいこういしだ",null,null],
      ["伊勢原","いせはら",null,null],
      ["鶴巻温泉","つるまきおんせん","♨️","おんせん"],
      ["東海大学前","とうかいだいがくまえ",null,null],
      ["秦野","はだの","🏔️","たんざわの やま"],
      ["渋沢","しぶさわ",null,null],
      ["新松田","しんまつだ",null,null],
      ["開成","かいせい",null,null],
      ["栢山","かやま",null,null],
      ["富水","とみず",null,null],
      ["螢田","ほたるだ",null,null],
      ["足柄","あしがら",null,null],
      ["小田原","おだわら","🏯","おだわらじょう"]
    ] }),
    "tokaido": Object.assign({"name":"東海道新幹線","yomi":"とうかいどう しんかんせん","color":"#1a5fb4","type":"line","price":400,"scenery":[[0,"kanto"],[3,"chubu"],[14,"kinki"]]}, { stations: [
      ["東京","とうきょう","🍱","えきべん"],
      ["品川","しながわ",null,null],
      ["新横浜","しんよこはま","🍜","ラーメン はくぶつかん"],
      ["小田原","おだわら","🏯","おだわらじょう"],
      ["熱海","あたみ","♨️","おんせん"],
      ["三島","みしま",null,null],
      ["新富士","しんふじ","🗻","ふじさん"],
      ["静岡","しずおか","🍵","おちゃ"],
      ["掛川","かけがわ",null,null],
      ["浜松","はままつ","🐟","うなぎ"],
      ["豊橋","とよはし",null,null],
      ["三河安城","みかわあんじょう",null,null],
      ["名古屋","なごや","🍤","えびフライ"],
      ["岐阜羽島","ぎふはしま",null,null],
      ["米原","まいばら",null,null],
      ["京都","きょうと","⛩️","じんじゃ"],
      ["新大阪","しんおおさか","🐙","たこやき"]
    ] })
  };
  /* LINES-DATA:END */

  /** Every line: the 47-prefecture trip (japan: a loop, with the flight from 沖縄 to 北海道) and the lines to buy.
   *  type: "japan" | "loop" (round forever, a lap per round) | "line" (there and back; each end-to-end run a lap).
   *  stations: [kanji, kana, souvenir emoji or null, souvenir name or null]; scenery: [[from station, region id]]. */
  var LINES = [{ id: "japan", name: "にっぽん いっしゅう", yomi: "にっぽん いっしゅう", short: "にっぽん", color: "#e0523f",
    type: "japan", price: 0, stations: STATIONS, scenery: null }].concat(Object.keys(LINE_DATA).map(function (k) {
    var d = LINE_DATA[k];
    return { id: k, name: d.name, yomi: d.yomi, short: d.name, color: d.color, type: d.type === "loop" ? "loop" : "line",
      price: d.price, stations: d.stations, scenery: d.scenery };
  }));
  /** The line with id, or null for an id this script doesn't know (kept in the save, not run). */
  function lineOf(id) { return LINES.filter(function (l) { return l.id === id; })[0] || null; }
  /** The region (scenery set) for station i of line l. */
  function sceneKeyOf(l, i) {
    if (l.type === "japan") return regionOf(i).id;
    var key = "kanto";
    (l.scenery || []).forEach(function (r) { if (i >= r[0] && SCENES[r[1]]) key = r[1]; });
    return key;
  }

  /** Regions for scenery and the route map: id, kana name, first and last station index, line colour. */
  var REGIONS = [
    { id: "hokkaido", name: "ほっかいどう", from: 0, to: 0, color: "#3b8fd6" },
    { id: "tohoku", name: "とうほく", from: 1, to: 6, color: "#3aa35c" },
    { id: "kanto", name: "かんとう", from: 7, to: 13, color: "#e09a12" },
    { id: "chubu", name: "ちゅうぶ", from: 14, to: 22, color: "#8a5fc8" },
    { id: "kinki", name: "きんき", from: 23, to: 29, color: "#e0505a" },
    { id: "chugoku", name: "ちゅうごく", from: 30, to: 34, color: "#17a3a6" },
    { id: "shikoku", name: "しこく", from: 35, to: 38, color: "#ee78a6" },
    { id: "kyushu", name: "きゅうしゅう・おきなわ", from: 39, to: 46, color: "#ef6f2c" }
  ];
  /** The region a station index is in. */
  function regionOf(i) {
    for (var r = 0; r < REGIONS.length; r++) if (i >= REGIONS[r].from && i <= REGIONS[r].to) return REGIONS[r];
    return REGIONS[0];
  }

  /** Stamp ink by lap: 1 red, 2 blue, 3 green, 4 purple, 5+ gold. */
  var INKS = ["#d0353c", "#2c66cc", "#21894a", "#7d48c4", "#c08a10"];
  function inkOf(lap) { return INKS[Math.min(Math.max(lap, 1), 5) - 1]; }

  /** Train models: drawn side views (see the art section). base: the default body colour; stripe: its accent. */
  var MODELS = [
    { id: "local", name: "ふつう でんしゃ", price: 0, base: "#eef1f4", stripe: "#2fa45a" },
    { id: "tram", name: "ろめん でんしゃ", price: 40, base: "#e8763a", stripe: "#f7efd9" },
    { id: "mono", name: "モノレール", price: 60, base: "#f4f6f8", stripe: "#2a86d6" },
    { id: "sl", name: "エスエル", price: 120, base: "#2c2d34", stripe: "#e2b04a" },
    { id: "shin", name: "しんかんせん", price: 200, base: "#f7f8fa", stripe: "#1f5cbf" }
  ];
  /** Paint colours, 20 coins each (the model's own colour is free and always there). */
  var COLORS = [
    { id: "red", name: "あか", c: "#e5484d" }, { id: "orange", name: "オレンジ", c: "#f28a26" },
    { id: "yellow", name: "きいろ", c: "#f4c21b" }, { id: "green", name: "みどり", c: "#3aa65a" },
    { id: "sky", name: "みずいろ", c: "#4cb4e6" }, { id: "blue", name: "あお", c: "#3460c8" },
    { id: "purple", name: "むらさき", c: "#8c58d0" }, { id: "pink", name: "ピンク", c: "#f37cab" }
  ];
  /** The model that suits each line best (a hint in the shop). */
  var FITS = { yamanote: "local", enoden: "tram", yui: "mono", odakyu: "local", tokaido: "shin" };
  var COLOR_PRICE = 20, CAR_PRICE = 30, MAX_CARS = 4, PASSENGER_PRICE = 15;
  /** Passengers for sale, and the special ones a full stamp card brings (in this order). */
  var PASSENGERS = [["🐶", "いぬ"], ["🐱", "ねこ"], ["🐰", "うさぎ"], ["🐻", "くま"], ["🐹", "ハムスター"],
    ["🐮", "うし"], ["🐷", "ぶた"], ["🐵", "さる"]];
  var SPECIALS = [["🐼", "パンダ"], ["🦊", "きつね"], ["🐧", "ペンギン"], ["🐨", "コアラ"], ["🦉", "ふくろう"],
    ["🐯", "とら"], ["🦁", "ライオン"], ["🐸", "かえる"]];
  function modelOf(id) { return MODELS.filter(function (m) { return m.id === id; })[0] || MODELS[0]; }
  function colorOf(id) { return COLORS.filter(function (c) { return c.id === id; })[0] || null; }
  function passengerName(e) {
    var p = PASSENGERS.concat(SPECIALS).filter(function (x) { return x[0] === e; })[0];
    return p ? p[1] : "";
  }

  /** The UI's words, in kana with spaces between words, for an 8–10 year old. */
  var T = {
    noStorage: "でんしゃ たび: AnkiDroid の せってい で「localStorage in Study Screen」を オンに してね",
    locked: "いま ひらけないよ",
    left: function (n) { return "あと " + n; },
    next: function (k) { return "つぎは " + k; },
    arrived: function (k) { return k + " に とうちゃく！🚉"; },
    goStamp: "スタンプを おしに いこう",
    more: function (n) { return "（ほかにも " + n + "えき！）"; },
    daily: function (k) { return "📮 スタンプカード ＋1 ・ まいにち ボーナス ×" + k; },
    cardFull: "📮 カード いっぱい！ ＋50 🪙",
    special: function (e) { return e + " が のってきた！"; },
    specialList: function (e) { return e + " が なかまに なったよ！ おみせで すわらせてね"; },
    full: "でんしゃ たび: セーブが いっぱいだよ",
    fullParent: "（Parents: AnkiDroid's study-screen localStorage is full, so today's progress can't be saved. Free some space, e.g. other card games' data.）",
    saveFail: function () { return saveFull ? "セーブが いっぱいだよ" : "いま ほぞん できないよ"; },
    lap: function (n) { return n + "しゅうめ"; },
    title: "でんしゃ たび"
  };

  // ---- time -------------------------------------------------------------------------------------
  /** The dev day offset (calendar days), set by mount for a data-dev slot only. */
  var shift = 0;
  /** Today as YYYY-MM-DD; the day starts at 04:00 local time, as in Anki. DT_CLOCK replaces the clock in tests. */
  function today() {
    var d = new Date(typeof g.DT_CLOCK === "function" ? g.DT_CLOCK() : Date.now());
    if (d.getHours() < 4) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12);
    if (shift) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift, 12);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function isDay(v) { return typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v); }
  /** A day as a number that goes up by one a day (calendar days, so DST can't skip one). */
  function dayNo(day) { return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5; }
  /** dayNo back to YYYY-MM-DD. */
  function dayOf(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  /** The stored dev day offset (read only for a data-dev slot). */
  function devShift() {
    try {
      var n = Number(storage().getItem(DEV_DAY_KEY));
      return Number.isInteger(n) && Math.abs(n) <= 36500 ? n : 0;
    } catch (e) { return 0; }
  }

  // ---- save -------------------------------------------------------------------------------------
  /* localStorage "densha-tabi", JSON:
   * { v: 2,
   *   paid:   { "<cardId>": "YYYY-MM-DD" }  the day each card last paid; pruned to today and yesterday on write
   *   perDay: { "YYYY-MM-DD": n }           cards paid per day, the last 30 days: the pace (shared by all lines)
   *   days:   ["YYYY-MM-DD", ...]           study days, sorted and unique, ever
   *   line:   "<line id>"                   the line the train runs on now
   *   lines:  { "<line id>": {              each line's own trip, kept while another line runs:
   *             pos: { lap, station, step, seg, dir },  at/after station, step steps into a segment of seg steps,
   *                                                     dir +1/-1 (there-and-back lines; loops always +1)
   *             stamps: { "<station>": lap },           the best (highest) lap stamped at each station
   *             full: true } }                          once every station has a stamp (the +100 was paid)
   *   queue:  [{ line, lap, station }]      arrivals not yet stamped in the game, oldest first
   *   coins:  n
   *   card:   { boxes: [day, ...], done }   the stamp card in progress (one box per study day), cards completed
   *   owned:  { models: [id], colors: [id], cars: n, passengers: [emoji], lines: [id] }
   *   train:  { model, color ("" = the model's own), cars, seats: [emoji|null by window] } }
   * v: 1 had pos, stamps and queue for the one trip; they become line japan's (migrate). A v: 1 script locks on
   * v: 2, as on any v it doesn't know, so it never writes over it.
   * A new trip starts at its first station with that stamp waiting (for japan: the train flew to 北海道, as it does on
   * every lap), so boarding has a ポン！ to press at once. Coins for an arrival are paid when its stamp is pressed, with
   * the ＋10 the child sees then. A save that can't be read (not JSON, not an object, another v) is never written over. */
  function fresh() {
    return { v: V, paid: {}, perDay: {}, days: [], line: "japan", lines: { japan: freshTrip() },
      queue: [{ line: "japan", lap: 1, station: 0 }], coins: 0, card: { boxes: [], done: 0 },
      owned: { models: ["local"], colors: [], cars: 0, passengers: [], lines: ["japan"] },
      train: { model: "local", color: "", cars: 0, seats: [] } };
  }
  /** A line's trip before it starts: at its first station, heading on. */
  function freshTrip() { return { pos: { lap: 1, station: 0, step: 0, seg: DEFAULT_SEG, dir: 1 }, stamps: {} }; }
  /** A v: 1 save as v: 2 (in place): its trip becomes line japan's; nothing else changes. */
  function migrate(s) {
    var pos = isObj(s.pos) ? s.pos : {};
    pos.dir = 1;
    s.lines = { japan: { pos: pos, stamps: isObj(s.stamps) ? s.stamps : {} } };
    s.line = "japan";
    s.queue = (Array.isArray(s.queue) ? s.queue : []).map(function (a) { if (isObj(a)) a.line = "japan"; return a; });
    if (isObj(s.owned)) s.owned.lines = ["japan"];
    delete s.pos;
    delete s.stamps;
    s.v = 2;
  }
  /** A locked, empty save: nothing pays or is stored. nostore: there's no usable localStorage at all. */
  function locked(nostore) {
    var s = fresh();
    s.queue = [];
    Object.defineProperty(s, "locked", { value: true });
    if (nostore) Object.defineProperty(s, "nostore", { value: true });
    return s;
  }
  /** Where the save lives: the add-on's store on desktop Anki, else localStorage; null where it's missing or
   *  blocked. Everything that reads or writes the save goes through this. */
  function storage() {
    if (DESK) return DESK.store;
    try { return g.localStorage || null; } catch (e) { return null; }
  }
  /** A stored string as a save: fresh if none, mended if damaged in ways that can be mended, locked if it can't
   *  be read (not JSON, not an object, or another v, e.g. from a newer game). */
  function parse(raw) {
    if (raw == null) return fresh();
    try {
      var s = JSON.parse(raw);
      if (isObj(s) && s.v === 1) migrate(s);
      if (!isObj(s) || s.v !== V) return locked();
      tidy(s);
      return s;
    } catch (e) { return locked(); }
  }
  /** Read the save: { s, raw }, raw being what is stored now (after writing a new or mended save). With no usable
   *  localStorage s is locked and nostore; an unreadable save is locked and left exactly as it is. */
  function readSave() {
    var ls = storage(), raw;
    if (!ls) return { s: locked(true), raw: null };
    try { raw = ls.getItem(KEY); } catch (e) { return { s: locked(true), raw: null }; }
    var s = parse(raw);
    if (s.locked) return { s: s, raw: raw };
    var out = JSON.stringify(s);
    if (out !== raw) { var w = save(s); if (w) raw = w; }
    return { s: s, raw: raw };
  }
  /** The save alone (see readSave). */
  function load() { return readSave().s; }
  /** Write the save (never a locked one). Returns the JSON written, or false if it couldn't be stored. */
  function save(s) {
    if (!s || s.locked) return false;
    try { var j = JSON.stringify(s); storage().setItem(KEY, j); saveFull = false; return j; }
    catch (e) { saveFull = isQuota(e); return false; }
  }
  /** Whether the last failed save failed because the storage is full (not because it's off or blocked). */
  var saveFull = false;
  function isQuota(e) {
    return !!e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || "")));
  }
  /** Make save object s the same as src (in place, so every view of s sees it). */
  function replaceSave(s, src) {
    Object.keys(s).forEach(function (k) { delete s[k]; });
    Object.keys(src).forEach(function (k) { s[k] = src[k]; });
  }
  /** Read-modify-write: another card's page may have paid since this page last read or wrote the save. If what is
   *  stored changed, take it before changing anything. False if it can't be read now (then change nothing). */
  function syncIn(ctx) {
    var ls = storage(), raw;
    if (!ls) return false;
    try { raw = ls.getItem(KEY); } catch (e) { return false; }
    if (raw === ctx.raw) return true;
    var f = parse(raw);
    if (f.locked) return false;
    replaceSave(ctx.s, f);
    ctx.raw = raw;
    return true;
  }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isInt(v, lo, hi) { return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi; }
  /** Mend every field the game reads so nothing throws and nothing owned is lost. Whether anything changed. */
  function tidy(s) {
    var before = JSON.stringify(s), f = fresh();
    ["paid", "perDay", "lines", "card", "owned", "train"].forEach(function (k) { if (!isObj(s[k])) s[k] = f[k]; });
    ["days", "queue"].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
    if (typeof s.coins !== "number" || !isFinite(s.coins) || s.coins < 0) s.coins = Math.max(0, Number(s.coins) || 0);
    s.coins = Math.floor(s.coins);
    Object.keys(s.paid).forEach(function (k) { if (!isDay(s.paid[k])) delete s.paid[k]; });
    Object.keys(s.perDay).forEach(function (k) { if (!isDay(k) || !isInt(s.perDay[k], 1, 1e6)) delete s.perDay[k]; });
    s.days = s.days.filter(function (d, i, a) { return isDay(d) && a.indexOf(d) === i; }).sort();
    // every line this script knows gets a sound trip; a line it doesn't know (a newer script's) is kept as it is
    Object.keys(s.lines).forEach(function (id) { if (lineOf(id)) tidyTrip(s, id); });
    if (!s.lines.japan) s.lines.japan = freshTrip();
    if (typeof s.line !== "string") s.line = "japan";
    s.queue = s.queue.filter(function (a) {
      if (!isObj(a) || typeof a.line !== "string" || !isInt(a.lap, 1, 1e6) || !isInt(a.station, 0, 1e4)) return false;
      var l = lineOf(a.line);
      return !l || a.station < l.stations.length;
    }).map(function (a) { return { line: a.line, lap: a.lap, station: a.station }; });
    if (!Array.isArray(s.card.boxes)) s.card.boxes = [];
    s.card.boxes = s.card.boxes.filter(isDay).slice(0, CARD_BOXES - 1);
    if (!isInt(s.card.done, 0, 1e6)) s.card.done = 0;
    var o = s.owned;
    function list(v, ok) { return (Array.isArray(v) ? v : []).filter(function (x, i, a) { return ok(x) && a.indexOf(x) === i; }); }
    // Ids this script doesn't know (bought with a newer one) are kept as they are, only not drawn or sold here: an
    // older script on another card must never delete newer purchases.
    function str(x) { return typeof x === "string" && x.length > 0 && x.length <= 40; }
    o.models = list(o.models, str);
    if (o.models.indexOf("local") < 0) o.models.unshift("local");
    o.colors = list(o.colors, str);
    if (!isInt(o.cars, 0, MAX_CARS)) o.cars = Math.min(MAX_CARS, Math.max(0, Math.floor(Number(o.cars)) || 0));
    o.passengers = list(o.passengers, str);
    o.lines = list(o.lines, str);
    if (o.lines.indexOf("japan") < 0) o.lines.unshift("japan");
    o.lines.forEach(function (id) { if (lineOf(id) && !isObj(s.lines[id])) s.lines[id] = freshTrip(); });
    var t = s.train;
    if (o.models.indexOf(t.model) < 0) t.model = "local";
    if (t.color !== "" && o.colors.indexOf(t.color) < 0) t.color = "";
    if (!isInt(t.cars, 0, o.cars)) t.cars = Math.min(o.cars, Math.max(0, Math.floor(Number(t.cars)) || 0));
    if (!Array.isArray(t.seats)) t.seats = [];
    t.seats = t.seats.slice(0, 64).map(function (x, i, a) {
      return o.passengers.indexOf(x) >= 0 && a.indexOf(x) === i ? x : null;
    });
    return JSON.stringify(s) !== before;
  }

  /** Mend line id's trip in s.lines (a line this script knows). */
  function tidyTrip(s, id) {
    var l = lineOf(id), n = l.stations.length, t = s.lines[id];
    if (!isObj(t)) t = s.lines[id] = freshTrip();
    if (!isObj(t.pos)) t.pos = freshTrip().pos;
    if (!isObj(t.stamps)) t.stamps = {};
    var p = t.pos;
    if (!isInt(p.lap, 1, 1e6)) p.lap = 1;
    if (!isInt(p.station, 0, n - 1)) p.station = 0;
    if (!isInt(p.seg, MIN_SEG, MAX_SEG)) p.seg = DEFAULT_SEG;
    if (!isInt(p.step, 0, p.seg - 1)) p.step = 0;
    if (l.type !== "line" || (p.dir !== 1 && p.dir !== -1)) p.dir = 1;
    if (l.type === "line" && p.station === n - 1) p.dir = -1;      // at an end the train always heads back in
    if (l.type === "line" && p.station === 0) p.dir = 1;
    Object.keys(t.stamps).forEach(function (k) {
      if (!/^\d+$/.test(k) || +k >= n || !isInt(t.stamps[k], 1, 1e6)) delete t.stamps[k];
    });
    if (t.full !== undefined && t.full !== true) delete t.full;
  }

  // ---- lines: which runs, where it is ------------------------------------------------------------
  /** The id of the line the train runs on: s.line, or japan if s.line is one this script doesn't know. */
  function activeId(s) { return lineOf(s.line) && s.lines[s.line] ? s.line : "japan"; }
  /** The trip of line id (default: the active one). */
  function tripOf(s, id) { return s.lines[id || activeId(s)]; }
  /** The station the train heads for on line l from pos p. */
  function nextOf(l, p) {
    var n = l.stations.length;
    return l.type === "line" ? p.station + p.dir : (p.station + 1) % n;
  }
  /** The station before station i on line l when arriving in direction dir (for the bubble's line). */
  function prevOf(l, i, dir) { var n = l.stations.length; return l.type === "line" ? i - dir : (i + n - 1) % n; }
  /** The queued arrivals this script can show (an unknown line's stay queued, untouched). */
  function pending(s) { return s.queue.filter(function (a) { return !!lineOf(a.line); }); }
  /** Switch the train to line id (owned and known): のりかえ. The other line's trip stays where it was. A trip that
   *  hasn't left its first station yet takes its first segment from the pace now (day: default today), so a newly
   *  boarded line is as far between stations as the one the child came from. */
  function board(s, id, day) {
    if (s.locked || !lineOf(id) || s.owned.lines.indexOf(id) < 0) return false;
    if (!s.lines[id]) s.lines[id] = freshTrip();
    var p = s.lines[id].pos;
    if (p.lap === 1 && p.station === 0 && p.step === 0) p.seg = segLength(s, day || today());
    s.line = id;
    return true;
  }

  // ---- movement and rewards (pure: they change s, the caller saves) -----------------------------
  /** The next segment's length, fixed as it starts: the median of cards paid per study day over the last 7 study
   *  days before today (12 with no history), or the cards paid so far today if that is more, clamped to 6..2000.
   *  Today's count only ever raises it, so an unusual day (a first-ever 500-card day, a return after a long break,
   *  an erratic deck) can't race through the map: each station it passes makes the next one further away. */
  function segLength(s, day) {
    var counts = Object.keys(s.perDay).filter(function (d) { return isDay(d) && d < day && s.perDay[d] > 0; })
      .sort().slice(-7).map(function (d) { return s.perDay[d]; }).sort(function (a, b) { return a - b; });
    var m = counts.length, med = !m ? DEFAULT_SEG : m % 2 ? counts[(m - 1) / 2] : (counts[m / 2 - 1] + counts[m / 2]) / 2;
    med = Math.max(med, s.perDay[day] || 0);
    return Math.min(MAX_SEG, Math.max(MIN_SEG, Math.round(med)));
  }
  /** Study days among the 7 days ending with day (day included). */
  function studyK(s, day) {
    var n = dayNo(day);
    return s.days.filter(function (d) { var x = dayNo(d); return x <= n && x > n - 7; }).length;
  }
  /** The daily bonus steps: round(segment × k / 14). */
  function bonusFor(seg, k) { return Math.round(seg * k / 14); }
  /** Move the train on by steps; each station reached is queued (overshoot carries on, and each new segment's
   *  length is fixed as it starts). After 沖縄 the next lap starts at 北海道. Returns the arrivals. */
  function advance(s, steps, day) {
    var id = activeId(s), l = lineOf(id), p = tripOf(s, id).pos, n = l.stations.length, out = [];
    p.step += Math.max(0, Math.floor(steps) || 0);
    while (p.step >= p.seg) {
      p.step -= p.seg;
      var from = p.station, turn = false;
      if (l.type === "line") {
        // there and back: the end station is one arrival (one stamp, with the lap of the run that ends there),
        // then the train turns round and the next run is the next lap
        p.station += p.dir;
        var lap = p.lap;
        if (p.station === n - 1 || p.station === 0) { p.dir = -p.dir; p.lap++; turn = true; }
        s.queue.push({ line: id, lap: lap, station: p.station });
        out.push({ line: id, lap: lap, station: p.station, from: from, turn: turn });
      } else {
        p.station++;
        if (p.station >= n) { p.station = 0; p.lap++; }
        s.queue.push({ line: id, lap: p.lap, station: p.station });
        out.push({ line: id, lap: p.lap, station: p.station, from: from, turn: false });
      }
      p.seg = segLength(s, day);
    }
    return out;
  }
  /** Stamp one box of the stamp card for day. A full card pays +50 and brings the next special passenger, and
   *  a new card starts. Returns { full, special, boxes }. */
  function stampBox(s, day) {
    s.card.boxes.push(day);
    if (s.card.boxes.length < CARD_BOXES) return { full: false, boxes: s.card.boxes.length };
    s.card.done++;
    s.card.boxes = [];
    s.coins += CARD_COINS;
    var sp = SPECIALS[s.card.done - 1], special = null, seated = false;
    if (sp && s.owned.passengers.indexOf(sp[0]) < 0) {
      special = sp[0];
      s.owned.passengers.push(special);
      seated = autoSeat(s, special);
    }
    return { full: true, special: special, seated: seated, boxes: CARD_BOXES };
  }
  /** Forget what no longer matters: paid cards from before yesterday, per-day counts older than 30 days. */
  function prune(s, day) {
    var n = dayNo(day);
    Object.keys(s.paid).forEach(function (k) { if (!isDay(s.paid[k]) || dayNo(s.paid[k]) < n - 1) delete s.paid[k]; });
    Object.keys(s.perDay).forEach(function (k) { if (dayNo(k) <= n - 30) delete s.perDay[k]; });
  }
  /** A card's back was shown on day: pay it, once per card per day. The day's first card makes it a study day:
   *  daily bonus and a stamp-card box. Returns what happened for the bubble, or null if nothing paid. */
  function payCard(s, cardId, day) {
    if (!s || s.locked || cardId == null || cardId === "") return null;
    cardId = String(cardId);
    if (s.paid[cardId] === day) return null;
    var id = activeId(s), p = tripOf(s, id).pos;
    var ev = { day: day, line: id, first: false, k: 0, bonus: 0, steps: 1, card: null,
      from: { lap: p.lap, station: p.station, step: p.step, seg: p.seg, dir: p.dir }, arrivals: [] };
    s.paid[cardId] = day;
    s.perDay[day] = (s.perDay[day] || 0) + 1;
    if (s.days.indexOf(day) < 0) {
      s.days.push(day);
      s.days.sort();
      ev.first = true;
      ev.k = studyK(s, day);
      ev.bonus = bonusFor(p.seg, ev.k);
      ev.steps += ev.bonus;
      ev.card = stampBox(s, day);
    }
    ev.arrivals = advance(s, ev.steps, day);
    ev.to = { lap: p.lap, station: p.station, step: p.step, seg: p.seg, dir: p.dir };
    prune(s, day);
    return ev;
  }
  /** Press the oldest waiting stamp (of a line this script knows): it becomes the station's stamp on that line if
   *  its lap is the best yet, and pays +10. The first time every station of a line has a stamp: +100 more, once
   *  (full: true on the result and on the trip). */
  function pressStamp(s) {
    if (s.locked) return null;
    var k = -1;
    for (var i = 0; i < s.queue.length; i++) if (lineOf(s.queue[i].line)) { k = i; break; }
    if (k < 0) return null;
    var a = s.queue.splice(k, 1)[0], l = lineOf(a.line);
    if (!s.lines[a.line]) s.lines[a.line] = freshTrip();
    var t = s.lines[a.line], best = t.stamps[a.station] || 0, full = false;
    if (a.lap > best) t.stamps[a.station] = a.lap;
    s.coins += ARRIVAL_COINS;
    if (!t.full && Object.keys(t.stamps).length >= l.stations.length) { t.full = true; s.coins += FULL_COINS; full = true; }
    return { line: a.line, lap: a.lap, station: a.station, best: Math.max(best, a.lap), first: !best, full: full };
  }

  // ---- shop (pure) ------------------------------------------------------------------------------
  var LEAD_SEATS = { local: 3, tram: 3, mono: 4, sl: 1, shin: 4 };
  /** The model to draw for train t: its own, or the local train for a model this script doesn't know. */
  function drawn(t) { return LEAD_SEATS[t.model] ? t.model : "local"; }
  var CAR_SEATS = { local: 3, tram: 3, mono: 4, sl: 4, shin: 6 };
  /** Windows on the train as it is now: the lead car's, then each extra car's. */
  function windowsOf(t) { var m = drawn(t); return LEAD_SEATS[m] + t.cars * CAR_SEATS[m]; }
  /** Seat passenger e in the first empty window, if any (else it waits in the list). Whether it has a seat. */
  function autoSeat(s, e) {
    var t = s.train, n = windowsOf(t);
    if (t.seats.indexOf(e) >= 0) return true;
    for (var i = 0; i < n; i++) if (!t.seats[i]) { t.seats[i] = e; return true; }
    return false;
  }
  /** What an item costs. kind: line | model | color | car | pass. */
  function priceOf(kind, id) {
    if (kind === "line") return lineOf(id) ? lineOf(id).price : 0;
    if (kind === "model") return modelOf(id).price;
    if (kind === "color") return COLOR_PRICE;
    if (kind === "car") return CAR_PRICE;
    return PASSENGER_PRICE;
  }
  /** Whether s owns an item already (cars: all four bought). */
  function owns(s, kind, id) {
    var o = s.owned;
    if (kind === "model") return o.models.indexOf(id) >= 0;
    if (kind === "color") return id === "" || o.colors.indexOf(id) >= 0;
    if (kind === "car") return o.cars >= MAX_CARS;
    if (kind === "line") return o.lines.indexOf(id) >= 0;
    return o.passengers.indexOf(id) >= 0;
  }
  /** Buy an item and put it to use at once (a line: its trip is ready at its first station, that stamp waiting;
   *  boarding it is the child's choice, see board). Returns true if bought. Nothing owned is ever taken away. */
  function buy(s, kind, id) {
    if (s.locked || owns(s, kind, id)) return false;
    if (kind === "model" && !MODELS.some(function (m) { return m.id === id; })) return false;
    if (kind === "color" && !colorOf(id)) return false;
    if (kind === "pass" && !PASSENGERS.some(function (p) { return p[0] === id; })) return false;
    if (kind === "line" && (!lineOf(id) || id === "japan")) return false;
    var cost = priceOf(kind, id);
    if (s.coins < cost) return false;
    s.coins -= cost;
    var o = s.owned, t = s.train;
    if (kind === "model") { o.models.push(id); t.model = id; }
    else if (kind === "color") { o.colors.push(id); t.color = id; }
    else if (kind === "car") { o.cars++; t.cars = o.cars; }
    else if (kind === "line") {
      o.lines.push(id);
      if (!s.lines[id]) { s.lines[id] = freshTrip(); s.queue.push({ line: id, lap: 1, station: 0 }); }
    }
    else { o.passengers.push(id); autoSeat(s, id); }
    return true;
  }
  /** Use something owned: model id, colour id ("" = the model's own), or a number of extra cars. */
  function equip(s, kind, id) {
    if (s.locked) return false;
    var t = s.train;
    if (kind === "model" && owns(s, "model", id)) t.model = id;
    else if (kind === "color" && owns(s, "color", id)) t.color = id;
    else if (kind === "cars" && isInt(id, 0, s.owned.cars)) t.cars = id;
    else return false;
    return true;
  }
  /** Put passenger e (owned) in window i, moving it from any other window; e null empties window i. */
  function seat(s, i, e) {
    if (s.locked || !isInt(i, 0, 63)) return false;
    var t = s.train;
    if (e != null) {
      if (s.owned.passengers.indexOf(e) < 0) return false;
      var was = t.seats.indexOf(e);
      if (was >= 0) t.seats[was] = null;
    }
    while (t.seats.length < i) t.seats.push(null);
    t.seats[i] = e == null ? null : e;
    return true;
  }

  // ---- dev actions (pure; data-dev only) --------------------------------------------------------
  /** Add one study day before day (the latest one not yet a study day), stamping a box for it. */
  function devPastDay(s, day) {
    var n = dayNo(day) - 1;
    while (s.days.indexOf(dayOf(n)) >= 0) n--;
    var d = dayOf(n);
    s.days.push(d);
    s.days.sort();
    return stampBox(s, d);
  }
  /** Arrive at the next station now. */
  function devArrive(s, day) { var p = tripOf(s).pos; return advance(s, p.seg - p.step, day); }

  // ---- art: trains ------------------------------------------------------------------------------
  // Each car is an inline SVG side view facing right, wheels on y = h (the rail). The body uses the train's paint
  // (fill via the car's colours), with translucent light and shade on top so every paint looks rounded. Windows are
  // clipped, so a passenger emoji peeks out with its chin hidden under the sill.
  var uidN = 0;
  /** A unique id for clip paths (several trains can be on the page at once). */
  function uid() { return "dt-u" + (++uidN); }
  function rect(x, y, w, h, rx, fill, more) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (rx ? ' rx="' + rx + '"' : "") +
      ' fill="' + fill + '"' + (more || "") + "/>";
  }
  function path(d, fill, more) { return '<path d="' + d + '" fill="' + fill + '"' + (more || "") + "/>"; }
  function circ(x, y, r, fill, more) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"' + (more || "") + "/>"; }
  /** A wheel at (x, cy): the inner group spins (CSS .dt-wh) round its own centre. */
  function wheel(x, cy, r, rim) {
    var k = (r * 0.68).toFixed(1);
    return '<g transform="translate(' + x + " " + cy + ')"><g class="dt-wh">' + circ(0, 0, r, "#2a2c34") +
      circ(0, 0, (r * 0.74).toFixed(1), rim || "#7c818e") +
      '<path d="M-' + k + " 0H" + k + "M0 -" + k + "V" + k + '" stroke="#2a2c34" stroke-width="' + Math.max(1.2, r / 6).toFixed(1) + '"/>' +
      circ(0, 0, (r * 0.26).toFixed(1), "#2a2c34") + "</g></g>";
  }
  /** A window: glass, its passenger (emoji or none), a glint and the frame. */
  function win(x, y, w, h, rx, who) {
    var id = uid(), fs = Math.min(w * 0.92, h * 1.08);
    return '<clipPath id="' + id + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '"/></clipPath>' +
      rect(x, y, w, h, rx, "#bfe3f3") + rect(x, y, w, h * 0.42, rx, "#e6f6fc", ' opacity=".8"') +
      (who ? '<g clip-path="url(#' + id + ')"><text x="' + (x + w / 2) + '" y="' + (y + h + fs * 0.1).toFixed(1) +
        '" font-size="' + fs.toFixed(1) + '" text-anchor="middle" class="dt-who">' + who + "</text></g>" : "") +
      '<path d="M' + (x + 3) + " " + (y + h - 3) + "L" + (x + w * 0.42).toFixed(1) + " " + (y + 3) + '" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/>' +
      rect(x, y, w, h, rx, "none", ' stroke="#46505f" stroke-width="1.6"');
  }
  /** Dark glass (a driver's windscreen) with a glint. */
  function glass(d) {
    return path(d, "#25324a") + path(d, "none", ' stroke="#46505f" stroke-width="1.4"');
  }
  var SHADE = "#000", LIGHT = "#fff";
  /** A double door with its small windows. */
  function door(x, y, w, h) {
    return rect(x, y, w, h, 2, "none", ' stroke="#000" stroke-opacity=".25" stroke-width="1.4"') +
      '<path d="M' + (x + w / 2) + " " + y + "V" + (y + h) + '" stroke="#000" stroke-opacity=".2" stroke-width="1"/>' +
      rect(x + 3, y + 4, w / 2 - 4.5, 14, 2, "#bfe3f3", ' stroke="#46505f" stroke-width="1.2"') +
      rect(x + w / 2 + 1.5, y + 4, w / 2 - 4.5, 14, 2, "#bfe3f3", ' stroke="#46505f" stroke-width="1.2"');
  }
  function coupler(x, y) { return rect(x, y, 6, 5, 1, "#3b3f4a"); }

  /** Car drawings by model: lead(c) / car(c), c = { body, stripe, seats: [emoji|null] }. Each returns
   *  { w, h, svg }. seats are filled left to right in the order the windows are drawn. */
  var CARS = {
    local: {
      lead: function (c) {
        var s = c.seats;
        return { w: 178, h: 92, svg:
          rect(18, 76, 42, 6, 2, "#3b3f4a") + rect(116, 76, 42, 6, 2, "#3b3f4a") +
          wheel(28, 84, 8) + wheel(50, 84, 8) + wheel(126, 84, 8) + wheel(148, 84, 8) +
          rect(8, 72, 160, 6, 0, "#3b3f4a") + coupler(0, 64) +
          path("M10 20Q12 12 22 12H142Q152 12 156 20Z", "#a9b1bc") + rect(56, 6, 44, 7, 2, "#c7cdd5") +
          '<path d="M112 12L122 2L132 12M116 2H128" stroke="#4a4f5a" stroke-width="1.8" fill="none"/>' +
          path("M9 20H150Q171 20 173 42V70Q173 75 168 75H9Q4 75 4 70V25Q4 20 9 20Z", c.body) +
          rect(4, 63, 169, 12, 5, SHADE, ' opacity=".1"') + rect(8, 22, 140, 3, 1.5, LIGHT, ' opacity=".5"') +
          rect(4, 53, 169, 6, 0, c.stripe) + rect(4, 60, 169, 1.6, 0, c.stripe) +
          win(12, 28, 28, 20, 3, s[0]) + door(46, 25, 18, 47) + win(70, 28, 28, 20, 3, s[1]) + door(104, 25, 18, 47) +
          win(128, 28, 18, 20, 3, s[2]) + glass("M152 27H158Q168 28 169 42V48H152Z") +
          circ(166, 66, 3.2, "#ffe9a0", ' stroke="#c99f3a" stroke-width="1"') +
          path("M156 75L173 75L170 85L160 85Z", "#3b3f4a") };
      },
      car: function (c) {
        var s = c.seats;
        return { w: 166, h: 92, svg:
          rect(16, 76, 42, 6, 2, "#3b3f4a") + rect(108, 76, 42, 6, 2, "#3b3f4a") +
          wheel(26, 84, 8) + wheel(48, 84, 8) + wheel(118, 84, 8) + wheel(140, 84, 8) +
          rect(8, 72, 150, 6, 0, "#3b3f4a") + coupler(0, 64) + coupler(160, 64) +
          path("M8 20Q10 12 20 12H146Q156 12 158 20Z", "#a9b1bc") + rect(62, 6, 42, 7, 2, "#c7cdd5") +
          rect(4, 20, 158, 55, 5, c.body) + rect(4, 63, 158, 12, 5, SHADE, ' opacity=".1"') +
          rect(8, 22, 150, 3, 1.5, LIGHT, ' opacity=".5"') +
          rect(4, 53, 158, 6, 0, c.stripe) + rect(4, 60, 158, 1.6, 0, c.stripe) +
          win(12, 28, 28, 20, 3, s[0]) + door(46, 25, 18, 47) + win(69, 28, 28, 20, 3, s[1]) + door(103, 25, 18, 47) +
          win(127, 28, 28, 20, 3, s[2]) };
      }
    },
    tram: {
      lead: function (c) { return tram(c, true); },
      car: function (c) { return tram(c, false); }
    },
    mono: {
      lead: function (c) {
        var s = c.seats;
        return { w: 174, h: 92, svg:
          rect(14, 64, 142, 28, 6, c.body) + rect(14, 64, 142, 28, 6, SHADE, ' opacity=".2"') + coupler(0, 60) +
          path("M14 18H140C161 18 171 32 171 50V62Q171 70 163 70H12Q4 70 4 62V28Q4 18 14 18Z", c.body) +
          rect(6, 21, 130, 3, 1.5, LIGHT, ' opacity=".55"') + rect(4, 60, 167, 10, 4, SHADE, ' opacity=".08"') +
          path("M4 51H170V56H4Z", c.stripe) +
          win(14, 28, 24, 18, 6, s[0]) + win(44, 28, 24, 18, 6, s[1]) + win(74, 28, 24, 18, 6, s[2]) +
          win(104, 28, 24, 18, 6, s[3]) +
          glass("M138 22C157 23 167 34 168 46H138Q135 46 135 42V26Q135 22 138 22Z") +
          circ(165, 62, 3, "#ffe9a0", ' stroke="#c99f3a" stroke-width="1"') };
      },
      car: function (c) {
        var s = c.seats;
        return { w: 172, h: 92, svg:
          rect(14, 64, 144, 28, 6, c.body) + rect(14, 64, 144, 28, 6, SHADE, ' opacity=".2"') +
          coupler(0, 60) + coupler(166, 60) +
          path("M14 18H158Q168 18 168 28V62Q168 70 160 70H12Q4 70 4 62V28Q4 18 14 18Z", c.body) +
          rect(8, 21, 156, 3, 1.5, LIGHT, ' opacity=".55"') + rect(4, 60, 164, 10, 4, SHADE, ' opacity=".08"') +
          path("M4 51H168V56H4Z", c.stripe) +
          win(16, 28, 24, 18, 6, s[0]) + win(56, 28, 24, 18, 6, s[1]) + win(96, 28, 24, 18, 6, s[2]) +
          win(136, 28, 24, 18, 6, s[3]) };
      }
    },
    sl: {
      lead: function (c) {
        var s = c.seats, dark = "#25262c";
        return { w: 200, h: 100, svg:
          wheel(34, 91, 9, "#cf3a2c") + wheel(180, 92, 8, "#cf3a2c") +
          rect(58, 74, 128, 4, 0, dark) + rect(58, 78, 128, 2, 0, "#c8322a") +
          wheel(86, 86, 14, "#cf3a2c") + wheel(118, 86, 14, "#cf3a2c") + wheel(150, 86, 14, "#cf3a2c") +
          '<g class="dt-rod">' + rect(82, 84, 72, 4, 2, "#b9bec8", ' stroke="#6b707c" stroke-width=".8"') + "</g>" +
          rect(158, 76, 22, 12, 3, dark) + coupler(0, 66) +
          rect(6, 74, 56, 6, 0, dark) +
          rect(8, 26, 52, 50, 3, c.body) + rect(8, 64, 52, 12, 3, SHADE, ' opacity=".15"') +
          path("M3 28H65V22Q34 13 3 22Z", dark) + win(20, 34, 26, 20, 3, s[0]) +
          rect(60, 40, 112, 34, 7, c.body) + rect(62, 43, 108, 4, 2, LIGHT, ' opacity=".25"') +
          rect(60, 64, 112, 10, 5, SHADE, ' opacity=".18"') +
          rect(92, 40, 3, 34, 0, c.stripe) + rect(122, 40, 3, 34, 0, c.stripe) + rect(150, 40, 3, 34, 0, c.stripe) +
          path("M112 40Q112 28 124 28Q136 28 136 40Z", c.body) + rect(118, 25, 12, 4, 1.5, c.stripe) +
          rect(166, 37, 20, 39, 6, dark) + rect(182, 42, 6, 30, 3, "#3c3e46") +
          path("M166 38V22H161V15H181V22H176V38Z", dark) +
          circ(180, 31, 4, "#ffe9a0", ' stroke="#8a8f99" stroke-width="1.4"') +
          rect(182, 74, 14, 8, 1, "#c8322a") + path("M182 82L198 100H180Z", "#c8322a") +
          '<g class="dt-steam" transform="translate(171 13)">' +
          '<circle class="dt-puff" r="7" fill="#fff"/><circle class="dt-puff dt-p2" r="7" fill="#fff"/>' +
          '<circle class="dt-puff dt-p3" r="7" fill="#fff"/></g>' };
      },
      car: function (c) {
        var s = c.seats;
        return { w: 154, h: 92, svg:
          rect(10, 74, 134, 5, 0, "#2c2a2a") + coupler(0, 64) + coupler(148, 64) +
          wheel(28, 84, 8, "#cf3a2c") + wheel(48, 84, 8, "#cf3a2c") + wheel(106, 84, 8, "#cf3a2c") + wheel(126, 84, 8, "#cf3a2c") +
          rect(5, 26, 144, 48, 3, c.coach) + rect(5, 64, 144, 10, 3, SHADE, ' opacity=".15"') +
          path("M1 28Q77 13 153 28Z", "#2f2b2b") + rect(30, 13, 94, 8, 2, "#2f2b2b") +
          rect(5, 58, 144, 2.4, 0, "#e2b04a") +
          win(14, 33, 22, 18, 3, s[0]) + win(48, 33, 22, 18, 3, s[1]) + win(84, 33, 22, 18, 3, s[2]) +
          win(118, 33, 22, 18, 3, s[3]) };
      }
    },
    shin: {
      lead: function (c) {
        var s = c.seats;
        return { w: 244, h: 86, svg:
          wheel(30, 80, 6) + wheel(46, 80, 6) + wheel(168, 80, 6) + wheel(184, 80, 6) + coupler(0, 60) +
          path("M6 20H140C178 20 210 30 232 50C243 58 243 66 228 68L6 68Q2 68 2 64V26Q2 20 6 20Z", c.body) +
          rect(6, 22, 136, 3, 1.5, LIGHT, ' opacity=".6"') +
          path("M2 64H228Q236 70 226 75H8Q2 75 2 70Z", "#c3cad3") +
          path("M2 52H186C204 52 218 56 232 62L228 66C214 60 200 57 186 57H2Z", c.stripe) +
          '<path d="M2 60H190" stroke="' + c.stripe + '" stroke-width="1.3"/>' +
          glass("M166 30C184 31 200 38 210 46H170Q166 46 166 42Z") +
          win(20, 31, 20, 14, 3, s[0]) + win(52, 31, 20, 14, 3, s[1]) + win(84, 31, 20, 14, 3, s[2]) +
          win(116, 31, 20, 14, 3, s[3]) +
          '<ellipse cx="228" cy="60" rx="4" ry="2.2" fill="#fff6c8" stroke="#c99f3a" stroke-width=".8"/>' };
      },
      car: function (c) {
        var s = c.seats, out = "";
        for (var i = 0; i < 6; i++) out += win(14 + i * 30, 31, 18, 14, 3, s[i]);
        return { w: 206, h: 86, svg:
          wheel(26, 80, 6) + wheel(42, 80, 6) + wheel(162, 80, 6) + wheel(178, 80, 6) +
          coupler(0, 60) + coupler(200, 60) +
          '<path d="M92 20L102 9L112 20M96 9H108" stroke="#4a4f5a" stroke-width="1.6" fill="none"/>' +
          rect(2, 20, 202, 48, 7, c.body) + rect(6, 22, 194, 3, 1.5, LIGHT, ' opacity=".6"') +
          rect(2, 63, 202, 12, 5, "#c3cad3") + rect(2, 52, 202, 5, 0, c.stripe) + rect(2, 59.4, 202, 1.3, 0, c.stripe) +
          out };
      }
    }
  };
  /** The tram: cream upper body, painted lower, windscreens at both ends, a single-arm pantograph. */
  function tram(c, lead) {
    var s = c.seats;
    return { w: 142, h: 92, svg:
      wheel(32, 86, 6) + wheel(48, 86, 6) + wheel(94, 86, 6) + wheel(110, 86, 6) +
      rect(8, 72, 126, 10, 3, "#3b3f4a") + coupler(0, 62) + (lead ? "" : coupler(136, 62)) +
      path("M14 20Q20 12 30 12H112Q122 12 128 20Z", "#8e949e") +
      '<path d="M62 12L78 5L66 1M58 1H74" stroke="#4a4f5a" stroke-width="1.8" fill="none"/>' +
      path("M4 44H138V70Q138 76 132 76H10Q4 76 4 70Z", c.body) + rect(4, 66, 134, 10, 5, SHADE, ' opacity=".12"') +
      path("M4 44V30Q4 20 16 20H126Q138 20 138 30V44Z", c.stripe) + rect(8, 22, 126, 3, 1.5, LIGHT, ' opacity=".6"') +
      rect(4, 43, 134, 3, 0, "#fff", ' opacity=".9"') + rect(4, 46, 134, 2, 0, SHADE, ' opacity=".12"') +
      glass("M16 24Q7 25 6 32V42H16Z") + glass("M126 24Q135 25 136 32V42H126Z") +
      win(22, 25, 26, 16, 3, s[0]) + win(57, 25, 26, 16, 3, s[1]) + win(92, 25, 26, 16, 3, s[2]) +
      (lead ? circ(134, 60, 3.2, "#ffe9a0", ' stroke="#c99f3a" stroke-width="1"') + rect(48, 14, 44, 7, 2, "#2b2f3a") +
        '<text class="dt-trtxt" x="70" y="19.6" font-size="5.6" fill="#ffd36a" text-anchor="middle" font-weight="700">でんしゃ たび</text>' : "") };
  }

  /** The paint for a train: body colour, stripe (white once painted, so it shows on any paint), SL coach colour. */
  function paintOf(t) {
    var m = modelOf(drawn(t)), c = colorOf(t.color);
    return { body: c ? c.c : m.base, stripe: c && m.id !== "tram" && m.id !== "sl" ? "#ffffff" : m.stripe,
      coach: c ? c.c : "#8b4a2b" };
  }
  /** The train as HTML: its cars side by side (the lead car on the right), each an SVG at scale px per unit.
   *  opts.seats: false draws no passengers. */
  function trainHTML(t, scale, opts) {
    opts = opts || {};
    var m = drawn(t), draw = CARS[m], p = paintOf(t), L = LEAD_SEATS[m], C = CAR_SEATS[m];
    var seats = opts.seats === false ? [] : t.seats, out = [];
    function one(i) {
      var from = i === 0 ? 0 : L + (i - 1) * C, n = i === 0 ? L : C;
      var car = (i === 0 ? draw.lead : draw.car)({ body: p.body, stripe: p.stripe, coach: p.coach,
        seats: seats.slice(from, from + n) });
      return '<svg class="dt-car" viewBox="0 0 ' + car.w + " " + car.h + '" width="' + (car.w * scale).toFixed(1) +
        '" height="' + (car.h * scale).toFixed(1) + '" aria-hidden="true">' + car.svg + "</svg>";
    }
    for (var i = t.cars; i >= 0; i--) out.push(one(i));
    return out.join("");
  }

  // ---- art: stamps ------------------------------------------------------------------------------
  /** Ink filters, one per lap colour: the stamp is drawn black, then this turns it into slightly speckled,
   *  rough-edged ink of that colour (the emoji become ink silhouettes, as on a real eki stamp). */
  function inkDefs() {
    var inks = INKS.map(function (c, i) { return ["dt-ink" + (i + 1), c]; }).concat(LINES.filter(function (l) { return l.id !== "japan"; })
      .map(function (l) { return ["dt-ink-" + l.id, l.color]; }));
    return '<svg class="dt-defs" width="0" height="0" aria-hidden="true"><defs>' + inks.map(function (x, i) {
      var c = x[1];
      return '<filter id="' + x[0] + '" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="' + (3 + i) + '" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3.6 0 0 0 2.8" result="m"/>' +
        '<feFlood flood-color="' + c + '" flood-opacity=".93"/><feComposite in2="d" operator="in" result="c"/>' +
        '<feComposite in="c" in2="m" operator="in"/></filter>';
    }).join("") + "</defs></svg>";
  }
  /** A tilt for a stamp, the same every time for that station and lap: -7..7 degrees. */
  function tiltOf(i, lap) { return ((i * 37 + lap * 11 + 5) % 15) - 7; }
  /** A stamp's ink: on a bought line the first run is in the line's colour; after that (and on the japan trip)
   *  the lap's colour. Returns [filter id, colour]. */
  function inkFor(lineId, lap) {
    var l = lineOf(lineId);
    if (l && l.id !== "japan" && lap <= 1) return ["dt-ink-" + l.id, l.color];
    return ["dt-ink" + Math.min(Math.max(lap, 1), 5), inkOf(lap)];
  }
  /** A small train, for the stamps of stations without a souvenir. */
  var TRAIN_MARK = '<path fill-rule="evenodd" d="M30 24H66Q74 24 75 32L77 41H27V30Q27 24 30 24ZM32 28V34H40V28ZM44 28V34H52V28ZM56 28V34H64V28Z"/>' +
    '<circle cx="36" cy="43" r="2.6"/><circle cx="66" cy="43" r="2.6"/><path d="M24 46H80" stroke="#000" stroke-width="1.4"/>';
  /** An eki stamp of station i on line lineId: double ring, souvenir (or a train), station kanji and kana. */
  function stampSVG(lineId, i, lap) {
    var l = lineOf(lineId) || LINES[0], st = l.stations[i], k = st[0], kl = k.length, yl = st[1].length;
    var fs = kl <= 2 ? 21 : kl === 3 ? 17 : Math.min(16, 62 / kl), ks = Math.min(8.6, 52 / yl);
    return '<svg class="dt-stamp" viewBox="0 0 100 100" aria-hidden="true"><g filter="url(#' + inkFor(lineId, lap)[0] + ')">' +
      circ(50, 50, 46, "none", ' stroke="#000" stroke-width="4.4"') + circ(50, 50, 40.5, "none", ' stroke="#000" stroke-width="1.5"') +
      (st[2] ? '<text x="50" y="41" font-size="25" text-anchor="middle">' + st[2] + "</text>" : TRAIN_MARK) +
      '<path d="M24 47H76" stroke="#000" stroke-width="1.2" stroke-dasharray="2 2.4"/>' +
      '<text x="50" y="' + (kl > 2 ? 65 : 67) + '" font-size="' + fs.toFixed(1) + '" text-anchor="middle" font-weight="700" class="dt-sk">' + k + "</text>" +
      '<text x="50" y="80" font-size="' + ks.toFixed(1) + '" text-anchor="middle" font-weight="700">' + st[1] + "</text>" +
      '<text x="14" y="53" font-size="7" text-anchor="middle">★</text><text x="86" y="53" font-size="7" text-anchor="middle">★</text>' +
      "</g></svg>";
  }
  /** The wooden stamp handle that comes down for ポン！ */
  function hankoSVG(lap) {
    return '<svg viewBox="0 0 80 112" aria-hidden="true">' +
      '<ellipse cx="40" cy="18" rx="19" ry="15" fill="#d4955a"/><ellipse cx="34" cy="13" rx="7" ry="4" fill="#fff" opacity=".35"/>' +
      rect(30, 26, 20, 44, 7, "#bf7e43") + rect(33, 28, 4, 40, 2, "#fff", ' opacity=".2"') +
      rect(8, 66, 64, 20, 5, "#8d5a2c") + rect(8, 80, 64, 6, 2, "#000", ' opacity=".15"') +
      rect(6, 86, 68, 10, 2, inkOf(lap)) + "</svg>";
  }
  /** はなまる, the teacher's flower mark, for a stamped box on the stamp card. */
  function hanamaruSVG() {
    var petals = "", n = 8;
    for (var i = 0; i < n; i++) {
      var a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2, am = (a1 + a2) / 2;
      petals += "M" + (30 + 19 * Math.cos(a1)).toFixed(1) + " " + (30 + 19 * Math.sin(a1)).toFixed(1) +
        "Q" + (30 + 31 * Math.cos(am)).toFixed(1) + " " + (30 + 31 * Math.sin(am)).toFixed(1) + " " +
        (30 + 19 * Math.cos(a2)).toFixed(1) + " " + (30 + 19 * Math.sin(a2)).toFixed(1);
    }
    return '<svg viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="#e0453c" stroke-width="3" stroke-linecap="round">' +
      '<path d="M31 30C31 27.5 34.5 27.5 34.5 31C34.5 35.5 28 36.5 25.5 32C23 26.5 29.5 22 35.5 24.5C42 27.5 41 37.5 33 40C25.5 42 18.5 36 20 27.5"/>' +
      '<path d="' + petals + '"/></g></svg>';
  }
  /** The gold medal of ぜんえき せいは！ for line l: ribbons in the line's colour, a gold disc, a star. */
  function medalSVG(l) {
    return '<svg viewBox="0 0 120 150" aria-hidden="true"><defs><radialGradient id="dt-gold" cx=".38" cy=".32" r=".75">' +
      '<stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f7c53c"/><stop offset="1" stop-color="#c98a10"/></radialGradient></defs>' +
      path("M34 4H58L50 70H26Z", l.color, ' stroke="#2b3150" stroke-width="2.5" stroke-linejoin="round"') +
      path("M62 4H86L94 70H70Z", l.color, ' stroke="#2b3150" stroke-width="2.5" stroke-linejoin="round"') +
      path("M41 4H51L44 60H34Z", "#fff", ' opacity=".35"') +
      circ(60, 94, 44, "url(#dt-gold)", ' stroke="#2b3150" stroke-width="3"') + circ(60, 94, 35, "none", ' stroke="#c98a10" stroke-width="2.5"') +
      path("M60 68L67.6 84.6L85.7 86.4L72.1 98.6L76 116.4L60 107.2L44 116.4L47.9 98.6L34.3 86.4L52.4 84.6Z", "#fff6c8", ' stroke="#c98a10" stroke-width="2.4" stroke-linejoin="round"') +
      '<path d="M40 70Q48 60 60 58" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/></svg>';
  }
  /** A tiny sketch of line l for the shop: a ring for a loop, a line with dots otherwise. */
  function sketchSVG(l) {
    var c = l.color;
    if (l.type === "loop") return '<svg viewBox="0 0 60 44" aria-hidden="true"><rect x="8" y="6" width="44" height="32" rx="16" fill="none" stroke="' + c + '" stroke-width="5"/>' +
      [[8, 22], [52, 22], [30, 6], [30, 38], [16, 10], [44, 34]].map(function (q) { return circ(q[0], q[1], 3.2, "#fff", ' stroke="' + c + '" stroke-width="2"'); }).join("") + "</svg>";
    return '<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 32Q18 8 30 22T54 12" fill="none" stroke="' + c + '" stroke-width="5" stroke-linecap="round"/>' +
      [[6, 32], [18, 17], [30, 22], [42, 22], [54, 12]].map(function (q) { return circ(q[0], q[1], 3.2, "#fff", ' stroke="' + c + '" stroke-width="2"'); }).join("") + "</svg>";
  }
  /** A small plane (for the flight to 北海道 at the start of each lap). */
  function planeSVG() {
    return '<svg viewBox="0 0 120 50" aria-hidden="true">' +
      path("M10 26Q10 18 22 18H92Q114 18 116 26Q114 32 92 32H22Q10 32 10 26Z", "#fff", ' stroke="#2b3150" stroke-width="2.4"') +
      path("M48 24L70 2H80L66 24Z", "#e5484d", ' stroke="#2b3150" stroke-width="2.2" stroke-linejoin="round"') +
      path("M48 30L66 46H76L64 30Z", "#e5484d", ' stroke="#2b3150" stroke-width="2.2" stroke-linejoin="round"') +
      path("M12 22L4 6H14L26 19Z", "#3b8fd6", ' stroke="#2b3150" stroke-width="2.2" stroke-linejoin="round"') +
      [34, 44, 54, 74, 84].map(function (x) { return circ(x, 24, 2.6, "#7cc8ef"); }).join("") +
      path("M100 20Q110 21 112 26H100Z", "#25324a") + "</svg>";
  }

  // ---- art: scenery -----------------------------------------------------------------------------
  // Each region has four tiles that repeat sideways: far (slowest), mid, near (just behind the track) and fore
  // (in front of the track, below it). They are SVG backgrounds on layers wider than the screen by one tile and
  // slide by exactly one tile, so the loop is seamless. Objects near a tile's edge are drawn twice (wrapped).
  /** A deterministic pseudo-random sequence (the scenery is the same every time). */
  function rng(seed) { var x = seed; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
  function svgDoc(w, h, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + inner + "</svg>";
  }
  function dataURI(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  /** The height of a wave line at x: y0 minus a sum of sines, each [amplitude, waves per tile, phase]. */
  function waveY(w, y0, waves, x) {
    var y = y0;
    waves.forEach(function (v) { y -= v[0] * (0.5 + 0.5 * Math.sin(2 * Math.PI * v[1] * x / w + v[2])); });
    return y;
  }
  /** Rolling hills down to the tile's bottom (h), seamless across the tile's edges. */
  function hills(w, h, y0, waves, fill, more) {
    var d = "M0 " + h;
    for (var x = 0; x <= w; x += 8) d += "L" + x + " " + waveY(w, y0, waves, x).toFixed(1);
    return path(d + "L" + w + " " + h + "Z", fill, more);
  }
  /** Draw fn(x) at x, and again a tile away if the thing (half width hw) crosses an edge. */
  function wrap(x, hw, w, fn) {
    var out = fn(x);
    if (x + hw > w) out += fn(x - w);
    if (x - hw < 0) out += fn(x + w);
    return out;
  }
  /** A mountain: rounded peak at x, height ht above the base by, half width hw; snow caps it if snow is set. */
  function peak(x, by, hw, ht, fill, snow, shade) {
    var top = by - ht, d = "M" + (x - hw) + " " + by + "L" + (x - hw * 0.12) + " " + (top + ht * 0.06) +
      "Q" + x + " " + (top - ht * 0.02) + " " + (x + hw * 0.12) + " " + (top + ht * 0.06) + "L" + (x + hw) + " " + by + "Z";
    var out = path(d, fill);
    if (shade) out += path("M" + x + " " + (top + 1) + "L" + (x + hw * 0.12) + " " + (top + ht * 0.06) + "L" + (x + hw) + " " + by +
      "L" + (x + hw * 0.25) + " " + by + "Z", shade);
    if (snow) {
      var sy = top + ht * 0.3, sx = hw * 0.3;
      out += path("M" + (x - hw * 0.12) + " " + (top + ht * 0.06) + "Q" + x + " " + (top - ht * 0.02) + " " + (x + hw * 0.12) + " " + (top + ht * 0.06) +
        "L" + (x + sx) + " " + sy + "L" + (x + sx * 0.5) + " " + (sy - 6) + "L" + (x + sx * 0.1) + " " + (sy + 3) + "L" + (x - sx * 0.35) + " " + (sy - 5) +
        "L" + (x - sx) + " " + sy + "Z", snow);
    }
    return out;
  }
  function trunk(x, by, w, h, c) { return rect((x - w / 2).toFixed(1), (by - h).toFixed(1), w, h, w / 3, c || "#8a5a36"); }
  /** A pine (three tiers), snow-capped in 北海道. */
  function pine(x, by, s, col, snow) {
    var out = trunk(x, by, 3 * s, 7 * s);
    for (var i = 0; i < 3; i++) {
      var b = by - (5 + 8 * i) * s, ww = (13 - 3 * i) * s, t = b - 15 * s;
      out += path("M" + (x - ww) + " " + b + "L" + x + " " + t + "L" + (x + ww) + " " + b + "Z", col);
      if (snow) out += path("M" + (x - ww * 0.5) + " " + (t + 7.5 * s) + "L" + x + " " + t + "L" + (x + ww * 0.5) + " " + (t + 7.5 * s) +
        "L" + (x + ww * 0.2) + " " + (t + 6 * s) + "L" + x + " " + (t + 8 * s) + "L" + (x - ww * 0.2) + " " + (t + 6 * s) + "Z", "#fff");
    }
    return out;
  }
  /** A tall narrow cedar. */
  function cedar(x, by, s, col) {
    return trunk(x, by, 3 * s, 8 * s) + path("M" + x + " " + (by - 46 * s) + "Q" + (x + 10 * s) + " " + (by - 20 * s) + " " + (x + 8 * s) + " " + (by - 7 * s) +
      "H" + (x - 8 * s) + "Q" + (x - 10 * s) + " " + (by - 20 * s) + " " + x + " " + (by - 46 * s) + "Z", col);
  }
  /** A round tree; fruit (a colour) dots it: apples, mikan, autumn colours. */
  function tree(x, by, s, leaf, fruit, seed) {
    var out = trunk(x, by, 4 * s, 12 * s) + circ(x - 7 * s, by - 17 * s, 9 * s, leaf) + circ(x + 7 * s, by - 17 * s, 9 * s, leaf) +
      circ(x, by - 25 * s, 11 * s, leaf) + circ(x - 4 * s, by - 29 * s, 4 * s, "#fff", ' opacity=".18"');
    if (fruit) {
      var r = rng(seed || 7);
      for (var i = 0; i < 6; i++) out += circ((x + (r() - 0.5) * 22 * s).toFixed(1), (by - 14 * s - r() * 18 * s).toFixed(1), (1.9 * s).toFixed(1), fruit);
    }
    return out;
  }
  /** A palm tree leaning a little. */
  function palm(x, by, s) {
    var tx = x + 8 * s, ty = by - 48 * s, out = '<path d="M' + x + " " + by + "Q" + (x - 2 * s) + " " + (by - 26 * s) + " " + tx + " " + ty +
      '" stroke="#9a6a3f" stroke-width="' + (4.5 * s) + '" fill="none" stroke-linecap="round"/>';
    [[-26, 4], [-16, -10], [0, -14], [16, -9], [26, 6]].forEach(function (f) {
      out += path("M" + tx + " " + ty + "Q" + (tx + f[0] * 0.6 * s) + " " + (ty + f[1] * s - 10 * s) + " " + (tx + f[0] * s) + " " + (ty + f[1] * s + 4 * s) +
        "Q" + (tx + f[0] * 0.5 * s) + " " + (ty + f[1] * 0.4 * s - 2 * s) + " " + tx + " " + ty + "Z", "#2f9a52");
    });
    return out + circ(tx - 2 * s, ty + 2 * s, 2.5 * s, "#7a5230") + circ(tx + 2 * s, ty + 3 * s, 2.5 * s, "#7a5230");
  }
  /** A little house with a gable roof. */
  function house(x, by, s, wall, roof) {
    var w = 26 * s, h = 16 * s;
    return rect(x - w / 2, by - h, w, h, 1, wall) + path("M" + (x - w / 2 - 4 * s) + " " + (by - h) + "L" + x + " " + (by - h - 12 * s) + "L" + (x + w / 2 + 4 * s) + " " + (by - h) + "Z", roof) +
      rect(x - 8 * s, by - h + 4 * s, 6 * s, 5 * s, 1, "#fff3c4") + rect(x + 3 * s, by - 9 * s, 5 * s, 9 * s, 1, "#7a5230");
  }
  /** A utility pole with cross arm; wires sag to the next pole (poles at both tile edges keep it seamless). */
  function poles(w, by, every, h) {
    var out = "";
    for (var x = 0; x <= w; x += every) {
      out += rect(x - 2, by - h, 4, h, 1, "#7d6a5a") + rect(x - 10, by - h + 6, 20, 3, 1, "#6a5848");
      if (x + every <= w) out += '<path d="M' + (x + 8) + " " + (by - h + 7) + "Q" + (x + every / 2) + " " + (by - h + 20) + " " + (x + every - 8) + " " + (by - h + 7) +
        "M" + (x - 8 + 0) + " " + (by - h + 7) + '" stroke="#5b4c40" stroke-width="1" fill="none" opacity=".7"/>' +
        '<path d="M' + (x - 8 + every) + " " + (by - h + 7) + "Q" + (x + every / 2) + " " + (by - h + 22) + " " + (x + 8) + " " + (by - h + 7) +
        '" stroke="#5b4c40" stroke-width="1" fill="none" opacity=".5"/>';
    }
    return out;
  }
  /** Flowers and tufts scattered along the top of the fore tile. */
  function tufts(w, seed, grass, flowers) {
    var r = rng(seed), out = "";
    for (var i = 0; i < 26; i++) {
      var x = (i + r() * 0.8) * w / 26, y = 14 + r() * 70;
      out += path("M" + (x - 5).toFixed(1) + " " + y.toFixed(1) + "Q" + (x - 4).toFixed(1) + " " + (y - 8).toFixed(1) + " " + x.toFixed(1) + " " + (y - 11).toFixed(1) +
        "Q" + (x + 1).toFixed(1) + " " + (y - 5).toFixed(1) + " " + (x + 5).toFixed(1) + " " + y.toFixed(1) + "Z", grass);
      if (flowers && r() < 0.55) {
        var c = flowers[Math.floor(r() * flowers.length)], fx = x + 8, fy = y - 4;
        out += circ(fx.toFixed(1), (fy - 3).toFixed(1), 2.4, c) + circ((fx - 3).toFixed(1), fy.toFixed(1), 2.4, c) + circ((fx + 3).toFixed(1), fy.toFixed(1), 2.4, c) +
          circ(fx.toFixed(1), (fy + 3).toFixed(1), 2.4, c) + circ(fx.toFixed(1), fy.toFixed(1), 1.6, "#ffd84a");
      }
    }
    return out;
  }
  /** A sea band from y to the bottom, with little white wave marks. */
  function sea(w, h, y, c, c2, seed) {
    var r = rng(seed), out = rect(0, y, w, h - y, 0, c) + rect(0, y, w, 3, 0, c2);
    for (var i = 0; i < 14; i++) {
      var x = r() * (w - 20) + 10, yy = y + 8 + r() * (h - y - 14);
      out += '<path d="M' + x.toFixed(1) + " " + yy.toFixed(1) + "q4 -3 8 0q4 3 8 0" + '" stroke="#fff" stroke-width="1.4" fill="none" opacity=".55"/>';
    }
    return out;
  }
  /** A sailing boat. */
  function boat(x, by, s, sail) {
    return path("M" + (x - 14 * s) + " " + (by - 6 * s) + "H" + (x + 14 * s) + "L" + (x + 9 * s) + " " + by + "H" + (x - 9 * s) + "Z", "#c8463b") +
      rect(x - 0.8 * s, by - 30 * s, 1.6 * s, 24 * s, 0, "#6b5a4a") +
      path("M" + (x + 1 * s) + " " + (by - 29 * s) + "L" + (x + 13 * s) + " " + (by - 9 * s) + "H" + (x + 1 * s) + "Z", sail || "#fff");
  }
  /** Puffy clouds for the sky layer. */
  function cloud(x, y, s) {
    return '<g opacity=".95">' + circ(x, y, 14 * s, "#fff") + circ(x + 16 * s, y - 8 * s, 17 * s, "#fff") + circ(x + 34 * s, y, 13 * s, "#fff") +
      rect(x - 2 * s, y - 2 * s, 40 * s, 15 * s, 7 * s, "#fff") + rect(x, y + 8 * s, 34 * s, 3 * s, 1.5 * s, "#d9e9f3") + "</g>";
  }

  /** The scenery of each region: sky colours, ground colour, and its tiles { w, h, svg }. */
  var SCENES = {
    hokkaido: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(11);
      far += hills(720, 300, 250, [[30, 2, 0.4], [16, 5, 1]], "#dbe6f1");
      [[110, 150, 160], [330, 190, 215], [560, 150, 170], [690, 110, 120]].forEach(function (p) {
        far += wrap(p[0], p[1], 720, function (x) { return peak(x, 300, p[1], p[2], "#b9cde3", "#fff", "#a8bfd8"); });
      });
      mid += hills(600, 200, 120, [[34, 1, 0.3], [16, 3, 1.1]], "#f3f8fc") + hills(600, 200, 160, [[20, 2, 2.1], [10, 5, 0.2]], "#e6eff7");
      for (var i = 0; i < 16; i++) { var x = 20 + i * 36 + r() * 14; mid += pine(x, waveY(600, 160, [[20, 2, 2.1], [10, 5, 0.2]], x) + 6, 0.8 + r() * 0.4, "#3c6e5c", true); }
      mid += rect(405, 124, 44, 34, 1, "#c8443a") + path("M400 126L414 106H440L454 126Z", "#5a3b33") + path("M418 158V138H436V158Z", "#fff") +
        '<path d="M418 138L436 158M436 138L418 158" stroke="#c8443a" stroke-width="2"/>' + rect(456, 100, 16, 58, 7, "#d9dde2") + path("M456 104Q464 92 472 104Z", "#8c939c");
      near += rect(0, 104, 480, 16, 0, "#f4f8fb") + poles(480, 110, 240, 92);
      [[40, 1.25], [90, 0.95], [190, 1.4], [350, 1.1], [420, 1.3], [455, 0.9]].forEach(function (p) { near += pine(p[0], 110, p[1], "#2f6250", true); });
      near += circ(280, 98, 10, "#fff", ' stroke="#c9d8e6"') + circ(280, 82, 7.5, "#fff", ' stroke="#c9d8e6"') + rect(274, 70, 12, 6, 1, "#3a3a48") + rect(271, 75, 18, 2, 1, "#3a3a48") +
        circ(277.5, 81, 1, "#2b2b33") + circ(282.5, 81, 1, "#2b2b33") + path("M280 83L286 84.5L280 85Z", "#f08a2c") + rect(273, 88, 14, 2.5, 1, "#e5484d");
      for (var j = 0; j < 10; j++) fore += '<ellipse cx="' + (24 + j * 48 + r() * 16).toFixed(0) + '" cy="' + (26 + r() * 50).toFixed(0) + '" rx="' + (14 + r() * 12).toFixed(0) + '" ry="5" fill="#dce8f3"/>';
      fore += tufts(480, 5, "#8fb3a3", null);
      return { fb: "#dbe6f1", mb: "#e6eff7", sky: ["#a9d4f2", "#eef7fc"], ground: "#f4f8fb", snow: true, far: far, mid: mid, near: near, fore: fore };
    },
    tohoku: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(21);
      [[120, 220, 150], [400, 260, 175], [640, 180, 130]].forEach(function (p) {
        far += wrap(p[0], p[1], 720, function (x) { return peak(x, 300, p[1], p[2], "#86ad9f", null, "#77a092"); });
      });
      far += hills(720, 300, 262, [[18, 3, 0.5], [10, 7, 2]], "#9cc4a4");
      var w1 = [[30, 1, 0.8], [14, 3, 0.2]];
      mid += hills(600, 200, 118, w1, "#a6d27f") + hills(600, 200, 158, [[16, 2, 1.7]], "#8cc66c");
      for (var i = 0; i < 13; i++) { var x = 26 + i * 44; if (x > 430 && x < 520) continue; mid += tree(x, waveY(600, 158, [[16, 2, 1.7]], x) + 8, 0.72, "#4f9a48", "#e5413b", i + 3); }
      mid += path("M440 160V136H500V160Z", "#e9dcc0") + path("M430 138L470 108L510 138Z", "#8a6a43") + path("M447 120L470 103L493 120Z", "#6f5434") + rect(462, 144, 12, 16, 1, "#6a4a2c");
      near += rect(0, 104, 480, 16, 0, "#79b85a") + poles(480, 110, 240, 92);
      [[60, 1.2], [150, 1.0], [330, 1.25], [410, 1.05]].forEach(function (p, k) { near += tree(p[0], 110, p[1], "#3f8c3f", "#e5413b", k + 9); });
      near += rect(237, 74, 3, 36, 1, "#8a6a43") + rect(225, 82, 28, 3, 1, "#8a6a43") + circ(238.5, 70, 6, "#f3d9a8") + path("M228 68H249L238.5 58Z", "#d8b25a") +
        path("M232 84H245L247 100H230Z", "#4a7cc4") + circ(236, 70, 0.9, "#333") + circ(241, 70, 0.9, "#333");
      for (var j = 0; j < 6; j++) fore += rect(-4 + j * 82, 18 + (j % 2) * 6, 76, 40, 6, j % 2 ? "#91cf6f" : "#a3d97d") +
        '<path d="M' + (4 + j * 82) + " " + (30 + (j % 2) * 6) + "h60M" + (4 + j * 82) + " " + (42 + (j % 2) * 6) + 'h60" stroke="#6aa94c" stroke-width="2" stroke-dasharray="3 5"/>' +
        rect(8 + j * 82, 50 + (j % 2) * 6, 30, 2, 1, "#d8f2ff", ' opacity=".8"');
      fore += tufts(480, 6, "#5f9f45", ["#fff"]);
      return { fb: "#9cc4a4", mb: "#8cc66c", sky: ["#86c9ef", "#e4f4fb"], ground: "#86c463", far: far, mid: mid, near: near, fore: fore };
    },
    kanto: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(31);
      for (var x = 0; x < 720; x += 24 + Math.floor(r() * 16)) { var h = 60 + r() * 120; far += rect(x, 300 - h, 22 + r() * 12, h, 1, r() < 0.5 ? "#bccbe0" : "#c8d5e6"); }
      far += rect(0, 288, 720, 12, 0, "#c8d5e6");
      var cols = ["#f3dcc0", "#cfe0ee", "#f6c7a6", "#d9d2ec", "#c7e3d2", "#f1e6a8"];
      for (var bx = 6; bx < 560; bx += 40 + Math.floor(r() * 18)) {
        if (bx > 250 && bx < 350) continue;
        var bh = 50 + r() * 100, bw = 34 + r() * 10, c = cols[Math.floor(r() * cols.length)], wins = "";
        for (var wy = 200 - bh + 8; wy < 186; wy += 12) for (var wx = bx + 5; wx < bx + bw - 8; wx += 9) wins += rect(wx.toFixed(1), wy.toFixed(1), 5, 7, 1, "#8fb3d1", ' opacity=".75"');
        mid += rect(bx, 200 - bh, bw, bh, 2, c) + rect(bx, 200 - bh, bw, 4, 1, "#000", ' opacity=".08"') + wins;
      }
      // 東京タワー
      var tx = 300, tb = 200;
      mid += path("M" + (tx - 26) + " " + tb + "L" + (tx - 4) + " " + (tb - 170) + "H" + (tx + 4) + "L" + (tx + 26) + " " + tb + "H" + (tx + 16) + "L" + tx + " " + (tb - 60) + "L" + (tx - 16) + " " + tb + "Z", "#ea5a2b") +
        rect(tx - 15, tb - 70, 30, 10, 2, "#ea5a2b") + rect(tx - 15, tb - 64, 30, 3, 0, "#fff") + rect(tx - 9, tb - 124, 18, 8, 2, "#ea5a2b") + rect(tx - 9, tb - 120, 18, 2.4, 0, "#fff") +
        rect(tx - 13, tb - 40, 26, 3, 0, "#fff") + rect(tx - 7, tb - 100, 14, 3, 0, "#fff") + rect(tx - 4.5, tb - 150, 9, 3, 0, "#fff") + rect(tx - 1, tb - 192, 2, 24, 0, "#ea5a2b") +
        '<path d="M' + (tx - 22) + " " + tb + "L" + tx + " " + (tb - 34) + "L" + (tx + 22) + " " + tb + '" stroke="#c94a20" stroke-width="1.5" fill="none"/>';
      near += rect(0, 104, 480, 16, 0, "#86c167") + poles(480, 110, 240, 92);
      [[50, "#f6efe1", "#4a74b8"], [130, "#fbe3c8", "#c9503f"], [320, "#e9f0f6", "#5b6b7a"], [400, "#fff1d6", "#3f8c5a"]].forEach(function (p) { near += house(p[0], 110, 1.3, p[1], p[2]); });
      near += tree(200, 110, 1.1, "#4b9a4a") + tree(450, 110, 0.9, "#4b9a4a") + tree(270, 110, 0.8, "#5aa858");
      fore += tufts(480, 7, "#5ea548", ["#ffd84a", "#fff", "#f37cab"]);
      return { fb: "#c8d5e6", mb: "#a6c98e", sky: ["#83c4ee", "#e0f1fa"], ground: "#8cc76b", far: far, mid: mid, near: near, fore: fore };
    },
    chubu: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(41);
      far += wrap(120, 160, 720, function (x) { return peak(x, 300, 160, 120, "#9fb4d8", "#fff", "#91a7cd"); });
      far += wrap(620, 150, 720, function (x) { return peak(x, 300, 150, 110, "#9fb4d8", "#fff", "#91a7cd"); });
      // 富士山: wide and gentle, with its snow cap
      far += path("M110 300C220 250 300 120 340 72Q360 62 380 72C420 120 500 250 610 300Z", "#6f8fc8") +
        path("M340 72Q360 62 380 72L410 112L396 106L384 118L370 104L356 118L342 105L326 113Z", "#fff") +
        path("M380 72C420 120 500 250 610 300H520C470 230 420 140 380 72Z", "#6684bf", ' opacity=".55"');
      var hw = [[26, 1, 2.2], [14, 3, 0.4]];
      mid += hills(600, 200, 116, hw, "#79b56c");
      for (var row = 0; row < 4; row++) for (var x = 10; x < 600; x += 26) {
        var y = waveY(600, 116, hw, x) + 12 + row * 13;
        mid += rect(x, y.toFixed(1), 22, 8, 4, row % 2 ? "#4f9450" : "#5ea35a");
      }
      mid += hills(600, 200, 176, [[10, 2, 1]], "#6aa85c");
      near += rect(0, 104, 480, 16, 0, "#78b65c") + poles(480, 110, 240, 92);
      [[30, 1.1], [62, 1.4], [92, 1.0], [300, 1.3], [336, 1.05], [440, 1.25]].forEach(function (p) { near += cedar(p[0], 110, p[1], "#356f48"); });
      near += house(190, 110, 1.3, "#efe6d2", "#4b4f5c");
      fore += tufts(480, 8, "#4f9a40", ["#f37cab", "#fff"]);
      return { fb: "#8fa9d2", mb: "#6aa85c", sky: ["#74b9ee", "#dbeffa"], ground: "#7cba5f", far: far, mid: mid, near: near, fore: fore };
    },
    kinki: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(51);
      far += hills(720, 300, 190, [[40, 2, 0.9], [18, 5, 2]], "#d6b2b8") + hills(720, 300, 236, [[26, 3, 0.1], [10, 7, 1]], "#c49aa9");
      var hw = [[24, 1, 1.4], [12, 3, 0.5]];
      mid += hills(600, 200, 150, hw, "#c3b06a");
      for (var i = 0; i < 12; i++) { var x = 16 + i * 50 + r() * 10; if ((x > 130 && x < 230) || (x > 380 && x < 500)) continue;
        mid += tree(x, waveY(600, 150, hw, x) + 10, 0.75 + r() * 0.3, ["#e2552d", "#f08a2c", "#f1b52f"][i % 3]); }
      // 五重塔 (pagoda)
      var px = 180, pb = waveY(600, 150, hw, 180) + 8;
      mid += rect(px - 1, pb - 172, 2, 30, 0, "#a68a3a");
      for (var t = 0; t < 5; t++) {
        var y = pb - 18 - t * 26, ww = 30 - t * 3.6;
        mid += rect(px - ww * 0.55, y - 2, ww * 1.1, 20, 0, "#c4473a") + rect(px - ww * 0.42, y + 4, ww * 0.84, 7, 0, "#f3e3c3", ' opacity=".5"') +
          path("M" + (px - ww - 8) + " " + (y + 1) + "Q" + (px - ww) + " " + (y - 3) + " " + (px - ww * 0.6) + " " + (y - 8) + "H" + (px + ww * 0.6) + "Q" + (px + ww) + " " + (y - 3) + " " + (px + ww + 8) + " " + (y + 1) + "Z", "#4c3a3a");
      }
      // a temple hall
      var hx = 440, hb = waveY(600, 150, hw, 440) + 8;
      mid += rect(hx - 42, hb - 30, 84, 30, 0, "#f2e6cf") + [-30, -12, 6, 24].map(function (d) { return rect(hx + d, hb - 30, 5, 30, 0, "#c4473a"); }).join("") +
        path("M" + (hx - 64) + " " + (hb - 28) + "Q" + (hx - 50) + " " + (hb - 34) + " " + (hx - 42) + " " + (hb - 52) + "H" + (hx + 42) + "Q" + (hx + 50) + " " + (hb - 34) + " " + (hx + 64) + " " + (hb - 28) + "Z", "#4c3a3a") +
        rect(hx - 30, hb - 60, 60, 8, 2, "#5e4848");
      near += rect(0, 104, 480, 16, 0, "#b9bf6a") + poles(480, 110, 240, 92);
      // a row of torii, as at 伏見稲荷
      [70, 118, 166].forEach(function (x, k) {
        var s = 1.15 - k * 0.12, by = 110;
        near += rect(x - 16 * s, by - 46 * s, 4.5 * s, 46 * s, 0, "#e0412f") + rect(x + 11.5 * s, by - 46 * s, 4.5 * s, 46 * s, 0, "#e0412f") +
          rect(x - 19 * s, by - 38 * s, 38 * s, 4 * s, 0, "#e0412f") + path("M" + (x - 26 * s) + " " + (by - 46 * s) + "Q" + x + " " + (by - 50 * s) + " " + (x + 26 * s) + " " + (by - 46 * s) +
          "L" + (x + 24 * s) + " " + (by - 52 * s) + "Q" + x + " " + (by - 56 * s) + " " + (x - 24 * s) + " " + (by - 52 * s) + "Z", "#2b2a30") +
          rect(x - 22 * s, by - 50 * s, 44 * s, 4 * s, 0, "#e0412f") + rect(x - 16 * s, by - 6 * s, 4.5 * s, 6 * s, 0, "#2b2a30") + rect(x + 11.5 * s, by - 6 * s, 4.5 * s, 6 * s, 0, "#2b2a30");
      });
      near += tree(290, 110, 1.15, "#e2552d") + tree(370, 110, 0.95, "#f1b52f") + tree(440, 110, 1.2, "#f08a2c");
      for (var j = 0; j < 30; j++) fore += '<ellipse cx="' + (r() * 480).toFixed(0) + '" cy="' + (10 + r() * 80).toFixed(0) + '" rx="3" ry="1.8" fill="' + ["#e2552d", "#f08a2c", "#f1b52f"][j % 3] + '"/>';
      fore += tufts(480, 9, "#8a9a4a", null);
      return { fb: "#c49aa9", mb: "#c3b06a", sky: ["#f5b98a", "#fde9d2"], ground: "#bcc26c", sun: "#ffdf8a", far: far, mid: mid, near: near, fore: fore };
    },
    chugoku: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(61);
      far += sea(720, 300, 232, "#5aaedb", "#8fd0ee", 3);
      [[90, 70, 34], [250, 46, 22], [420, 90, 40], [600, 56, 28]].forEach(function (p) {
        far += wrap(p[0], p[1], 720, function (x) { return path("M" + (x - p[1]) + " 236Q" + (x - p[1] * 0.5) + " " + (236 - p[2]) + " " + x + " " + (236 - p[2]) + "Q" + (x + p[1] * 0.5) + " " + (236 - p[2]) + " " + (x + p[1]) + " 236Z", "#6fa47a"); });
      });
      mid += sea(600, 200, 150, "#3e98cc", "#6fbde3", 5);
      mid += boat(120, 176, 1.1) + boat(330, 186, 0.8, "#ffe08a");
      mid += path("M450 200Q456 160 480 152Q510 150 520 200Z", "#8a8f96") + rect(476, 96, 14, 58, 2, "#fff") + rect(476, 112, 14, 8, 0, "#e5484d") +
        rect(476, 132, 14, 8, 0, "#e5484d") + path("M472 96L483 84L494 96Z", "#e5484d") + rect(478, 88, 10, 8, 1, "#ffe9a0");
      near += rect(0, 100, 480, 20, 0, "#e8d39c");
      [[30, 92, 40], [210, 88, 60], [400, 94, 34]].forEach(function (p) { near += path("M" + (p[0] - p[2]) + " 104Q" + p[0] + " " + (p[1] - 18) + " " + (p[0] + p[2]) + " 104Z", "#8f949b"); });
      // black pines, bent by the sea wind
      [[90, 1.2], [300, 1.0], [440, 1.15]].forEach(function (p) {
        var x = p[0], s = p[1];
        near += '<path d="M' + x + " 104Q" + (x + 6 * s) + " " + (104 - 24 * s) + " " + (x - 6 * s) + " " + (104 - 46 * s) + '" stroke="#6b4a32" stroke-width="' + 4 * s + '" fill="none"/>' +
          [[-6, -48, 22], [8, -36, 18], [-14, -30, 14]].map(function (c) { return '<ellipse cx="' + (x + c[0] * s) + '" cy="' + (104 + c[1] * s) + '" rx="' + c[2] * s + '" ry="' + 6 * s + '" fill="#2f5d45"/>'; }).join("");
      });
      fore += tufts(480, 10, "#b9a36a", null);
      for (var j = 0; j < 8; j++) fore += path("M" + (30 + j * 60) + " " + (30 + (j % 3) * 18) + "q4 -6 8 0z", "#f3c6c0");
      return { fb: "#5aaedb", mb: "#3e98cc", sky: ["#6cc1ea", "#d6f1f9"], ground: "#ecdcaa", far: far, mid: mid, near: near, fore: fore };
    },
    shikoku: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(71);
      far += sea(720, 300, 214, "#5ab2dd", "#92d3f0", 4);
      far += path("M40 220Q90 196 150 220Z", "#7cb08a") + path("M600 222Q650 200 700 222Z", "#7cb08a");
      // 瀬戸大橋: two towers, a deck and hanging cables
      var cab = '<path d="M0 196Q90 200 180 70Q360 200 540 70Q630 200 720 196" stroke="#e7ecf2" stroke-width="2.4" fill="none"/>';
      far += rect(0, 196, 720, 7, 1, "#e7ecf2") + rect(0, 203, 720, 3, 0, "#8aa0b4") + cab;
      [180, 540].forEach(function (x) { far += rect(x - 9, 60, 5, 156, 1, "#f4f7fa") + rect(x + 4, 60, 5, 156, 1, "#f4f7fa") + rect(x - 9, 84, 18, 4, 0, "#f4f7fa") + rect(x - 9, 130, 18, 4, 0, "#f4f7fa"); });
      for (var k = 0; k < 720; k += 24) {
        var cy = k < 180 ? 196 - (196 - 70) * Math.pow(k / 180, 2) * 0.9 : k < 540 ? 70 + 130 * (1 - Math.pow((k - 360) / 180, 2)) * 0.97 : 196 - (196 - 70) * Math.pow((720 - k) / 180, 2) * 0.9;
        if (cy < 194) far += rect(k, cy.toFixed(1), 1, (196 - cy).toFixed(1), 0, "#dfe6ee");
      }
      var hw = [[30, 1, 0.2], [14, 3, 1.3]];
      mid += hills(600, 200, 118, hw, "#7cbf62");
      for (var row = 0; row < 3; row++) for (var x = 14 + row * 12; x < 600; x += 34) {
        var y = waveY(600, 118, hw, x) + 26 + row * 22;
        mid += circ(x, y.toFixed(1), 9, "#3f8a3e") + circ(x - 3, y - 3, 1.8, "#f39a1e") + circ(x + 3, y + 1, 1.8, "#f39a1e") + circ(x + 1, y - 5, 1.6, "#f39a1e");
      }
      near += rect(0, 104, 480, 16, 0, "#80bd5f") + poles(480, 110, 240, 92);
      [[40, 1.15], [110, 0.95], [300, 1.2], [370, 1.0]].forEach(function (p, k2) { near += tree(p[0], 110, p[1], "#3a843a", "#f39a1e", k2 + 20); });
      near += house(200, 110, 1.3, "#f6efe1", "#5b6b7a") + house(440, 110, 1.1, "#fff1d6", "#c9503f");
      fore += tufts(480, 11, "#4f9a40", ["#fff", "#ffd84a"]);
      return { fb: "#5ab2dd", mb: "#7cbf62", sky: ["#88cbf1", "#e6f6fc"], ground: "#86bf63", far: far, mid: mid, near: near, fore: fore };
    },
    kyushu: function () {
      var far = "", mid = "", near = "", fore = "", r = rng(81);
      far += sea(720, 300, 226, "#36b9cf", "#8fe0ea", 6);
      // 桜島, with its smoke
      far += path("M300 230C350 200 380 130 410 112H450C476 132 506 200 560 230Z", "#7a7891") + path("M410 112H450L458 122H402Z", "#6b6982") +
        path("M450 112C476 132 506 200 560 230H520C490 196 466 140 450 112Z", "#6b6982", ' opacity=".5"');
      [[432, 92, 14], [446, 72, 18], [470, 52, 22], [500, 36, 20]].forEach(function (c) { far += circ(c[0], c[1], c[2], "#eceaf0", ' opacity=".9"'); });
      far += path("M40 232Q80 214 130 232Z", "#58a868") + path("M640 232Q680 218 716 232Z", "#58a868");
      var hw = [[22, 1, 0.7], [10, 3, 2.2]];
      mid += sea(600, 200, 150, "#4fd0d8", "#9be8ec", 7) + hills(600, 200, 148, hw, "#74c06a");
      // a house with a red-tiled roof (沖縄), and palms
      mid += rect(240, 128, 52, 26, 1, "#f6efe1") + path("M232 130L248 114H284L300 130Z", "#d9583c") + rect(256, 138, 10, 16, 1, "#7a5230") + circ(266, 112, 3.5, "#e1b562");
      [[60, 0.9], [130, 1.05], [380, 0.95], [520, 1.1]].forEach(function (p) { mid += palm(p[0], waveY(600, 148, hw, p[0]) + 6, p[1]); });
      near += rect(0, 104, 480, 16, 0, "#e3d6a4") + poles(480, 110, 240, 92);
      [[60, 1.3], [210, 1.1], [420, 1.35]].forEach(function (p) { near += palm(p[0], 110, p[1]); });
      [[130, 1], [300, 1.2], [360, 0.9]].forEach(function (p) {
        var x = p[0], s = p[1];
        near += circ(x - 8 * s, 104, 10 * s, "#2f8a4a") + circ(x + 8 * s, 104, 10 * s, "#2f8a4a") + circ(x, 97, 12 * s, "#37975a") +
          [[-8, 100], [4, 94], [10, 104], [-2, 104]].map(function (f) { return circ(x + f[0] * s, f[1], 3.2 * s, "#e8384f") + circ(x + f[0] * s, f[1], 1, "#ffd84a"); }).join("");
      });
      for (var j = 0; j < 6; j++) {
        var sx = 40 + j * 80 + r() * 20, sy = 30 + r() * 50;
        fore += path("M" + sx + " " + (sy - 7) + "L" + (sx + 2) + " " + (sy - 2) + "L" + (sx + 7) + " " + (sy - 2) + "L" + (sx + 3) + " " + (sy + 2) + "L" + (sx + 5) + " " + (sy + 7) +
          "L" + sx + " " + (sy + 4) + "L" + (sx - 5) + " " + (sy + 7) + "L" + (sx - 3) + " " + (sy + 2) + "L" + (sx - 7) + " " + (sy - 2) + "L" + (sx - 2) + " " + (sy - 2) + "Z", j % 2 ? "#f08a5a" : "#f4b23f");
      }
      fore += tufts(480, 12, "#9dbb6a", null);
      return { fb: "#36b9cf", mb: "#74c06a", sky: ["#58bfe9", "#c8f0f5"], ground: "#ece1b3", far: far, mid: mid, near: near, fore: fore };
    }
  };
  var TILE = { far: [720, 300], mid: [600, 200], near: [480, 120], fore: [480, 120] };
  var sceneCache = {};
  /** A region's scenery as CSS background images (worked out once per region per opening). */
  function sceneOf(id) {
    if (sceneCache[id]) return sceneCache[id];
    var sc = SCENES[id](), out = { sky: sc.sky, ground: sc.ground, snow: !!sc.snow, sun: sc.sun || "#fff6c2", fb: sc.fb, mb: sc.mb };
    // the far and mid tiles stand on a strip of their base colour, which a plain band below them continues down to
    // the track (they sit higher than the train, so the horizon shows above it)
    sc.far += rect(0, 294, 720, 6, 0, sc.fb);
    sc.mid += rect(0, 194, 600, 6, 0, sc.mb);
    Object.keys(TILE).forEach(function (k) { out[k] = dataURI(svgDoc(TILE[k][0], TILE[k][1], sc[k])); });
    return (sceneCache[id] = out);
  }
  var CLOUDS = dataURI(svgDoc(900, 170, cloud(60, 60, 1.2) + cloud(330, 110, 0.8) + cloud(560, 44, 1) + cloud(780, 120, 0.7)));
  var SNOW = (function () {
    var r = rng(5), out = "";
    for (var i = 0; i < 40; i++) out += circ((r() * 300).toFixed(0), (r() * 300).toFixed(0), (1.2 + r() * 2.2).toFixed(1), "#fff", ' opacity=".9"');
    return dataURI(svgDoc(300, 300, out));
  })();

  // ---- DOM helpers ------------------------------------------------------------------------------
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function htmlEl(tag, cls, h) { var n = el(tag, cls); n.innerHTML = h; return n; }
  /** A button (≥44 px by the CSS) with label HTML and a tap handler. */
  function btn(cls, label, fn) {
    var b = el("button", "dt-btn" + (cls ? " " + cls : ""));
    b.type = "button";
    b.innerHTML = label;
    b.addEventListener("click", function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(e); });
    return b;
  }
  function ruby(k, kana) { return "<ruby>" + k + "<rt>" + kana + "</rt></ruby>"; }
  function reduced() { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  /** Station i's kana on line l (default: the japan trip). */
  function kanaOf(i, l) { return (l || LINES[0]).stations[i][1]; }
  /** The colour a line shows in (japan: its station's region colour). */
  function colorOn(l, i) { return l.type === "japan" ? regionOf(i).color : l.color; }
  /** The lead car alone, small, without passengers (chip, bubble, map marker, shop rows). */
  function miniTrain(t, scale) { return trainHTML({ model: t.model, color: t.color, cars: 0, seats: [] }, scale, { seats: false }); }
  /** The train's width in drawing units (to fit it on screen). */
  function trainUnits(t) {
    var d = CARS[drawn(t)], c = { body: "", stripe: "", coach: "", seats: [] };
    return d.lead(c).w + t.cars * (d.car(c).w - 3);
  }

  // ---- the card back: chip and bubble -----------------------------------------------------------
  /** Mount the game on a slot: pay this card (once a day), show the chip and, if it paid, the bubble.
   *  Returns the context (tests use it). */
  function mount(slot) {
    if (!slot || slot.dtMounted) return null;
    slot.dtMounted = true;
    injectStyle();
    var data = slot.dataset || {}, dev = data.dev === "1";
    shift = dev ? devShift() : 0;
    var rs = readSave(), s = rs.s;
    /** The one-line note instead of the chip: storage off/blocked, or (full) storage full, with a line for parents. */
    function note(full) {
      var n = el("div", "dt-note" + (full ? " dt-full" : ""), full ? T.full : T.noStorage);
      if (full) n.append(el("div", "dt-noteparent", T.fullParent));
      slot.append(n);
      return { s: s, slot: slot, note: true };
    }
    if (s.nostore) return note();
    var ctx = { s: s, raw: rs.raw, slot: slot, dev: dev, chip: null, game: null, ev: null };
    // the card id: data-card="{{CardID}}", or on desktop the one the add-on gives (for Anki without {{CardID}})
    var card = data.card;
    if (!(card != null && /^\d+$/.test(String(card))) && DESK && /^\d+$/.test(String(DESK.card))) card = String(DESK.card);
    if (card != null && /^\d+$/.test(String(card)) && !s.locked) {
      ctx.ev = payCard(s, String(card), today());
      if (ctx.ev) {
        var w = save(s);
        if (!w) return note(saveFull);     // the payment couldn't be stored: say what to fix rather than celebrate it
        ctx.raw = w;
      }
    }
    ctx.chip = el("button", "dt-chip");
    ctx.chip.type = "button";
    ctx.chip.setAttribute("aria-label", T.title);
    ctx.chip.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (!ctx.s.locked) openGame(ctx);
    });
    renderChip(ctx);
    slot.append(ctx.chip);
    if (ctx.ev) showBubble(ctx, ctx.ev);
    return ctx;
  }
  /** The chip: a tiny train and 「あと N」, or 「🚉 N」 with stamps waiting, or the locked note. */
  function renderChip(ctx) {
    var s = ctx.s, b = ctx.chip;
    if (!b) return;
    if (s.locked) { b.classList.add("dt-chip-lock"); b.innerHTML = '<span class="dt-chiptxt">' + T.locked + "</span>"; return; }
    var q = pending(s).length, p = tripOf(s).pos;
    var lbl = q ? "🚉 " + q : T.left(p.seg - p.step);
    b.classList.toggle("dt-chip-wait", !!q);
    b.innerHTML = '<span class="dt-chiptrain">' + miniTrain(s.train, 0.2) + '</span><span class="dt-chiptxt">' + lbl + "</span>";
  }
  /** The bubble over the chip after a card pays: the train slides a notch along current → next station; the day's
   *  first card adds the stamp card and bonus line; an arrival says so. It shrinks into the chip after ~2.5 s. */
  function showBubble(ctx, ev) {
    var s = ctx.s, a = ev.arrivals, last = a[a.length - 1], l = lineOf(ev.line), from, to, f0, f1;
    if (last) { to = last.station; from = last.from; f0 = a.length > 1 ? 0 : ev.from.step / ev.from.seg; f1 = 1; }
    else { from = ev.from.station; to = nextOf(l, ev.from); f0 = ev.from.step / ev.from.seg; f1 = ev.to.step / ev.to.seg; }
    var b = el("div", "dt-bubble" + (last ? " dt-barr" : ""));
    b.style.setProperty("--lc", colorOn(l, to));
    if (l.type !== "japan") b.append(htmlEl("div", "dt-bln", "<i></i>" + l.name));
    var line = el("div", "dt-bline"), track = el("span", "dt-btrack"), dot2 = el("i", "dt-bdot dt-bdot2");
    track.append(el("i", "dt-bdot"), el("i", "dt-bfill"), dot2, htmlEl("span", "dt-btrain", miniTrain(s.train, 0.13)));
    track.style.setProperty("--f", f0.toFixed(3));
    line.append(el("span", "dt-bst", kanaOf(from, l)), track, el("span", "dt-bst", kanaOf(to, l)));
    b.append(line);
    if (last) {
      b.append(el("div", "dt-bbig", T.arrived(kanaOf(to, l))), el("div", "dt-bsmall", T.goStamp + (a.length > 1 ? " " + T.more(a.length - 1) : "")));
      if (last.turn) b.append(el("div", "dt-bsmall dt-bturn", "🔁 おりかえし！"));
    } else {
      b.append(htmlEl("div", "dt-bbig", "あと <b>" + (ev.to.seg - ev.to.step) + "</b>"), el("div", "dt-bsmall", T.next(kanaOf(to, l))));
    }
    if (ev.first) b.append(el("div", "dt-bday", T.daily(ev.k)));
    if (ev.card && ev.card.full) {
      b.append(el("div", "dt-bday dt-bfull", T.cardFull));
      if (ev.card.special) b.append(el("div", "dt-bday dt-bfull", (ev.card.seated ? T.special : T.specialList)(ev.card.special)));
    }
    b.addEventListener("click", function (e) { if (e && e.stopPropagation) e.stopPropagation(); b.remove(); if (!s.locked) openGame(ctx); });
    ctx.slot.append(b);
    var still = reduced();
    g.setTimeout(function () { track.style.setProperty("--f", f1.toFixed(3)); if (last) dot2.classList.add("dt-bping"); }, still ? 0 : 450);
    g.setTimeout(function () { b.classList.add("dt-bout"); }, 2700);
    g.setTimeout(function () {
      b.remove();
      if (ctx.chip) { ctx.chip.classList.remove("dt-bump"); ctx.chip.classList.add("dt-bump"); }
    }, 3150);
  }

  // ---- the game ---------------------------------------------------------------------------------
  /** Open the game full screen over the card. Everything inside saves at once on every change. */
  function openGame(ctx) {
    if (ctx.game) return;
    var s = ctx.s, timers = [], phase = null, busy = false, region = null, run = 0;   // run: stamps pressed this opening
    var root = el("div", "dt-root"), docEl = doc.documentElement;
    root.id = "dt-game";
    ctx.game = root;
    docEl.classList.add("dt-open");
    root.append(htmlEl("div", "dt-defs-box", inkDefs()));

    /** setTimeout that close() clears. */
    function later(fn, ms) { var t = g.setTimeout(fn, ms); timers.push(t); return t; }
    /** The next step of a sequence: runs after ms, or at once when the child taps (skip). */
    function next(fn, ms) { phase = { fn: fn, t: later(function () { phase = null; fn(); }, ms) }; }
    function skip() { if (!phase) return; var p = phase; phase = null; g.clearTimeout(p.t); p.fn(true); }
    /** Redraw everything that shows the save. */
    function redraw(train) { renderTop(); renderSign(); renderWeek(); renderChip(ctx); if (train) renderTrain(); }
    /** Every change goes through here: take the newest save (syncIn), change it with fn, write it at once. If it
     *  can't be written, undo the change (so nothing looks bought that isn't) and say so. fn returning false
     *  means nothing changed. Returns whether it changed and was saved. */
    function act(fn, train) {
      if (!syncIn(ctx)) { toast(T.saveFail()); return false; }
      var before = JSON.stringify(s);
      if (fn() === false) { redraw(train); return false; }
      var w = save(s);
      if (!w) { replaceSave(s, JSON.parse(before)); redraw(true); toast(T.saveFail()); return false; }
      ctx.raw = w;
      redraw(train);
      return true;
    }

    // -- the scene: sky, parallax layers, track, train, ground
    var scene = el("div", "dt-scene"), sky = el("div", "dt-sky"), sun = el("div", "dt-sun");
    var clouds = el("div", "dt-layer dt-clouds"), snow = el("div", "dt-snow");
    var far = el("div", "dt-layer dt-far"), mid = el("div", "dt-layer dt-mid"), near = el("div", "dt-layer dt-near");
    var farBase = el("div", "dt-base dt-farbase"), midBase = el("div", "dt-base dt-midbase");
    var stn = el("div", "dt-stn"), track = el("div", "dt-track"), beam = el("div", "dt-beam");
    var trainBox = el("div", "dt-trainbox"), pf = el("div", "dt-pf"), ground = el("div", "dt-ground");
    var fore = el("div", "dt-layer dt-fore"), pillars = el("div", "dt-layer dt-pillars");
    clouds.style.backgroundImage = CLOUDS;
    snow.style.backgroundImage = SNOW;
    track.append(el("div", "dt-layer dt-sleepers"), el("div", "dt-rail"));
    ground.append(pillars, fore);
    scene.append(sky, sun, clouds, far, farBase, mid, midBase, near, snow, stn, beam, track, trainBox, pf, ground);
    root.append(scene);

    /** Show the scenery for station i of line lineId (default: the active line), with a short fade when it changes. */
    function setRegion(i, lineId) {
      var key = sceneKeyOf(lineOf(lineId || activeId(s)), i);
      if (region === key) return;
      var first = region == null;
      region = key;
      var sc = sceneOf(key);
      function apply() {
        sky.style.background = "linear-gradient(" + sc.sky[0] + "," + sc.sky[1] + " 75%)";
        sun.style.setProperty("--sun", sc.sun);
        far.style.backgroundImage = sc.far; mid.style.backgroundImage = sc.mid; near.style.backgroundImage = sc.near;
        fore.style.backgroundImage = sc.fore; ground.style.background = sc.ground;
        farBase.style.background = sc.fb; midBase.style.background = sc.mb;
        snow.hidden = !sc.snow;
      }
      if (first || reduced()) { apply(); return; }
      scene.classList.add("dt-dim");
      later(function () { apply(); scene.classList.remove("dt-dim"); }, 380);
    }
    /** Draw the train (model, paint, cars, passengers), scaled for the screen. */
    function renderTrain() {
      var h = root.clientHeight || g.innerHeight || 740, w = root.clientWidth || g.innerWidth || 360;
      var sc = Math.max(0.72, Math.min(1.25, (w > h && h <= 500 ? h / 420 : h / 620)));
      trainBox.innerHTML = '<div class="dt-train">' + trainHTML(s.train, sc) + "</div>";
      root.classList.toggle("dt-mono", drawn(s.train) === "mono");
      // on its way back along a there-and-back line the train faces (and the world scrolls) the other way
      root.classList.toggle("dt-back", lineOf(activeId(s)).type === "line" && tripOf(s).pos.dir < 0);
    }

    // -- the UI over the scene: one flex column (top bar, sign, progress, room for the train, the week strip), so
    // nothing can overlap whatever the text size (AnkiDroid scales text with the phone's font size and card zoom)
    var ui = el("div", "dt-ui");
    root.append(ui);
    // -- the top bar: coins, then buttons
    var top = el("div", "dt-top"), stat = el("div", "dt-stat");
    var coinsEl = el("span", "dt-coins");
    // stamps waiting (e.g. a line bought for later): a button to press them now
    var waitBtn = btn("dt-tb dt-waitbtn", "", function () { playArrivals(); });
    stat.append(coinsEl);
    top.append(stat, waitBtn);     // on a narrow phone with big text, the buttons wrap to a second row rather than clip
    if (ctx.dev) top.append(btn("dt-tb dt-gear", "⚙", openDev));
    top.append(btn("dt-tb", "📖<small>スタンプ</small>", function () { openBook("stamps"); }),
      btn("dt-tb", "🏪<small>おみせ</small>", function () { openShop(); }),
      btn("dt-tb dt-x", "✕<small>とじる</small>", close));
    ui.append(top);
    function renderTop() {
      coinsEl.innerHTML = "🪙 <b>" + s.coins + "</b>";
      var q = pending(s).length;
      waitBtn.innerHTML = "🚉<small>" + q + "こ</small>";
      waitBtn.hidden = !q || busy;
    }
    function bumpCoins() { coinsEl.classList.remove("dt-bump"); later(function () { coinsEl.classList.add("dt-bump"); }, 10); }

    // -- the station sign (駅名標) and the progress bar
    var hud = el("div", "dt-hud"), sign = el("div", "dt-sign"), prog = el("div", "dt-prog");
    hud.append(sign, htmlEl("div", "dt-legs", "<i></i><i></i>"), prog);
    ui.append(hud, el("div", "dt-room"));
    /** The sign for station i of line lineId (default: the active line's next station); at: the lap of the stop
     *  when the train is standing there. Like a real 駅名標 it names both neighbours (none past a terminus). */
    function renderSign(i, at, lineId) {
      if (busy && i == null) return;
      var l = lineOf(lineId || activeId(s)), p = tripOf(s, l.id).pos, n = l.stations.length, loop = l.type !== "line";
      if (i == null) i = nextOf(l, p);
      var st = l.stations[i], prev = i > 0 ? i - 1 : loop ? n - 1 : -1, nx = i < n - 1 ? i + 1 : loop ? 0 : -1;
      var plane = l.type === "japan", yl = st[1].length;
      sign.style.setProperty("--rc", colorOn(l, i));
      sign.classList.toggle("dt-signlong", yl > 5);     // a long name gets its own row under the number and lap
      sign.innerHTML = '<span class="dt-sno">' + (i + 1) + '</span><span class="dt-slap">' + T.lap(at ? at : p.lap) + "</span>" +
        '<div class="dt-sbig' + (yl > 8 ? " dt-xlong" : yl > 5 ? " dt-long" : "") + '">' + st[1] + "</div>" + '<div class="dt-skan">' + ruby(st[0], st[1]) + "</div>" +
        '<div class="dt-sband">' + (plane ? regionOf(i).name : l.yomi) + '</div><div class="dt-snav"><span>' +
        (prev < 0 ? "" : "← " + (plane && i === 0 ? "✈️ " : "") + kanaOf(prev, l)) + "</span><span>" +
        (nx < 0 ? "" : kanaOf(nx, l) + (plane && nx === 0 ? " ✈️" : "") + " →") + "</span></div>";
      var left = p.seg - p.step;
      prog.classList.toggle("dt-here", !!at);
      if (at) { prog.innerHTML = '<span class="dt-pleft">とうちゃく！</span>'; return; }
      var f = p.step / p.seg;
      prog.style.setProperty("--lc", l.type === "japan" ? "var(--dt-green)" : l.color);
      prog.innerHTML = '<span class="dt-pleft">あと <b>' + left + '</b></span><span class="dt-ptrack' + (p.seg <= 40 ? " dt-notch" : "") +
        '" style="--n:' + p.seg + '"><i class="dt-pfill" style="transform:scaleX(' + f.toFixed(3) + ')"></i>' +
        '<span class="dt-ptrain" style="left:calc(' + (f * 100).toFixed(1) + '% - 14px)">' + miniTrain(s.train, 0.16) + "</span></span>" +
        '<span class="dt-pnext">' + st[1] + "</span>";
    }
    // -- the week strip: the stamp card's progress, the daily bonus and the last 7 days (study days filled), all
    // about study days; tapping it opens the stamp card
    var week = el("button", "dt-week");
    week.type = "button";
    week.addEventListener("click", function (e) { e.stopPropagation(); if (!busy) openCard(); });
    ui.append(week);
    function renderWeek() {
      var t = today(), n = dayNo(t), dots = "";
      for (var d = n - 6; d <= n; d++) {
        var day = dayOf(d), on = s.days.indexOf(day) >= 0, wd = "日月火水木金土".charAt(new Date(d * 864e5).getUTCDay());
        dots += '<span class="dt-wd' + (on ? " dt-won" : "") + (d === n ? " dt-wtoday" : "") + '"><i>' + (on ? "★" : "") + "</i>" + wd + "</span>";
      }
      week.innerHTML = '<span class="dt-wrow"><span class="dt-wcard">📮 <b>' + s.card.boxes.length + "</b>/" + CARD_BOXES + "</span>" +
        '<span class="dt-wlbl">まいにち ボーナス <b>×' + Math.max(1, studyK(s, t)) + '</b></span></span><span class="dt-wdots">' + dots + "</span>";
    }

    // -- arrivals: the platform slides in, the stamp comes down (ポン！), the souvenir pops out
    /** Play every waiting arrival, one at a time. */
    function playArrivals() {
      var q = pending(s);
      if (busy || !q.length) return;
      busy = true;
      root.classList.add("dt-busy");
      renderTop();
      var a = q[0];
      if (a.line === "japan" && a.station === 0) fly(function () { arrive(a); });
      else arrive(a);
    }
    /** ひこうきで ほっかいどうへ！ — a plane crosses the sky (each lap of the japan trip starts at 北海道). */
    function fly(then) {
      var f = el("div", "dt-flyer");
      f.append(htmlEl("div", "dt-plane", planeSVG()), el("div", "dt-flytxt", "ひこうきで ほっかいどうへ！"));
      root.append(f);
      next(function () { f.remove(); then(); }, reduced() ? 1400 : 2600);
    }
    /** Whether arrival a is at the end of a there-and-back line, where the train turns round (not the start). */
    function turnsAt(a) {
      var l = lineOf(a.line);
      return l.type === "line" && (a.station === l.stations.length - 1 || (a.station === 0 && a.lap > 1));
    }
    /** Pull into station a.station of line a.line, then stamp. */
    function arrive(a) {
      setRegion(a.station, a.line);
      var l = lineOf(a.line), st = l.stations[a.station];
      stn.style.setProperty("--rc", colorOn(l, a.station));
      stn.innerHTML = '<div class="dt-roof"><span class="dt-board">' + st[1] + " えき</span></div>" +
        '<i class="dt-pillar" style="left:6%"></i><i class="dt-pillar" style="left:36%"></i><i class="dt-pillar" style="left:66%"></i><i class="dt-pillar" style="left:94%"></i>' +
        '<span class="dt-bench"></span>';
      renderSign(a.station, a.lap, a.line);
      scene.classList.remove("dt-leaving", "dt-at");
      scene.classList.add("dt-arriving");
      next(function () { scene.classList.remove("dt-arriving"); scene.classList.add("dt-at", "dt-stopped"); stampTime(a); }, reduced() ? 500 : 1700);
    }
    /** The stamp paper: hanko down, ポン！, the stamp (pressed and saved here), souvenir, ＋10, then a button. At the
     *  end of a there-and-back line it says おりかえし; a line's first full set of stamps brings the fanfare. */
    function stampTime(a) {
      var l = lineOf(a.line), st = l.stations[a.station], lap = a.lap, tilt = tiltOf(a.station, lap), turn = turnsAt(a);
      var wrapEl = el("div", "dt-arr"), paper = el("div", "dt-sheet"), pad = el("div", "dt-pad");
      var big = htmlEl("div", "dt-bigst", stampSVG(a.line, a.station, lap)), gift = el("div", "dt-gift"), coin = el("div", "dt-coinup", "＋10 🪙");
      var fulls = [];       // lines whose every station now has a stamp (their fanfare waits for the button)
      pad.style.setProperty("--tilt", tilt + "deg");
      pad.style.setProperty("--ink", inkFor(a.line, lap)[1]);
      pad.append(el("i", "dt-ring"), el("i", "dt-inkspread"), big, htmlEl("div", "dt-hanko", hankoSVG(lap)), el("span", "dt-pon", "ポン！"));
      gift.innerHTML = st[2] ? '<span class="dt-gemoji">' + st[2] + '</span><span class="dt-gtxt"><small>おみやげ</small><br>' + st[3] + "</span>"
        : '<span class="dt-gemoji">🚉</span><span class="dt-gtxt"><small>' + l.yomi + "</small><br>えき スタンプ ゲット！</span>";
      var go = btn("dt-go dt-primary", pending(s).length > 1 ? "つぎの スタンプ ▶" : turn ? "おりかえし！ 🔁" : "しゅっぱつ！ 🚃", function () { cheer(done); });
      var all = btn("dt-go dt-all", "", pressAll);
      go.hidden = true;
      all.hidden = true;
      paper.style.setProperty("--lc", colorOn(l, a.station));
      paper.append(l.type === "japan" ? el("span", "dt-none") : htmlEl("div", "dt-aline", "<i></i>" + ruby(l.name, l.yomi)),
        htmlEl("div", "dt-ah", ruby(st[0], st[1]) + " に とうちゃく！"),
        el("div", "dt-asub", (lap > 1 ? T.lap(lap) + " の スタンプ" : "えき スタンプ") + (turn ? " ・ 🔁 おりかえし" : "")), pad, gift, coin, go, all);
      wrapEl.append(paper, btn("dt-tb dt-x dt-arrx", "✕<small>とじる</small>", close));
      root.append(wrapEl);
      var pressed = false;
      function press() {
        if (pressed) return;
        pressed = true;
        var r = null;
        if (act(function () { r = pressStamp(s); if (!r) return false; })) { run++; if (r.full) fulls.push(r.line); }
        bumpCoins();
        pad.classList.add("dt-pressed");
      }
      function finish() {
        press();
        gift.classList.add("dt-on"); coin.classList.add("dt-on"); go.hidden = false; phase = null;
        // a long queue (a big day, or days away): after two in a row, offer to press the rest at once
        var left = pending(s).length;
        if (run >= 2 && left) { all.innerHTML = "ぜんぶ おす（あと " + left + "）"; all.hidden = false; }
      }
      /** Then: each line just completed gets its fanfare, one after another. */
      function cheer(then) {
        if (!fulls.length) return then();
        fanfare(lineOf(fulls.shift()), function () { cheer(then); });
      }
      /** Press every waiting stamp in one save, then show them all on one sheet. */
      function pressAll() {
        var got = [];
        if (!act(function () { for (var r = pressStamp(s); r; r = pressStamp(s)) got.push(r); })) return;
        run += got.length;
        got.forEach(function (x) { if (x.full) fulls.push(x.line); });
        bumpCoins();
        paper.innerHTML = "";
        var grid = el("div", "dt-allgrid");
        got.forEach(function (x) {
          var xs = lineOf(x.line).stations[x.station];
          grid.append(htmlEl("div", "dt-allone", '<span class="dt-stw" style="transform:rotate(' + tiltOf(x.station, x.lap) + 'deg)">' +
            stampSVG(x.line, x.station, x.lap) + '</span><span class="dt-allgift">' + (xs[2] || "") + "</span>" +
            '<span class="dt-allname">' + ruby(xs[0], xs[1]) + "</span>"));
        });
        paper.append(el("div", "dt-ah", "スタンプ " + got.length + "こ ポン！"),
          htmlEl("div", "dt-allcoins", "＋10 × " + got.length + " ＝ <b>＋" + got.length * ARRIVAL_COINS + " 🪙</b>"),
          grid, btn("dt-go dt-primary", "しゅっぱつ！ 🚃", function () { cheer(done); }));
        paper.classList.add("dt-allsheet");
      }
      wrapEl.addEventListener("click", function () { if (!go.hidden) return; skip(); });
      var quick = reduced();
      next(function (skipped) {
        if (skipped) return finish();
        pad.classList.add("dt-hdown");
        next(function (sk2) {
          press();
          if (sk2) return finish();
          next(function (sk3) {
            gift.classList.add("dt-on");
            if (sk3) return finish();
            next(function () { finish(); }, quick ? 300 : 700);
          }, quick ? 300 : 650);
        }, quick ? 100 : 420);
      }, quick ? 100 : 300);
      function done() {
        wrapEl.remove();
        renderTrain();                       // after a terminus the train faces the way back
        scene.classList.remove("dt-at", "dt-stopped");
        scene.classList.add("dt-leaving");
        if (turn && a.line === activeId(s)) banner("🔁 おりかえし！");
        later(function () { scene.classList.remove("dt-leaving"); stn.innerHTML = ""; }, reduced() ? 300 : 1500);
        busy = false;
        root.classList.remove("dt-busy");
        if (pending(s).length) { busy = true; renderTop(); later(function () { busy = false; playArrivals(); }, reduced() ? 300 : 1200); return; }
        renderTop();
        setRegion(nextOf(lineOf(activeId(s)), tripOf(s).pos));
        renderSign();
        sign.classList.remove("dt-flip");
        later(function () { sign.classList.add("dt-flip"); }, 10);
      }
    }
    /** A big word over the scene for a moment (おりかえし！). */
    function banner(text) {
      var b = el("div", "dt-banner", text);
      root.append(b);
      later(function () { b.remove(); }, 1900);
    }
    /** ぜんえき せいは！ — every station of line l has a stamp: a gold medal, confetti and ＋100 (already paid). */
    function fanfare(l, then) {
      var f = el("div", "dt-fan"), box = el("div", "dt-fanbox"), conf = el("div", "dt-confetti"), r = rng(l.id.length * 7 + 3);
      var cols = ["#f4b63f", "#e5484d", "#3aa65a", "#3b8fd6", "#f37cab", "#8c58d0", l.color];
      for (var i = 0; i < 36; i++) {
        var c = el("i");
        c.style.left = (r() * 100).toFixed(1) + "%";
        c.style.background = cols[i % cols.length];
        c.style.animationDelay = (r() * 1.2).toFixed(2) + "s";
        c.style.animationDuration = (2.2 + r() * 1.6).toFixed(2) + "s";
        c.style.setProperty("--rot", Math.round(r() * 720 - 360) + "deg");
        conf.append(c);
      }
      box.style.setProperty("--lc", l.color);
      box.innerHTML = '<div class="dt-rays"></div><div class="dt-medal">' + medalSVG(l) + "</div>" +
        '<div class="dt-fantitle">ぜんえき せいは！</div><div class="dt-fanline">' + ruby(l.name, l.yomi) + " の えき ぜんぶ " + l.stations.length + "えき！</div>" +
        '<div class="dt-fancoins">＋' + FULL_COINS + " 🪙</div>";
      box.append(btn("dt-go dt-primary", "やったー！", function () { f.remove(); bumpCoins(); then(); }));
      f.append(conf, box);
      root.append(f);
    }
    scene.addEventListener("click", function () { if (busy) skip(); });

    // -- panels (stamp book, stamp card, shop) and small modals
    /** A full-screen panel with a title and a back button. Returns { body, close }. */
    function panel(title, cls) {
      var p = el("div", "dt-panel " + (cls || "")), head = el("div", "dt-phead"), body = el("div", "dt-pbody");
      head.append(btn("dt-back", "◀ <small>もどる</small>", function () { p.remove(); }), htmlEl("div", "dt-ptitle", title));
      p.append(head, body);
      root.append(p);
      return { el: p, head: head, body: body, close: function () { p.remove(); } };
    }
    /** A small centred box over everything; tapping outside closes it. Returns { box, close }. */
    function modal(cls) {
      var m = el("div", "dt-modal"), box = el("div", "dt-mbox " + (cls || ""));
      m.append(box);
      m.addEventListener("click", function () { m.remove(); });
      box.addEventListener("click", function (e) { e.stopPropagation(); });
      root.append(m);
      return { box: box, close: function () { m.remove(); } };
    }
    function toast(text) {
      var t = el("div", "dt-toast", text);
      root.append(t);
      later(function () { t.remove(); }, 1800);
    }

    // -- スタンプちょう: the stamp book and the route map
    /** スタンプちょう: a line picker (owned lines; the others locked, with their price), then that line's stamps or
     *  its route map. tab: "stamps" | "map"; lineId: the line to show first (default: the active one). */
    function openBook(tab, lineId) {
      var P = panel("スタンプちょう", "dt-book"), pick = el("div", "dt-lpick"), tabs = el("div", "dt-tabs"), head = el("div", "dt-lhead");
      var area = el("div", "dt-tabarea"), which = tab || "stamps", cur = lineId || activeId(s);
      var t1 = btn("dt-tab", "📖 スタンプ", function () { which = "stamps"; show(); }), t2 = btn("dt-tab", "🗾 ろせんず", function () { which = "map"; show(); });
      tabs.append(t1, t2);
      P.body.append(pick, head, tabs, area);
      function show() {
        pick.innerHTML = "";
        LINES.forEach(function (l) {
          var owned = owns(s, "line", l.id), t = s.lines[l.id], c;
          if (owned) c = btn("dt-lchip" + (l.id === cur ? " dt-on" : ""), "<i></i>" + l.short + (t && t.full ? " 👑" : ""), function () { cur = l.id; show(); });
          else c = btn("dt-lchip dt-locked", "🔒 " + l.short + " <small>🪙" + l.price + "</small>", function () { P.close(); openShop("line"); });
          c.style.setProperty("--lc", l.color);
          pick.append(c);
        });
        var l = lineOf(cur), trip = tripOf(s, cur), on = cur === activeId(s);
        head.innerHTML = "";
        head.style.setProperty("--lc", l.color);
        head.append(htmlEl("div", "dt-lname", ruby(l.name, l.yomi) + (trip.full ? ' <span class="dt-gold">👑 ぜんえき せいは！</span>' : "")));
        if (on) head.append(el("span", "dt-lnow", "🚃 いま のってる"));
        else head.append(btn("dt-primary dt-lboard", "🚃 この せんに のる", function () { boardLine(cur); P.close(); }));
        t1.classList.toggle("dt-on", which === "stamps");
        t2.classList.toggle("dt-on", which === "map");
        area.innerHTML = "";
        if (which === "stamps") stampGrid(area, l);
        else {
          if (l.type === "line") {
            var p = trip.pos, end = p.dir > 0 ? l.stations.length - 1 : 0;
            area.append(htmlEl("div", "dt-dirnote", "<b>" + kanaOf(end, l) + "</b> ほうめんへ はしってるよ" + (on ? "" : "（おやすみ ちゅう）")));
          }
          area.append(htmlEl("div", "dt-route", routeSVG(s, cur)));
        }
      }
      show();
    }
    /** のりかえ: run the train on line id from now on (its trip goes on from where it was). */
    function boardLine(id) {
      if (!act(function () { return board(s, id); }, true)) return;
      region = null;
      setRegion(nextOf(lineOf(id), tripOf(s, id).pos), id);
      renderSign();
      toast("🚃 " + lineOf(id).short + " に のりかえ！");
      playArrivals();
    }
    function stampGrid(area, l) {
      var t = tripOf(s, l.id), n = l.stations.length, got = Object.keys(t.stamps).length;
      area.append(htmlEl("div", "dt-count", "あつめた スタンプ <b>" + got + "</b> / " + n +
        '<span class="dt-cbar"><i style="transform:scaleX(' + (got / n).toFixed(3) + ')"></i></span>'));
      var parts = l.type === "japan" ? REGIONS.map(function (r) { return [r.name, r.color, r.from, r.to]; }) : [[l.yomi, l.color, 0, n - 1]];
      parts.forEach(function (r) {
        var sec = el("div", "dt-reg"), grid = el("div", "dt-grid"), k = 0;
        for (var i = r[2]; i <= r[3]; i++) if (t.stamps[i]) k++;
        sec.style.setProperty("--c", r[1]);
        sec.append(htmlEl("div", "dt-regh", "<i></i>" + r[0] + " <small>" + k + "/" + (r[3] - r[2] + 1) + "</small>"), grid);
        for (var j = r[2]; j <= r[3]; j++) grid.append(cell(l, j));
        area.append(sec);
      });
    }
    /** One station in the stamp book: its stamp (tap for the big view), or a dotted circle. Every cell is the same
     *  box (a div, so no button centring moves it): a fixed circle box first, the names under it; the stamp's tilt is
     *  a transform and the lap badge lies over the corner, so neither takes room. */
    function cell(l, i) {
      var st = l.stations[i], lap = tripOf(s, l.id).stamps[i];
      var c = htmlEl("div", "dt-cell" + (lap ? " dt-cgot" : " dt-none"), '<span class="dt-circ">' +
        (lap ? '<span class="dt-stw" style="transform:rotate(' + tiltOf(i, lap) + 'deg)">' + stampSVG(l.id, i, lap) + "</span>"
          : '<span class="dt-empty"><b>' + (st[2] ? st[0] : st[0].slice(0, 3)) + "</b></span>") + "</span>" +
        '<span class="dt-cname">' + st[0] + '</span><span class="dt-ckana">' + st[1] + "</span>" +
        (lap > 1 ? '<span class="dt-lapb" style="background:' + inkFor(l.id, lap)[1] + '">' + T.lap(lap) + "</span>" : ""));
      if (lap) {
        c.setAttribute("role", "button");
        c.tabIndex = 0;
        c.addEventListener("click", function (e) { if (e && e.stopPropagation) e.stopPropagation(); bigStamp(l, i); });
      }
      return c;
    }
    function bigStamp(l, i) {
      var st = l.stations[i], lap = tripOf(s, l.id).stamps[i], M = modal("dt-bigview");
      M.box.innerHTML = '<div class="dt-bigstamp" style="transform:rotate(' + tiltOf(i, lap) + 'deg)">' + stampSVG(l.id, i, lap) + "</div>" +
        '<div class="dt-bvname">' + ruby(st[0], st[1]) + "</div>" +
        (st[2] ? '<div class="dt-bvgift"><span>' + st[2] + "</span>おみやげ: " + st[3] + "</div>" : '<div class="dt-bvgift">' + l.short + " の えき</div>") +
        '<div class="dt-bvlap" style="background:' + inkFor(l.id, lap)[1] + '">' + T.lap(lap) + " の スタンプ</div>";
      M.box.append(btn("dt-primary dt-wide", "とじる", M.close));
    }

    // -- しゅっせき カード: the stamp card
    function openCard() {
      var P = panel("しゅっせき カード", "dt-cardp"), c = el("div", "dt-rcard"), boxes = el("div", "dt-boxes");
      var nextSp = SPECIALS[s.card.done], have = s.card.boxes.length;
      c.append(htmlEl("div", "dt-rhead", '<span class="dt-rno">' + (s.card.done + 1) + "まいめ</span><b>しゅっせき カード</b>" +
        '<span class="dt-rsub">べんきょう した ひに 1つ はなまる</span>'));
      for (var i = 0; i < CARD_BOXES; i++) {
        var d = s.card.boxes[i], last = i === CARD_BOXES - 1, bx;
        if (d) bx = htmlEl("div", "dt-box dt-got", hanamaruSVG() + '<span class="dt-bdate">' + (+d.slice(5, 7)) + "/" + (+d.slice(8, 10)) + "</span>");
        else if (last) bx = htmlEl("div", "dt-box dt-goal", '<span class="dt-gift10">🎁</span><span class="dt-bdate">＋50🪙</span>');
        else bx = htmlEl("div", "dt-box" + (i === have ? " dt-nextbox" : ""), "<span>" + (i + 1) + "</span>");
        boxes.append(bx);
      }
      c.append(boxes);
      c.append(htmlEl("div", "dt-rfoot", have >= CARD_BOXES - 1 ? "あと 1にちで いっぱい！" : "あと <b>" + (CARD_BOXES - have) + "</b>にちで いっぱい！"));
      P.body.append(c);
      P.body.append(htmlEl("div", "dt-reward", nextSp ? '<span class="dt-rbig">' + nextSp[0] + "</span><span>いっぱいに なったら<br><b>＋50 🪙</b> と <b>" + nextSp[1] + "</b> が のってくるよ！</span>"
        : '<span class="dt-rbig">🪙</span><span>いっぱいに なったら <b>＋50 🪙</b>！</span>'));
      var pile = "";
      for (var k = 0; k < Math.min(s.card.done, 5); k++) pile += '<i style="transform:translate(' + k * 3 + "px," + -k * 3 + "px) rotate(" + (k % 2 ? 4 : -3) + 'deg)"></i>';
      P.body.append(htmlEl("div", "dt-pile", '<span class="dt-pilecards">' + pile + "</span><span>おわった カード: <b>" + s.card.done + "</b>まい</span>"));
      P.body.append(htmlEl("div", "dt-specials", "<div>とくべつ な おきゃくさん</div><div class=\"dt-sprow\">" + SPECIALS.map(function (x, j) {
        return '<span class="' + (j < s.card.done ? "dt-spon" : "dt-spoff") + '">' + (j < s.card.done ? x[0] : "？") + "</span>";
      }).join("") + "</div>"));
    }

    // -- おみせ: the shop
    /** おみせ: lines first (ろせん), then the train's model, paint, cars and passengers. tab: the tab to open on. */
    function openShop(tab) {
      var P = panel("おみせ", "dt-shop"), coinTag = el("span", "dt-pcoins"), show = el("div", "dt-show");
      var tabs = el("div", "dt-tabs"), area = el("div", "dt-tabarea"), cur = tab || "line";
      P.head.append(coinTag);
      P.body.append(show, tabs, area);
      var names = [["line", "🛤️<br>ろせん"], ["model", "🚃<br>でんしゃ"], ["color", "🎨<br>いろ"], ["cars", "🔗<br>しゃりょう"], ["pass", "🐶<br>じょうきゃく"]];
      var tabBtns = names.map(function (n) { var b = btn("dt-tab", n[1], function () { cur = n[0]; draw(); }); tabs.append(b); return b; });
      var pick = null;    // the passenger chosen to seat next
      /** Redraw the showroom train, coins and the current tab. */
      function draw() {
        coinTag.innerHTML = "🪙 <b>" + s.coins + "</b>";
        var u = trainUnits(s.train), w = Math.min(root.clientWidth || g.innerWidth || 360, 520) - 32;
        show.innerHTML = '<div class="dt-showtrain"><div class="dt-train">' + trainHTML(s.train, Math.max(0.42, Math.min(0.95, w / u))) + "</div></div>";
        tabBtns.forEach(function (b, i) { b.classList.toggle("dt-on", names[i][0] === cur); });
        area.innerHTML = "";
        ({ line: lines, model: models, color: colors, cars: cars, pass: passengers })[cur]();
      }
      /** An item row/tile: art, name, and its button (equipped, use, buy, or how many coins are missing). */
      function item(art, name, state, onTap, tile) {
        var it = el("div", "dt-item" + (tile ? " dt-tile" : "") + (state.poor ? " dt-poor" : "") + (state.on ? " dt-iton" : ""));
        it.append(htmlEl("div", "dt-iart", art), htmlEl("div", "dt-iname", name));
        var b = btn("dt-ibtn" + (state.on ? " dt-ion" : state.owned ? " dt-iuse" : " dt-ibuy"), state.label, onTap);
        if (state.on || state.poor) b.disabled = true;
        it.append(b);
        return it;
      }
      function stateOf(kind, id, isOn) {
        var owned = owns(s, kind, id), cost = priceOf(kind, id);
        if (isOn) return { on: true, owned: true, label: "✔ つかってる" };
        if (owned) return { owned: true, label: "つかう" };
        if (s.coins < cost) return { poor: true, label: "🪙" + cost + "<small>あと " + (cost - s.coins) + "</small>" };
        return { label: "🪙 " + cost };
      }
      /** Ask first, then buy and celebrate. */
      function askBuy(kind, id, name) {
        var M = modal("dt-ask");
        M.box.innerHTML = '<div class="dt-askq">' + name + " を かう？</div><div class=\"dt-askp\">🪙 " + priceOf(kind, id) + "</div>";
        var row = el("div", "dt-row");
        row.append(btn("", "やめる", M.close), btn("dt-primary", "かう！", function () {
          M.close();
          if (act(function () { return buy(s, kind, id); }, true)) {
            if (kind === "line") askRide(id); else toast("やったね！ " + name);
          }
          draw();
        }));
        M.box.append(row);
      }
      /** After buying a line: 「いま のる？」 */
      function askRide(id) {
        var l = lineOf(id), M = modal("dt-ask");
        M.box.style.setProperty("--lc", l.color);
        M.box.innerHTML = '<div class="dt-ridebig">' + sketchSVG(l) + '</div><div class="dt-askq">' + ruby(l.name, l.yomi) + " を かったよ！</div>" +
          '<div class="dt-asks">いま のる？</div>';
        var row = el("div", "dt-row");
        row.append(btn("", "あとで", M.close), btn("dt-primary", "のる！ 🚃", function () { M.close(); P.close(); boardLine(id); }));
        M.box.append(row);
      }
      /** ろせん: every line, with its colour, name, stations, a sketch; のる / のっている once owned. */
      function lines() {
        var list = el("div", "dt-items");
        LINES.forEach(function (l) {
          var on = activeId(s) === l.id, owned = owns(s, "line", l.id), t = s.lines[l.id];
          var st = on ? { on: true, owned: true, label: "✔ のっている" } : owned ? { owned: true, label: "のる" } : stateOf("line", l.id, false);
          var info = l.stations.length + "えき ・ " + (l.type === "line" ? "いったり きたり" : "ぐるっと 1しゅう") +
            (FITS[l.id] ? ' <span class="dt-fits">にあう: ' + miniTrain({ model: FITS[l.id], color: "" }, 0.15) + "</span>" : "");
          var it = item(sketchSVG(l), '<span class="dt-lnm">' + ruby(l.name, l.yomi) + (t && t.full ? " 👑" : "") + '</span><span class="dt-linfo">' + info + "</span>",
            st, function () {
              if (owned) { P.close(); boardLine(l.id); }
              else askBuy("line", l.id, l.name);
            });
          it.classList.add("dt-lcard");
          it.style.setProperty("--lc", l.color);
          list.append(it);
        });
        area.append(list);
      }
      function models() {
        var list = el("div", "dt-items");
        MODELS.forEach(function (m) {
          var on = s.train.model === m.id;
          list.append(item(miniTrain({ model: m.id, color: on ? s.train.color : "" }, 0.42), m.name, stateOf("model", m.id, on), function () {
            if (owns(s, "model", m.id)) { act(function () { return equip(s, "model", m.id); }, true); draw(); }
            else askBuy("model", m.id, m.name);
          }));
        });
        area.append(list);
      }
      function colors() {
        var list = el("div", "dt-items dt-tiles"), m = modelOf(drawn(s.train));
        list.append(item('<i class="dt-swatch" style="background:' + m.base + '"></i>', "もとの いろ", stateOf("color", "", s.train.color === ""), function () {
          act(function () { return equip(s, "color", ""); }, true); draw();
        }, true));
        COLORS.forEach(function (c) {
          list.append(item('<i class="dt-swatch" style="background:' + c.c + '"></i>', c.name, stateOf("color", c.id, s.train.color === c.id), function () {
            if (owns(s, "color", c.id)) { act(function () { return equip(s, "color", c.id); }, true); draw(); }
            else askBuy("color", c.id, c.name);
          }, true));
        });
        area.append(list);
      }
      function cars() {
        var o = s.owned, t = s.train, box = el("div", "dt-carsbox");
        var minus = btn("dt-step", "−", function () { act(function () { return equip(s, "cars", s.train.cars - 1); }, true); draw(); });
        var plus = btn("dt-step", "＋", function () { act(function () { return equip(s, "cars", s.train.cars + 1); }, true); draw(); });
        minus.disabled = t.cars <= 0;
        plus.disabled = t.cars >= o.cars;
        var row = el("div", "dt-row dt-stepper");
        row.append(minus, htmlEl("div", "dt-stepn", "<b>" + (t.cars + 1) + "</b>りょう"), plus);
        box.append(htmlEl("div", "dt-hint", "つなぐ しゃりょう（もってる: " + o.cars + "/" + MAX_CARS + "）"), row);
        if (o.cars < MAX_CARS) {
          box.append(item(miniTrain({ model: t.model, color: t.color }, 0.3) + "<b>＋1</b>", "しゃりょうを ふやす", stateOf("car", ""), function () { askBuy("car", "", "しゃりょう"); }));
        } else box.append(el("div", "dt-hint", "しゃりょうは ぜんぶ もってるよ！"));
        area.append(box);
      }
      function passengers() {
        var t = s.train, n = windowsOf(t), L = LEAD_SEATS[drawn(t)], C = CAR_SEATS[drawn(t)];
        area.append(el("div", "dt-hint", pick ? pick + " を どの まどに？ まどを タップ してね" : "どうぶつを えらんで、まどを タップ してね"));
        var seats = el("div", "dt-seats");
        for (var c = 0; c <= t.cars; c++) {
          var row = el("div", "dt-seatrow"), from = c === 0 ? 0 : L + (c - 1) * C, cnt = c === 0 ? L : C;
          row.append(el("span", "dt-seatlbl", c === 0 ? "せんとう" : (c + 1) + "りょうめ"));
          for (var i = from; i < from + cnt; i++) row.append(seatBtn(i));
          seats.append(row);
        }
        area.append(seats);
        var list = el("div", "dt-items dt-tiles dt-pass");
        PASSENGERS.forEach(function (p) { list.append(passTile(p)); });
        SPECIALS.forEach(function (p) { if (owns(s, "pass", p[0])) list.append(passTile(p)); });
        area.append(list);
        function seatBtn(i) {
          var who = t.seats[i];
          return btn("dt-seat" + (who ? " dt-full" : ""), who || "", function () {
            var p = pick;
            if (!p && !who) return;
            pick = null;
            act(function () { return seat(s, i, p || null); }, true);
            draw();
          });
        }
        function passTile(p) {
          var e = p[0], owned = owns(s, "pass", e), seated = t.seats.slice(0, n).indexOf(e) >= 0;
          var st = owned ? { owned: true, on: false, label: pick === e ? "えらんでる" : seated ? "のってる" : "えらぶ" } : stateOf("pass", e, false);
          var it = item('<span class="dt-pe">' + e + "</span>", p[1], st, function () {
            if (owned) { pick = pick === e ? null : e; draw(); }
            else askBuy("pass", e, p[1]);
          }, true);
          if (pick === e) it.classList.add("dt-picked");
          return it;
        }
      }
      draw();
    }

    // -- ⚙ test controls (data-dev="1" only)
    function openDev() {
      var M = modal("dt-dev"), t = today();
      M.box.append(htmlEl("div", "dt-askq", "⚙ テスト（" + t + (shift ? "、" + (shift > 0 ? "+" : "") + shift + "にち" : "") + "）"));
      var grid = el("div", "dt-devgrid");
      function add(label, fn) { grid.append(btn("", label, function () { fn(); })); }
      add("🪙＋50", function () { act(function () { s.coins += 50; }); bumpCoins(); });
      add("＋1 しゅっせき（まえの ひ）", function () { act(function () { devPastDay(s, today()); }); toast("📮 ＋1"); });
      add("＋10 すすむ", function () { act(function () { advance(s, 10, today()); }); M.close(); playArrivals(); });
      add("つぎの えきへ", function () { act(function () { devArrive(s, today()); }); M.close(); playArrivals(); });
      add("ひ −1", function () { setShift(shift - 1); M.close(); openDev(); });
      add("ひ ＋1", function () { setShift(shift + 1); M.close(); openDev(); });
      add("リセット", function () {
        M.close();
        var C = modal("dt-ask");
        C.box.append(el("div", "dt-askq", "ほんとうに リセット する？"));
        var row = el("div", "dt-row");
        row.append(btn("", "やめる", C.close), btn("dt-danger", "リセット", function () {
          C.close();
          act(function () { replaceSave(s, fresh()); }, true);
          setRegion(0);
          playArrivals();
        }));
        C.box.append(row);
      });
      M.box.append(grid);
    }
    function setShift(n) {
      shift = n;
      try { storage().setItem(DEV_DAY_KEY, String(n)); } catch (e) { /* blocked: this opening only */ }
      renderWeek();
    }

    // -- open and close
    function close() {
      timers.forEach(function (t) { g.clearTimeout(t); });
      timers = [];
      phase = null;
      root.remove();
      backdrop.remove();
      docEl.classList.remove("dt-open");
      doc.removeEventListener("visibilitychange", vis);
      doc.removeEventListener("keydown", onKey);
      if (g.removeEventListener) g.removeEventListener("resize", onResize);
      if (watch) watch.disconnect();
      ctx.game = null;
      renderChip(ctx);
    }
    /** No animation while the page is hidden. */
    function vis() { root.classList.toggle("dt-paused", !!doc.hidden); }
    doc.addEventListener("visibilitychange", vis);
    // On a big window (desktop Anki, a tablet) the game is a phone-sized column over a dimmed backdrop; clicking the
    // backdrop closes it. Phones (upright or sideways) keep the full screen.
    var backdrop = el("div", "dt-backdrop");
    backdrop.addEventListener("click", function (e) { if (e && e.stopPropagation) e.stopPropagation(); close(); });
    function wide() { return (g.innerWidth || 0) >= 700 && (g.innerHeight || 0) >= 560; }
    function layout() { var w = wide(); root.classList.toggle("dt-wide", w); backdrop.hidden = !w; }
    function onResize() { layout(); renderTrain(); }
    if (g.addEventListener) g.addEventListener("resize", onResize);
    /** Esc (desktop): closes the top small box or panel, else the game. Anki's own shortcuts still reach Anki. */
    function onKey(e) {
      if (!e || (e.key !== "Escape" && e.key !== "Esc")) return;
      var kids = root.children, top = kids[kids.length - 1];
      if (top && (top.classList.contains("dt-modal") || top.classList.contains("dt-panel"))) top.remove();
      else close();
    }
    doc.addEventListener("keydown", onKey);
    // AnkiDroid reads taps and swipes on the page for its own gestures: keep ours inside the game.
    ["touchstart", "touchend", "touchmove", "click"].forEach(function (t) {
      root.addEventListener(t, function (e) { if (e && e.stopPropagation) e.stopPropagation(); }, { passive: true });
    });
    // Answering swaps in the next card and removes the slot: close the game then.
    var watch = g.MutationObserver ? new g.MutationObserver(function () { if (!ctx.slot.isConnected) close(); }) : null;
    if (watch) watch.observe(doc.body, { childList: true, subtree: true });

    doc.body.append(backdrop, root);
    layout();
    syncIn(ctx);
    vis();
    var q0 = pending(s)[0];
    if (q0) setRegion(q0.station, q0.line); else setRegion(nextOf(lineOf(activeId(s)), tripOf(s).pos));
    renderTrain();
    renderTop();
    renderSign();
    renderWeek();
    if (reduced()) root.classList.add("dt-still");
    later(playArrivals, q0 ? 500 : 0);
    ctx.close = close;
    ctx.ui = { openBook: openBook, openCard: openCard, openShop: openShop, openDev: openDev, playArrivals: playArrivals, skip: skip };
  }

  // ---- the route map ----------------------------------------------------------------------------
  /** ろせんず for line lineId: the japan trip and there-and-back lines snake down the screen (japan in region
   *  colours, 4 a row; other lines in their colour, 3 a row so long names fit); a loop line is a ring. Stations with
   *  a stamp are filled; a little train marks where the train is on that line (a plane between 沖縄 and 北海道). */
  function routeSVG(s, lineId) {
    var l = lineOf(lineId || activeId(s)), trip = tripOf(s, l.id);
    return l.type === "loop" ? ringSVG(s, l, trip) : snakeSVG(s, l, trip);
  }
  /** Map labels for station st at (x, y): kanji, then kana (split in two lines when long), at least 11.5 units. */
  function label(st, x, y, got, room, anchor) {
    var k = st[0], y1 = st[1], kfs = Math.min(15, room / k.length), lines = [y1];
    if (y1.length * 11.5 > room) { var h = Math.ceil(y1.length / 2); lines = [y1.slice(0, h), y1.slice(h)]; }
    var yfs = Math.max(11.5, Math.min(12.5, room / Math.max.apply(null, lines.map(function (t) { return t.length; }))));
    var a = ' text-anchor="' + (anchor || "middle") + '"';
    return '<text x="' + x + '" y="' + y + '" font-size="' + kfs.toFixed(1) + '"' + a + ' font-weight="700" fill="' + (got ? "#2b3150" : "#a59d8e") + '">' + k + "</text>" +
      lines.map(function (t, i) {
        return '<text x="' + x + '" y="' + (y + 15 + i * 13) + '" font-size="' + yfs.toFixed(1) + '"' + a + ' fill="' + (got ? "#4a5068" : "#ada595") + '">' + t + "</text>";
      }).join("");
  }
  /** The train on a map at (x, y): a white disc with the lead car, pinging a few times. */
  function marker(s, x, y) {
    return '<g transform="translate(' + x.toFixed(1) + " " + y.toFixed(1) + ')"><circle class="dt-ping" r="15" fill="#2b3150" opacity=".18"/>' +
      '<circle r="13" fill="#fff" stroke="#2b3150" stroke-width="2.5"/>' +
      '<g transform="translate(-10.5 -6.5) scale(.12)">' + CARS[drawn(s.train)].lead(Object.assign({ seats: [] }, paintOf(s.train))).svg + "</g></g>";
  }
  function stationDot(x, y, c, got) {
    return got ? circ(x, y, 10, c, ' stroke="#fff" stroke-width="3.5"') + '<path d="M' + (x - 4) + " " + y + "l3 3l5 -6" + '" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
      : circ(x, y, 8.5, "#fff", ' stroke="' + c + '" stroke-width="3.5" opacity=".75"');
  }
  function snakeSVG(s, l, trip) {
    var n = l.stations.length, japan = l.type === "japan", per = japan ? 4 : 3, W = 360, x0 = japan ? 52 : 56;
    var dx = (W - 2 * x0) / (per - 1), y0 = japan ? 66 : 40, dy = japan ? 86 : 100, rows = Math.ceil(n / per), st = trip.stamps, p = trip.pos;
    function pt(i) { var r = Math.floor(i / per), c = i % per; return [r % 2 ? W - x0 - c * dx : x0 + c * dx, y0 + r * dy]; }
    /** The point a fraction f along the line from station i to i+1 (a U-turn between rows). */
    function along(i, f) {
      var a = pt(i), b = pt(i + 1);
      if (a[1] === b[1]) return [a[0] + (b[0] - a[0]) * f, a[1]];
      var right = a[0] > W / 2, ang = Math.PI * f, cy = (a[1] + b[1]) / 2, rr = dy / 2;
      return [a[0] + (right ? 1 : -1) * rr * Math.sin(ang), cy - rr * Math.cos(ang)];
    }
    var lines = "", dots = "", labels = "";
    for (var i = 0; i < n - 1; i++) {
      var a = pt(i), b = pt(i + 1), seen = st[i] && st[i + 1];
      var d = a[1] === b[1] ? "M" + a[0] + " " + a[1] + "H" + b[0] : "M" + a[0] + " " + a[1] + "A" + dy / 2 + " " + dy / 2 + " 0 0 " + (a[0] > W / 2 ? 1 : 0) + " " + b[0] + " " + b[1];
      lines += '<path d="' + d + '" stroke="' + colorOn(l, i + 1) + '" stroke-width="9" fill="none" stroke-linecap="round" opacity="' + (seen ? 1 : 0.32) + '"/>';
    }
    for (var j = 0; j < n; j++) {
      var q = pt(j);
      dots += stationDot(q[0], q[1], colorOn(l, j), st[j]);
      labels += label(l.stations[j], q[0], q[1] + 29, st[j], dx - 6);
    }
    var mk, extra = "", legend = "", h = y0 + (rows - 1) * dy + (japan ? 112 : 64);
    if (japan) {
      var end = pt(n - 1), planeAt = [end[0], end[1] + 66];
      extra = '<path d="M' + end[0] + " " + (end[1] + 50) + "V" + (planeAt[1] - 14) + '" stroke="#8a8fa3" stroke-width="2.5" stroke-dasharray="3 5" fill="none"/>' +
        '<text x="' + (planeAt[0] + (planeAt[0] < W / 2 ? 24 : -24)) + '" y="' + (planeAt[1] + 5) + '" font-size="12.5" text-anchor="' +
        (planeAt[0] < W / 2 ? "start" : "end") + '" fill="#2b3150">ひこうきで ほっかいどうへ</text>';
      legend = REGIONS.map(function (r, k) {
        var x = 12 + (k % 4) * 87, y = 16 + Math.floor(k / 4) * 20;
        return rect(x, y - 8, 14, 9, 4.5, r.color) + '<text x="' + (x + 18) + '" y="' + y + '" font-size="11.5" fill="#2b3150">' + (r.id === "kyushu" ? "きゅうしゅう" : r.name) + "</text>";
      }).join("");
      mk = p.station === n - 1 ? '<g transform="translate(' + planeAt[0] + " " + planeAt[1] + ')"><circle class="dt-ping" r="17" fill="#2b3150" opacity=".18"/>' +
        '<circle r="15" fill="#fff" stroke="#2b3150" stroke-width="2.5"/><text y="6" font-size="17" text-anchor="middle">✈️</text></g>' : null;
    }
    if (!mk) {
      var f = p.step / p.seg, here = l.type === "line" && p.dir < 0 ? along(p.station - 1, 1 - f) : along(p.station, f);
      mk = marker(s, here[0], here[1]);
    }
    return '<svg viewBox="0 0 ' + W + " " + h + '" aria-hidden="true">' + legend + lines + extra + dots + labels + mk + "</svg>";
  }
  /** A loop line as a ring (a long oval): up the right side, down the left, round at the ends. */
  function ringSVG(s, l, trip) {
    var n = l.stations.length, half = Math.ceil(n / 2), W = 360, xl = 148, xr = 212, r = (xr - xl) / 2, y0 = 74, gap = 44;
    var yb = y0 + (half - 1) * gap, st = trip.stamps, p = trip.pos;
    function pt(i) { return i < half ? [xr, yb - i * gap] : [xl, y0 + (i - half) * gap]; }
    function along(i, f) {
      var a = pt(i), b = pt((i + 1) % n);
      if (a[0] === b[0]) return [a[0], a[1] + (b[1] - a[1]) * f];
      var top = a[0] > b[0], ang = Math.PI * f, cy = a[1];
      return top ? [W / 2 + r * Math.cos(ang), cy - r * Math.sin(ang)] : [W / 2 - r * Math.cos(ang), cy + r * Math.sin(ang)];
    }
    var ring = '<path d="M' + xr + " " + yb + "V" + y0 + "A" + r + " " + r + " 0 0 0 " + xl + " " + y0 + "V" + yb + "A" + r + " " + r + " 0 0 0 " + xr + " " + yb +
      '" stroke="' + l.color + '" stroke-width="10" fill="none"/>', dots = "", labels = "", arrows = "";
    for (var j = 0; j < n; j++) {
      var q = pt(j), right = j < half;
      dots += stationDot(q[0], q[1], l.color, st[j]);
      labels += label(l.stations[j], q[0] + (right ? 18 : -18), q[1] - 1, st[j], 126, right ? "start" : "end");
    }
    for (var k = 0; k < half - 1; k += 3) {
      var yr = yb - k * gap - gap / 2, yl = y0 + k * gap + gap / 2;
      arrows += '<path d="M' + (xr - 5) + " " + (yr + 3) + "l5 -6l5 6" + '" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M' + (xl - 5) + " " + (yl - 3) + "l5 6l5 -6" + '" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    }
    var here = along(p.station, p.step / p.seg);
    return '<svg viewBox="0 0 ' + W + " " + (yb + r + 30) + '" aria-hidden="true">' + ring + arrows + dots + labels + marker(s, here[0], here[1]) + "</svg>";
  }

  // ---- style ------------------------------------------------------------------------------------
  function injectStyle() {
    if (doc.getElementById("dt-style")) return;
    var st = el("style");
    st.id = "dt-style";
    st.textContent = CSS;
    doc.head.append(st);
  }
  var SIDEWAYS = "(orientation:landscape) and (max-height:500px)";
  // Only transform and opacity animate. No env(safe-area-inset-*): AnkiDroid's card view already sits between its
  // bars, and the insets it reports would only add empty bands.
  var CSS = [
    "@font-face{font-family:'DT Klee';src:url('_kleeone-regular.ttf');font-weight:400;font-display:swap}",
    "@font-face{font-family:'DT Klee';src:url('_kleeone-semibold.ttf');font-weight:600 700;font-display:swap}",
    ".dt-chip,.dt-bubble,.dt-root,.dt-note{--dt-ink:#2b3150;--dt-paper:#fff8ea;--dt-paper2:#f3e4c4;--dt-red:#e0523f;--dt-gold:#f4b63f;",
    "--dt-green:#36a058;font-family:'DT Klee','Klee One','Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif;color:var(--dt-ink);",
    "-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%;box-sizing:border-box;line-height:1.35;text-align:left;letter-spacing:0;word-break:keep-all;",
    "overflow-wrap:anywhere;-webkit-user-select:none;user-select:none}",
    ".dt-chip *,.dt-bubble *,.dt-root *{box-sizing:border-box}",
    ".dt-root button,.dt-chip{font-family:inherit;color:var(--dt-ink);-webkit-appearance:none;appearance:none}",
    ".dt-note{font-size:13px;padding:8px 12px;margin:12px 0;border-radius:12px;background:var(--dt-paper);border:2px dashed #e0a43a}",
    ".dt-noteparent{font-size:11px;color:#6a6f82;margin-top:4px;word-break:normal}",
    // the chip
    ".dt-chip{position:fixed;left:10px;bottom:10px;z-index:8900;display:flex;align-items:center;gap:7px;height:44px;margin:0;",
    "padding:0 15px 0 10px;border-radius:22px;border:2.5px solid var(--dt-ink);background:var(--dt-paper);font-size:16px;font-weight:700;",
    "box-shadow:0 3px 0 var(--dt-ink),0 5px 14px rgba(0,0,0,.28);cursor:pointer;white-space:nowrap}",
    // Under other card games' full-screen views (Kanpeki Garden's is at 9500 and marks html.kg-open), and hidden
    // while one is open; the game's own overlay (.dt-root) covers everything, their chips too.
    "html.kg-open .dt-chip,html.kg-open .dt-bubble{display:none}",
    ".dt-chip:active{transform:translateY(2px);box-shadow:0 1px 0 var(--dt-ink)}",
    ".dt-chiptrain{display:flex;align-items:flex-end;height:20px}.dt-chiptrain svg{display:block}",
    ".dt-chip-wait{background:#fff1c7}.dt-chip-lock{font-size:13px;color:#7a6f60}",
    ".dt-bump{animation:dt-bump .5s cubic-bezier(.2,1.6,.4,1)}",
    "@keyframes dt-bump{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}",
    // the bubble
    ".dt-bubble{position:fixed;left:10px;bottom:66px;z-index:8901;width:max-content;max-width:calc(100vw - 20px);padding:9px 14px 11px;",
    "border-radius:18px;background:#fff;border:2.5px solid var(--dt-ink);box-shadow:0 4px 0 var(--dt-ink),0 10px 24px rgba(0,0,0,.25);",
    "transform-origin:24px calc(100% + 34px);animation:dt-rise .4s cubic-bezier(.2,1.4,.5,1) both;cursor:pointer}",
    ".dt-bubble::after{content:'';position:absolute;left:24px;bottom:-9px;width:14px;height:14px;background:#fff;",
    "border-right:2.5px solid var(--dt-ink);border-bottom:2.5px solid var(--dt-ink);transform:rotate(45deg)}",
    ".dt-bout{animation:dt-shrink .45s ease-in forwards}",
    "@keyframes dt-rise{from{opacity:0;transform:translateY(18px) scale(.8)}to{opacity:1;transform:none}}",
    "@keyframes dt-shrink{from{opacity:1;transform:none}to{opacity:0;transform:scale(.12)}}",
    ".dt-bline{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#5a6078}",
    ".dt-bst{max-width:30vw;word-break:break-all;line-height:1.15}.dt-bturn{color:var(--lc,#e0523f);font-weight:700}",
    ".dt-bln{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#5a6078;margin-bottom:2px}",
    ".dt-bln i{width:18px;height:6px;border-radius:3px;background:var(--lc)}",
    ".dt-btrack{position:relative;display:block;width:112px;height:22px;flex:none}",
    ".dt-btrack::before{content:'';position:absolute;left:0;right:0;top:16px;height:4px;border-radius:2px;background:#e6dfcf}",
    ".dt-bdot{position:absolute;left:-4px;top:13px;width:10px;height:10px;border-radius:50%;background:#fff;border:2.5px solid var(--dt-ink)}",
    ".dt-bfill{position:absolute;left:0;right:0;top:16px;height:4px;border-radius:2px;background:var(--lc,var(--dt-green));transform:scaleX(var(--f,0));",
    "transform-origin:left center;transition:transform 1s cubic-bezier(.3,.1,.2,1)}",
    ".dt-bdot2{left:auto;right:-4px}.dt-bping{animation:dt-ping .8s 2 ease-out;background:var(--dt-gold)}",
    "@keyframes dt-ping{50%{transform:scale(1.6)}}",
    ".dt-btrain{position:absolute;left:-16px;bottom:5px;transform:translateX(calc(var(--f,0) * 112px));transition:transform 1s cubic-bezier(.3,.1,.2,1)}",
    ".dt-btrain svg{display:block}",
    ".dt-bbig{font-size:19px;font-weight:700;margin-top:3px}.dt-bbig b{font-size:24px;color:var(--dt-red)}",
    ".dt-bsmall{font-size:14px}.dt-barr .dt-bbig{color:var(--dt-red)}",
    ".dt-bday{margin-top:6px;padding-top:6px;border-top:2px dotted #e2d8c4;font-size:13px;font-weight:700}",
    ".dt-bfull{border-top:0;margin-top:2px;padding-top:0;color:#c0700b}",
    // the game
    "html.dt-open,html.dt-open body{overflow:hidden}",
    // a big window: a phone-sized column, centred, over a dimmed backdrop (clicking it closes the game)
    ".dt-backdrop{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147482999;background:rgba(20,24,40,.6);cursor:pointer}",
    ".dt-backdrop[hidden]{display:none}",
    ".dt-root.dt-wide{left:50%;right:auto;width:440px;margin-left:-220px;top:16px;bottom:16px;border-radius:26px;",
    "box-shadow:0 0 0 4px #2b3150,0 24px 70px rgba(0,0,0,.55)}",
    ".dt-root{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;overflow:hidden;background:#cfe9f7;--g:128px;--up1:76px;--up2:30px;font-size:15px;touch-action:manipulation}",
    ".dt-defs-box{position:absolute;width:0;height:0;overflow:hidden}",
    "html body:not(.dt-nobody) .dt-root *::-webkit-scrollbar{display:none;width:0;height:0;background:transparent}",
    ".dt-root *{scrollbar-width:none}",
    ".dt-scene{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;transition:opacity .38s}.dt-dim{opacity:.15}",
    ".dt-sky{position:absolute;left:0;top:0;right:0;bottom:0}",
    ".dt-sun{position:absolute;right:12%;top:210px;width:84px;height:84px;border-radius:50%;background:radial-gradient(circle,var(--sun,#fff6c2) 0 42%,",
    "rgba(255,255,255,.45) 43% 58%,rgba(255,255,255,0) 60%)}",
    ".dt-layer{position:absolute;left:0;background-repeat:repeat-x;background-position:left bottom;will-change:transform;",
    "animation:dt-scroll linear infinite}",
    "@keyframes dt-scroll{from{transform:translate3d(0,0,0)}to{transform:translate3d(var(--dt-t),0,0)}}",
    ".dt-clouds{top:200px;height:170px;width:calc(100% + 900px);background-size:900px 170px;--dt-t:-900px;animation-duration:200s}",
    ".dt-base{position:absolute;left:0;right:0;bottom:calc(var(--g) + 8px)}.dt-farbase{height:calc(var(--up1) + 3px)}.dt-midbase{height:calc(var(--up2) + 3px)}",
    ".dt-far{bottom:calc(var(--g) + 10px + var(--up1));height:300px;width:calc(100% + 720px);background-size:720px 300px;--dt-t:-720px;animation-duration:240s}",
    ".dt-mid{bottom:calc(var(--g) + 10px + var(--up2));height:200px;width:calc(100% + 600px);background-size:600px 200px;--dt-t:-600px;animation-duration:80s}",
    ".dt-near{bottom:calc(var(--g) + 8px);height:120px;width:calc(100% + 480px);background-size:480px 120px;--dt-t:-480px;animation-duration:28s}",
    ".dt-snow{position:absolute;left:0;right:0;top:-300px;bottom:0;background-size:300px 300px;animation:dt-fall 14s linear infinite;will-change:transform;pointer-events:none}",
    "@keyframes dt-fall{to{transform:translate3d(-60px,300px,0)}}",
    ".dt-ground{position:absolute;left:0;right:0;bottom:0;height:var(--g);overflow:hidden}",
    ".dt-fore{top:4px;height:120px;width:calc(100% + 480px);background-size:480px 120px;--dt-t:-480px;animation-duration:12s}",
    ".dt-pillars{display:none;top:0;bottom:0;width:calc(100% + 240px);--dt-t:-240px;animation-duration:6s;",
    "background-image:linear-gradient(90deg,transparent 0 100px,#b9bdc6 100px 104px,#d3d6dc 104px 126px,#aeb2bb 126px 130px,transparent 130px)!important;background-size:240px 100%}",
    ".dt-track{position:absolute;left:0;right:0;bottom:calc(var(--g) - 8px);height:18px;overflow:hidden}",
    ".dt-sleepers{top:4px;height:14px;width:calc(100% + 32px);--dt-t:-32px;animation-duration:.8s;",
    "background:repeating-linear-gradient(90deg,#6b4f3e 0 11px,transparent 11px 32px) 0 2px/32px 6px repeat-x,linear-gradient(#a59a8e,#857a70)}",
    ".dt-rail{position:absolute;left:0;right:0;top:0;height:6px;border-radius:2px;background:linear-gradient(#f2f4f7,#9aa1ac 60%,#6e7480)}",
    ".dt-beam{display:none;position:absolute;left:0;right:0;bottom:calc(var(--g) - 22px);height:42px;background:linear-gradient(#e3e6ea,#bfc3cb);",
    "box-shadow:inset 0 -7px 0 rgba(0,0,0,.12),inset 0 2px 0 #fff}",
    ".dt-mono .dt-beam,.dt-mono .dt-pillars{display:block}.dt-mono .dt-track{display:none}",
    ".dt-trainbox{position:absolute;right:4%;bottom:calc(var(--g) + 9px);animation:dt-bob 1.5s ease-in-out infinite}",
    ".dt-train{display:flex;flex-wrap:nowrap;align-items:flex-end;width:max-content}.dt-car{display:block;flex:none;margin-left:-3px;overflow:visible}",
    "@keyframes dt-bob{50%{transform:translateY(-1.5px)}}",
    // Wheels, rods and steam are SVG transforms, which repaint the whole car each frame: they move only while the
    // train pulls in or out of a station. Idle, the train just bobs (an HTML-level transform, composited).
    ".dt-arriving .dt-wh,.dt-leaving .dt-wh{animation:dt-spin 1s linear infinite}@keyframes dt-spin{to{transform:rotate(360deg)}}",
    ".dt-arriving .dt-rod,.dt-leaving .dt-rod{animation:dt-rod 1s linear infinite}",
    "@keyframes dt-rod{0%{transform:translate(0,-3px)}25%{transform:translate(3px,0)}50%{transform:translate(0,3px)}75%{transform:translate(-3px,0)}100%{transform:translate(0,-3px)}}",
    ".dt-puff{opacity:0}.dt-arriving .dt-puff,.dt-leaving .dt-puff{animation:dt-puff 1.8s ease-out infinite}.dt-root .dt-p2{animation-delay:.6s}.dt-root .dt-p3{animation-delay:1.2s}",
    "@keyframes dt-puff{0%{opacity:.95;transform:translate(0,0) scale(.4)}100%{opacity:0;transform:translate(-46px,-24px) scale(2)}}",
    ".dt-who{font-family:'Noto Color Emoji','Apple Color Emoji',sans-serif}",
    ".dt-stopped .dt-layer,.dt-stopped .dt-wh,.dt-stopped .dt-rod,.dt-stopped .dt-trainbox,.dt-paused *{animation-play-state:paused!important}",
    // the station that slides in on arrival
    ".dt-stn{position:absolute;left:0;right:0;bottom:calc(var(--g) + 10px);height:250px;pointer-events:none;transform:translateX(110%)}",
    ".dt-pf{position:absolute;left:0;right:0;bottom:calc(var(--g) - 10px);height:36px;transform:translateX(110%);",
    "background:linear-gradient(#ece6d9 0 7px,#f2c53d 7px 11px,#d8d0bf 11px 13px,#bdb3a1 13px 30px,#a69c8a 30px);box-shadow:0 -1px 0 #fff inset}",
    ".dt-arriving .dt-stn,.dt-arriving .dt-pf{animation:dt-slidein 1.7s cubic-bezier(.12,.6,.25,1) forwards}",
    ".dt-at .dt-stn,.dt-at .dt-pf{transform:none}",
    ".dt-leaving .dt-stn,.dt-leaving .dt-pf{animation:dt-slideout 1.5s cubic-bezier(.55,0,.85,.55) forwards}",
    "@keyframes dt-slidein{from{transform:translateX(110%)}to{transform:none}}@keyframes dt-slideout{from{transform:none}to{transform:translateX(-115%)}}",
    ".dt-roof{position:absolute;left:-8px;right:-8px;top:0;height:22px;background:linear-gradient(#6b7582,#525b67);border-radius:5px;",
    "border-bottom:7px solid var(--rc);box-shadow:0 4px 8px rgba(0,0,0,.18)}",
    ".dt-board{position:absolute;left:50%;top:30px;transform:translateX(-50%);padding:5px 16px 6px;background:#fff;border:2.5px solid var(--dt-ink);",
    "border-radius:8px;font-size:17px;font-weight:700;white-space:nowrap;box-shadow:0 3px 0 rgba(0,0,0,.15);border-bottom:6px solid var(--rc)}",
    ".dt-board::before,.dt-board::after{content:'';position:absolute;top:-11px;width:3px;height:9px;background:#525b67;left:22%}.dt-board::after{left:auto;right:22%}",
    ".dt-pillar{position:absolute;top:28px;bottom:0;width:10px;background:linear-gradient(90deg,#8f98a3,#d2d7dd 60%,#a3abb5)}",
    // the top bar
    ".dt-ui{position:absolute;left:0;top:0;right:0;bottom:0;z-index:3;display:flex;flex-direction:column;align-items:center;gap:6px;",
    "padding:6px 8px 10px;pointer-events:none}.dt-ui>*{pointer-events:auto}.dt-ui>.dt-hud{pointer-events:none}",
    ".dt-top{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px;width:100%;flex:none}.dt-top .dt-stat{margin-right:auto}.dt-room{flex:1 1 0;min-height:0}",
    ".dt-grow{flex:1 1 0;min-width:0}",
    ".dt-stat{display:flex;align-items:center;gap:5px;min-width:0;flex:0 1 auto;min-height:44px;padding:2px 12px;border-radius:22px;background:rgba(255,248,234,.94);",
    "border:2.5px solid var(--dt-ink);box-shadow:0 3px 0 var(--dt-ink);font-size:14px;white-space:nowrap;overflow:hidden}",
    ".dt-waitbtn{background:#fff1c7!important;animation:dt-bump .6s 2}",
    ".dt-waitbtn[hidden]{display:none}.dt-coins{flex:none;white-space:nowrap}.dt-coins b{font-size:17px}.dt-coins.dt-bump{display:inline-block}",
    
    ".dt-slap{position:absolute;right:8px;top:9px;font-size:11px;font-weight:700;color:#5a6078;background:var(--dt-paper2);border-radius:9px;padding:1px 7px}",
    
    ".dt-btn{min-height:44px;min-width:44px;padding:6px 14px;border-radius:14px;border:2.5px solid var(--dt-ink);background:#fff;",
    "box-shadow:0 3px 0 var(--dt-ink);font-size:15px;font-weight:700;cursor:pointer;line-height:1.2}",
    ".dt-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--dt-ink)}",
    ".dt-btn:disabled{cursor:default}",
    ".dt-tb{flex:none;min-width:44px;min-height:46px;padding:2px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "font-size:19px;border-radius:15px;background:rgba(255,248,234,.94)}",
    ".dt-tb small{font-size:9px;line-height:1;margin-top:2px}.dt-x{background:#ffe3dc}.dt-gear small{display:none}",
    ".dt-primary{background:var(--dt-gold)}.dt-danger{background:#ffb3a6}",
    // the station sign (駅名標) and progress
    ".dt-hud{flex:none;width:min(100%,400px)}",
    ".dt-sign{position:relative;background:#fff;border:2.5px solid var(--dt-ink);border-radius:12px;padding:6px 10px 6px;text-align:center;",
    "box-shadow:0 4px 0 rgba(43,49,80,.25)}",
    ".dt-flip{animation:dt-flip .5s ease-out}@keyframes dt-flip{0%{transform:rotateX(80deg);opacity:.3}100%{transform:none;opacity:1}}",
    ".dt-sno{position:absolute;left:8px;top:8px;min-width:30px;height:30px;padding:0 4px;border-radius:7px;border:3px solid var(--rc);",
    "font-size:14px;font-weight:700;line-height:24px;text-align:center;background:#fff}",
    ".dt-sbig{font-size:34px;font-weight:700;letter-spacing:.14em;line-height:1.15;padding-left:.14em;margin-top:2px}",
    ".dt-sign.dt-signlong{padding-top:34px}.dt-signlong .dt-sbig{margin-top:0}",
    ".dt-long{font-size:27px;letter-spacing:.08em;margin-top:8px}.dt-sbig.dt-xlong{font-size:20px;letter-spacing:.02em;margin:10px 30px 2px;line-height:1.25}",
    ".dt-skan{font-size:17px;font-weight:700;line-height:1.1;margin-top:-1px}.dt-skan rt{font-size:9px;font-weight:400}",
    ".dt-sband{height:17px;margin:5px -10px 3px;background:var(--rc);color:#fff;font-size:11px;font-weight:700;line-height:17px;letter-spacing:.1em}",
    ".dt-snav{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#4a5068}",
    ".dt-legs{display:flex;justify-content:space-between;padding:0 22%;height:10px}.dt-legs i{width:7px;height:10px;background:#59606f;border-radius:0 0 2px 2px}",
    ".dt-prog{display:flex;align-items:center;gap:10px;margin-top:2px;padding:6px 12px;border-radius:20px;background:rgba(255,255,255,.94);",
    "border:2.5px solid var(--dt-ink);box-shadow:0 3px 0 rgba(43,49,80,.25)}",
    ".dt-pleft{flex:none;font-size:15px;font-weight:700}.dt-pleft b{font-size:22px;color:var(--dt-red)}",
    ".dt-here{justify-content:center}.dt-here .dt-pleft{color:var(--dt-red);font-size:18px}",
    ".dt-ptrack{position:relative;flex:1;height:22px;min-width:0}",
    ".dt-ptrack::before{content:'';position:absolute;left:0;right:0;top:13px;height:6px;border-radius:3px;background:#e9e2d2}",
    ".dt-pfill{position:absolute;left:0;right:0;top:13px;height:6px;border-radius:3px;background:var(--lc,var(--dt-green));transform-origin:left center}",
    ".dt-notch::after{content:'';position:absolute;left:0;right:0;top:13px;height:6px;",
    "background:repeating-linear-gradient(90deg,transparent 0 calc(100% / var(--n) - 2px),rgba(255,255,255,.9) calc(100% / var(--n) - 2px) calc(100% / var(--n)))}",
    ".dt-ptrain{position:absolute;bottom:7px}.dt-ptrain svg{display:block}",
    ".dt-pnext{flex:0 1 auto;max-width:42%;word-break:break-all;text-align:center;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--dt-paper2)}",
    // the week strip
    ".dt-week{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px;max-width:100%;padding:5px 12px 6px;margin:0;border-radius:18px;",
    "background:rgba(255,255,255,.92);border:2px solid rgba(43,49,80,.5);box-shadow:0 2px 0 rgba(43,49,80,.3);font-size:12px;cursor:pointer}",
    ".dt-wrow{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:0 12px;line-height:1.3}",
    ".dt-wcard b,.dt-wlbl b{font-size:15px;color:var(--dt-red)}.dt-wcard{white-space:nowrap}.dt-wlbl{white-space:nowrap}",
    ".dt-wdots{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 5px}",
    ".dt-wd{display:flex;flex-direction:column;align-items:center;font-size:10px;color:#7a7f92}",
    ".dt-wd i{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px dashed #c9c0ae;",
    "font-style:normal;font-size:12px;color:#fff}",
    ".dt-won i{background:var(--dt-gold);border:2px solid #c78a12}.dt-wtoday{color:var(--dt-ink);font-weight:700}",
    // arrival: flight, stamp sheet
    ".dt-flyer{position:absolute;left:0;right:0;top:32%;z-index:6;height:140px;pointer-events:none}",
    ".dt-plane{position:absolute;left:0;top:30px;width:130px;animation:dt-fly 2.6s ease-in-out forwards}",
    "@keyframes dt-fly{from{transform:translate(-150px,60px) rotate(-6deg)}to{transform:translate(calc(100vw + 20px),-50px) rotate(-12deg)}}",
    ".dt-flytxt{position:absolute;left:0;right:0;margin:0 auto;width:max-content;top:96px;white-space:nowrap;padding:8px 18px;border-radius:20px;background:#fff;",
    "border:2.5px solid var(--dt-ink);box-shadow:0 3px 0 var(--dt-ink);font-size:18px;font-weight:700;animation:dt-pop .5s .3s cubic-bezier(.2,1.6,.4,1) both}",
    ".dt-arr{position:absolute;left:0;top:0;right:0;bottom:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:60px 16px 16px;",
    "background:rgba(30,34,56,.38);animation:dt-fade .3s}",
    ".dt-sheet{position:relative;width:min(100%,330px);padding:14px 16px 16px;text-align:center;background:#fffdf6;border:3px solid var(--dt-ink);",
    "border-radius:22px;box-shadow:0 6px 0 var(--dt-ink);animation:dt-up .45s cubic-bezier(.2,1.3,.5,1);",
    "background-image:radial-gradient(rgba(43,49,80,.06) 1px,transparent 1.6px);background-size:14px 14px}",
    ".dt-ah{font-size:21px;font-weight:700}.dt-ah rt{font-size:10px}.dt-asub{font-size:12px;color:#7a7f92}",
    ".dt-pad{position:relative;width:184px;height:184px;margin:8px auto 4px}",
    ".dt-ring{position:absolute;left:8px;top:8px;right:8px;bottom:8px;border-radius:50%;border:2.5px dashed #ddd2bf}",
    ".dt-inkspread{position:absolute;left:12%;top:12%;right:12%;bottom:12%;border-radius:50%;background:radial-gradient(circle,var(--ink) 0 35%,rgba(255,255,255,0) 70%);opacity:0}",
    ".dt-bigst{position:absolute;left:0;top:0;right:0;bottom:0;opacity:0}.dt-bigst svg,.dt-stw svg,.dt-bigstamp svg{display:block;width:100%;height:100%}",
    ".dt-pressed .dt-bigst{animation:dt-press .5s cubic-bezier(.2,1.6,.4,1) forwards}",
    "@keyframes dt-press{0%{opacity:0;transform:scale(1.3) rotate(calc(var(--tilt) + 9deg))}55%{opacity:1;transform:scale(.95) rotate(var(--tilt))}",
    "100%{opacity:1;transform:rotate(var(--tilt))}}",
    ".dt-pressed .dt-inkspread{animation:dt-spread .7s ease-out}",
    "@keyframes dt-spread{0%{opacity:.5;transform:scale(.5)}100%{opacity:0;transform:scale(1.55)}}",
    ".dt-hanko{position:absolute;left:50%;top:-74px;width:150px;margin-left:-75px;opacity:0;z-index:2;pointer-events:none}",
    ".dt-hanko svg{display:block;width:100%}",
    ".dt-hdown .dt-hanko{animation:dt-hanko 1.05s ease-in-out forwards}",
    "@keyframes dt-hanko{0%{opacity:0;transform:translateY(-170px)}15%{opacity:1}38%{transform:translateY(0)}44%{transform:translateY(5px) scaleY(.95)}",
    "58%{opacity:1;transform:translateY(-8px)}100%{opacity:0;transform:translateY(-190px)}}",
    ".dt-pon{position:absolute;right:-22px;top:-4px;font-size:30px;font-weight:700;color:var(--dt-red);opacity:0;-webkit-text-stroke:1px #fff;",
    "text-shadow:0 2px 0 #fff}.dt-pressed .dt-pon{animation:dt-ponpop .8s cubic-bezier(.2,1.6,.4,1) forwards}",
    "@keyframes dt-ponpop{0%{opacity:0;transform:scale(.3) rotate(0)}60%{opacity:1;transform:scale(1.15) rotate(14deg)}100%{opacity:1;transform:scale(1) rotate(12deg)}}",
    ".dt-gift{display:flex;align-items:center;justify-content:center;gap:10px;opacity:0;margin:2px 0 6px}",
    ".dt-gift.dt-on{animation:dt-pop .55s cubic-bezier(.2,1.6,.4,1) forwards}",
    ".dt-gemoji{font-size:46px;line-height:1}.dt-gtxt{font-size:18px;font-weight:700;text-align:left}.dt-gtxt small{font-size:11px;color:#7a7f92}",
    ".dt-coinup{position:absolute;right:16px;top:58px;font-size:20px;font-weight:700;color:#b07a06;opacity:0}",
    ".dt-coinup.dt-on{animation:dt-coin 1s ease-out forwards}",
    "@keyframes dt-coin{0%{opacity:0;transform:translateY(16px) scale(.6)}35%{opacity:1;transform:translateY(-4px) scale(1.15)}100%{opacity:1;transform:none}}",
    ".dt-go{width:100%;font-size:18px;margin-top:4px;animation:dt-fade .3s}.dt-all{margin-top:10px;font-size:15px;background:#fff}",
    ".dt-allsheet{max-height:100%;overflow-y:auto}.dt-allcoins{font-size:16px;margin:4px 0 10px}.dt-allcoins b{color:#b07a06;font-size:20px}",
    ".dt-allgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 6px;margin-bottom:12px}",
    ".dt-allone{position:relative;display:flex;flex-direction:column;align-items:center;min-width:0}.dt-allone .dt-stw{width:76px;height:76px}",
    ".dt-allgift{position:absolute;right:2px;top:46px;font-size:24px}.dt-allname{font-size:13px;font-weight:700}.dt-allname rt{font-size:11px;font-weight:400}",
    // while stamps are pressed the sheet has its own ✕ (closing keeps what was pressed) and the bar's other buttons hide
    ".dt-busy .dt-top .dt-tb:not(.dt-x){visibility:hidden}.dt-arrx{position:absolute;right:8px;top:6px;z-index:2}",
    "@keyframes dt-pop{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:none}}",
    "@keyframes dt-up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}",
    "@keyframes dt-fade{from{opacity:0}to{opacity:1}}",
    // panels
    ".dt-panel{position:absolute;left:0;top:0;right:0;bottom:0;z-index:20;display:flex;flex-direction:column;background:var(--dt-paper);",
    "background-image:radial-gradient(rgba(43,49,80,.055) 1px,transparent 1.6px);background-size:16px 16px;animation:dt-up .28s ease-out}",
    ".dt-phead{display:flex;align-items:center;gap:10px;padding:6px 8px;background:#fff3d6;border-bottom:3px solid var(--dt-ink);flex:none}",
    ".dt-back{padding:4px 10px;display:flex;flex-direction:column;align-items:center;font-size:14px}.dt-back small{font-size:9px}",
    ".dt-ptitle{flex:1;min-width:0;font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".dt-pcoins{flex:none;font-size:14px;padding:6px 12px;border-radius:16px;background:#fff;border:2px solid var(--dt-ink)}",
    ".dt-pbody{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 12px 28px}",
    ".dt-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.dt-tabs .dt-tab{flex:1 1 auto}",
    ".dt-tab{padding:4px 2px;font-size:12.5px;white-space:nowrap;border-radius:14px;background:#f1e5c9;box-shadow:0 2px 0 var(--dt-ink)}",
    ".dt-tab.dt-on{background:var(--dt-gold);transform:translateY(2px);box-shadow:none}",
    // stamp book
    ".dt-count{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;margin:0 2px 10px}.dt-count b{font-size:20px;color:var(--dt-red)}",
    ".dt-cbar{flex:1;height:10px;border-radius:5px;background:#eadfc8;overflow:hidden}.dt-cbar i{display:block;height:100%;background:var(--dt-red);transform-origin:left}",
    ".dt-reg{margin:0 0 14px;padding:8px;border-radius:16px;background:rgba(255,255,255,.7);border:2px solid #eadcc0}",
    ".dt-regh{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:700;margin:0 4px 6px}",
    ".dt-regh i{width:14px;height:14px;border-radius:50%;background:var(--c)}.dt-regh small{font-weight:400;color:#7a7f92}",
    ".dt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 4px}",
    ".dt-cell{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:1px;padding:2px 0;min-width:0;",
    "border-radius:12px}.dt-cgot{cursor:pointer}.dt-cgot:active{background:rgba(43,49,80,.06)}",
    ".dt-circ{position:relative;display:block;flex:none;width:70px;height:70px;max-width:100%;margin-bottom:2px}",
    ".dt-circ>.dt-stw,.dt-circ>.dt-empty{position:absolute;left:0;top:0;width:100%;height:100%}",
    ".dt-stw{display:block;width:70px;height:70px;max-width:100%}.dt-circ .dt-stw{max-width:none}",
    ".dt-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;border-radius:50%;",
    "border:2.5px dashed #cfc5b2;color:#c9bfab;font-size:15px;line-height:1.1}",
    ".dt-cname{font-size:12px;font-weight:700;line-height:1.2}.dt-ckana{font-size:11px;line-height:1.2;color:#5a6078;white-space:nowrap}",
    ".dt-none .dt-cname,.dt-none .dt-ckana{color:#b3a996}",
    ".dt-lapb{position:absolute;top:0;right:0;z-index:1;white-space:nowrap;font-size:9px;color:#fff;border-radius:8px;padding:1px 5px;line-height:1.4}",
    ".dt-route{background:#fff;border:2.5px solid var(--dt-ink);border-radius:18px;padding:6px}.dt-route svg{display:block;width:100%;height:auto}",
    ".dt-ping{animation:dt-ping 1.6s ease-out 3;transform-box:fill-box;transform-origin:center}",
    ".dt-bigview{padding:22px 18px 18px}.dt-bigstamp{width:210px;height:210px;margin:0 auto 6px;animation:dt-pop .4s cubic-bezier(.2,1.5,.4,1)}",
    ".dt-bvname{font-size:26px;font-weight:700}.dt-bvname rt{font-size:12px}",
    ".dt-bvgift{display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;margin:6px 0}.dt-bvgift span{font-size:38px}",
    ".dt-wide{display:block;width:100%}",
    ".dt-bvlap{display:inline-block;color:#fff;border-radius:12px;padding:2px 12px;font-size:13px;margin-bottom:12px}",
    // stamp card
    ".dt-rcard{max-width:420px;margin:4px auto 14px;padding:12px 12px 26px;background:#fff;border:2.5px solid var(--dt-ink);border-radius:18px;",
    "box-shadow:0 4px 0 var(--dt-ink);background-image:linear-gradient(#ffe7a8,#ffe7a8);background-size:100% 64px;background-repeat:no-repeat}",
    ".dt-rhead{display:flex;flex-direction:column;align-items:center;margin-bottom:14px}.dt-rhead b{font-size:22px}",
    ".dt-rno{font-size:12px;padding:0 10px;border-radius:10px;background:#fff;border:2px solid var(--dt-ink)}.dt-rsub{font-size:12px;color:#7a6a40}",
    ".dt-boxes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px 8px}",
    ".dt-box{position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border:2px dashed #d8ccb3;border-radius:12px;",
    "font-size:17px;color:#cdc1a8;background:#fffdf7}",
    ".dt-box svg{width:92%;height:92%;transform:rotate(-10deg)}.dt-got{border:2px solid #f2c0b6;background:#fff7f3}",
    ".dt-nextbox{border-color:var(--dt-gold);border-style:dashed;background:#fffbe9;color:#d39b1a}",
    ".dt-goal{border:2.5px solid var(--dt-gold);background:#fff1c2}.dt-gift10{font-size:26px}",
    ".dt-bdate{position:absolute;left:-6px;right:-6px;bottom:-18px;font-size:10px;color:#8a8270;text-align:center;white-space:nowrap}",
    ".dt-rfoot{text-align:center;margin-top:28px;font-size:15px;font-weight:700}.dt-rfoot b{color:var(--dt-red);font-size:19px}",
    ".dt-reward{display:flex;align-items:center;gap:12px;max-width:420px;margin:0 auto 12px;padding:10px 14px;border-radius:16px;background:#fff;",
    "border:2px solid #eadcc0;font-size:14px}.dt-rbig{font-size:44px;line-height:1}",
    ".dt-pile{display:flex;align-items:center;gap:16px;max-width:420px;margin:0 auto 12px;padding:10px 14px;font-size:14px}",
    ".dt-pilecards{position:relative;width:52px;height:40px;flex:none}",
    ".dt-pilecards i{position:absolute;left:0;bottom:0;width:44px;height:32px;border-radius:5px;background:#fff;border:2px solid var(--dt-ink);",
    "background-image:linear-gradient(#ffe7a8,#ffe7a8);background-size:100% 9px;background-repeat:no-repeat}",
    ".dt-specials{max-width:420px;margin:0 auto;padding:10px 14px;border-radius:16px;background:rgba(255,255,255,.7);font-size:13px;font-weight:700}",
    ".dt-sprow{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin-top:6px;font-size:24px;text-align:center}",
    ".dt-spoff{color:#cfc5b2;font-size:18px;line-height:32px;border-radius:50%;background:#efe6d3}",
    // shop
    ".dt-show{position:relative;height:118px;margin:-10px -12px 12px;overflow-x:auto;overflow-y:hidden;background:linear-gradient(#bfe4f7,#eef8fd);",
    "border-bottom:3px solid var(--dt-ink)}",
    ".dt-show::after{content:'';position:absolute;left:0;right:0;bottom:12px;height:5px;background:linear-gradient(#eef0f3,#8f96a1)}",
    ".dt-showtrain{position:absolute;right:14px;bottom:16px;z-index:1}.dt-showtrain .dt-train{display:flex;align-items:flex-end}",
    ".dt-items{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}",
    ".dt-tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    ".dt-item{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 10px;border-radius:16px;background:#fff;border:2.5px solid var(--dt-ink);",
    "box-shadow:0 3px 0 var(--dt-ink)}",
    ".dt-tile{flex-direction:column;gap:4px;padding:8px 4px;text-align:center}",
    ".dt-iart{flex:none;display:flex;align-items:flex-end;justify-content:center;min-width:84px}.dt-tile .dt-iart{min-width:0}",
    ".dt-iname{flex:1;min-width:0;font-size:15px;font-weight:700}.dt-tile .dt-iname{font-size:13px}",
    ".dt-ibtn{flex:none;padding:4px 10px;font-size:14px;display:flex;flex-direction:column;align-items:center;justify-content:center}",
    ".dt-tile .dt-ibtn{width:100%;padding:4px 2px;font-size:13px}",
    ".dt-ibtn small{font-size:9.5px;font-weight:400}.dt-ibuy{background:var(--dt-gold)}.dt-iuse{background:#dff3e4}",
    ".dt-ion{background:var(--dt-green);color:#fff!important;box-shadow:none;transform:translateY(2px)}",
    ".dt-iton{background:#f1fbf3}.dt-poor{opacity:.55}.dt-poor .dt-ibtn{background:#eee}",
    ".dt-swatch{display:block;width:40px;height:40px;border-radius:50%;border:2.5px solid var(--dt-ink);box-shadow:inset -5px -5px 0 rgba(0,0,0,.14),inset 4px 4px 0 rgba(255,255,255,.35)}",
    ".dt-carsbox{display:flex;flex-direction:column;gap:12px}.dt-hint{font-size:14px;text-align:center;color:#5a6078;margin:2px 0 8px}",
    ".dt-row{display:flex;gap:10px;justify-content:center;align-items:center}.dt-stepper .dt-btn{font-size:22px;width:56px}",
    ".dt-stepn{min-width:90px;text-align:center;font-size:16px}.dt-stepn b{font-size:30px}",
    ".dt-seats{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}",
    ".dt-seatrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border-radius:14px;background:#e9f5fb;border:2px solid #b9d9ea}",
    ".dt-seatlbl{width:60px;font-size:12px;font-weight:700}",
    ".dt-seat{width:46px;height:44px;min-width:44px;padding:0;font-size:24px;background:#cfeaf6;border-radius:10px;border-width:2px;box-shadow:inset 0 -6px 0 rgba(255,255,255,.6)}",
    ".dt-picked{outline:4px solid var(--dt-gold);outline-offset:2px}.dt-pe{font-size:32px;line-height:1.1}",
    // modals, toast, dev
    ".dt-modal{position:absolute;left:0;top:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;",
    "background:rgba(30,34,56,.45);animation:dt-fade .2s}",
    ".dt-mbox{width:min(100%,340px);max-height:100%;overflow-y:auto;padding:18px;text-align:center;background:var(--dt-paper);border:3px solid var(--dt-ink);",
    "border-radius:22px;box-shadow:0 5px 0 var(--dt-ink);animation:dt-pop .3s cubic-bezier(.2,1.5,.5,1)}",
    ".dt-askq{font-size:19px;font-weight:700;margin-bottom:8px}.dt-askp{font-size:26px;font-weight:700;margin-bottom:14px}",
    ".dt-toast{position:absolute;left:50%;top:40%;z-index:50;transform:translateX(-50%);padding:10px 20px;border-radius:20px;background:#fff;",
    "border:2.5px solid var(--dt-ink);box-shadow:0 3px 0 var(--dt-ink);font-size:18px;font-weight:700;white-space:nowrap;animation:dt-pop .35s cubic-bezier(.2,1.6,.4,1);pointer-events:none}",
    ".dt-devgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dt-devgrid .dt-btn{font-size:13px;padding:6px}",
    // lines: the picker, headers, shop cards
    ".dt-lpick{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}",
    ".dt-lchip{display:flex;align-items:center;gap:6px;padding:4px 12px;font-size:13px;border-radius:22px;background:#fff;box-shadow:0 2px 0 var(--dt-ink)}",
    ".dt-lchip i{width:14px;height:14px;border-radius:50%;background:var(--lc);flex:none}.dt-lchip small{font-weight:400;font-size:11px}",
    ".dt-lchip.dt-on{background:var(--lc);color:#fff!important;transform:translateY(2px);box-shadow:none}.dt-lchip.dt-on i{background:#fff}",
    ".dt-locked{background:#efe8da;color:#8a8270!important;border-style:dashed;box-shadow:none}",
    ".dt-lhead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;margin:0 0 10px;padding:8px 12px;",
    "border-radius:16px;background:#fff;border:2.5px solid var(--lc);border-left-width:12px}",
    ".dt-lname{font-size:19px;font-weight:700}.dt-lname rt{font-size:10px;font-weight:400}",
    ".dt-gold{display:inline-block;font-size:12px;padding:1px 10px;border-radius:10px;background:linear-gradient(#ffe48a,#f2b51e);color:#5a3d00;",
    "border:1.5px solid #c98a10;vertical-align:middle}",
    ".dt-lnow{font-size:13px;font-weight:700;color:#4a5068}.dt-lboard{font-size:14px;padding:4px 12px}",
    ".dt-dirnote{text-align:center;font-size:14px;margin:0 0 8px}.dt-dirnote b{font-size:16px}",
    ".dt-aline{display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:700;color:#4a5068}",
    ".dt-aline i{width:22px;height:8px;border-radius:4px;background:var(--lc)}.dt-aline rt{font-size:9px;font-weight:400}",
    ".dt-lcard{position:relative;overflow:hidden;padding-left:20px}",
    ".dt-lcard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:var(--lc)}",
    ".dt-lcard .dt-iart{min-width:64px;width:64px}.dt-lcard .dt-iart svg{width:60px;height:44px}",
    ".dt-lnm{display:block;font-size:16px}.dt-lnm rt{font-size:10px;font-weight:400}",
    ".dt-linfo{display:block;font-size:12px;font-weight:400;color:#5a6078;margin-top:2px}.dt-fits{display:inline-flex;align-items:flex-end;gap:3px;font-size:11px;color:#8a8270;white-space:nowrap}",
    ".dt-ridebig svg{width:120px;height:88px}.dt-asks{font-size:17px;margin-bottom:12px}.dt-ask rt{font-size:10px}",
    // おりかえし and the way back: the train faces left, the world scrolls the other way, stations slide in from the left
    ".dt-banner{position:absolute;left:0;right:0;top:44%;z-index:25;margin:0 auto;width:max-content;max-width:90%;padding:10px 24px;border-radius:26px;",
    "background:#fff;border:3px solid var(--dt-ink);box-shadow:0 4px 0 var(--dt-ink);font-size:26px;font-weight:700;color:var(--dt-red);",
    "pointer-events:none;animation:dt-bannerin 1.9s cubic-bezier(.2,1.5,.4,1) forwards}",
    "@keyframes dt-bannerin{0%{opacity:0;transform:scale(.4) rotate(-8deg)}20%{opacity:1;transform:scale(1.1) rotate(3deg)}30%{transform:none}85%{opacity:1}100%{opacity:0}}",
    ".dt-back .dt-train{transform:scaleX(-1)}.dt-back .dt-trainbox{right:auto;left:4%}.dt-back .dt-trtxt{display:none}",
    ".dt-back .dt-layer{animation-direction:reverse}",
    ".dt-back .dt-stn,.dt-back .dt-pf{transform:translateX(-110%)}",
    ".dt-back .dt-arriving .dt-stn,.dt-back .dt-arriving .dt-pf{animation-name:dt-slidein-l}",
    ".dt-back .dt-leaving .dt-stn,.dt-back .dt-leaving .dt-pf{animation-name:dt-slideout-r}",
    ".dt-back .dt-at .dt-stn,.dt-back .dt-at .dt-pf{transform:none}",
    "@keyframes dt-slidein-l{from{transform:translateX(-110%)}to{transform:none}}@keyframes dt-slideout-r{from{transform:none}to{transform:translateX(115%)}}",
    // ぜんえき せいは！
    ".dt-fan{position:absolute;left:0;top:0;right:0;bottom:0;z-index:45;display:flex;align-items:center;justify-content:center;padding:16px;",
    "background:radial-gradient(circle at 50% 45%,rgba(255,226,140,.55),rgba(30,34,56,.6) 70%);animation:dt-fade .3s;overflow:hidden}",
    ".dt-confetti{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none}",
    ".dt-confetti i{position:absolute;top:-20px;width:10px;height:14px;border-radius:2px;opacity:0;animation:dt-conf 3s ease-in 2 both}",
    "@keyframes dt-conf{0%{opacity:1;transform:translate3d(0,0,0) rotate(0)}100%{opacity:.9;transform:translate3d(30px,110vh,0) rotate(var(--rot))}}",
    ".dt-fanbox{position:relative;width:min(100%,330px);padding:18px 16px 16px;text-align:center;border-radius:24px;background:#fffaf0;",
    "border:3px solid #c98a10;box-shadow:0 6px 0 #a06c08,0 0 0 6px #ffe48a;animation:dt-pop .6s cubic-bezier(.2,1.5,.4,1)}",
    ".dt-rays{position:absolute;left:50%;top:86px;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;opacity:.55;pointer-events:none;",
    "background:repeating-conic-gradient(rgba(255,214,90,.75) 0 10deg,rgba(255,214,90,0) 10deg 20deg);",
    "-webkit-mask:radial-gradient(circle,#000 30%,transparent 70%);mask:radial-gradient(circle,#000 30%,transparent 70%);animation:dt-spin 9s linear 1}",
    ".dt-medal{position:relative;width:118px;margin:0 auto;animation:dt-swing 1.4s ease-in-out .5s 2}.dt-medal svg{display:block;width:100%}",
    "@keyframes dt-swing{0%,100%{transform:rotate(0)}30%{transform:rotate(-7deg)}70%{transform:rotate(6deg)}}",
    ".dt-fantitle{position:relative;margin:6px 0 2px;font-size:30px;font-weight:700;color:#b06d00;letter-spacing:.06em;",
    "text-shadow:0 2px 0 #fff,0 3px 0 #f2c94c}",
    ".dt-fanline{position:relative;font-size:15px}.dt-fanline rt{font-size:10px}",
    ".dt-fancoins{position:relative;margin:6px 0 10px;font-size:24px;font-weight:700;color:#b07a06}",
        // sideways phones
    "@media " + SIDEWAYS + "{.dt-root{--g:46px;--up1:48px;--up2:18px}",
    ".dt-ui{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);grid-template-rows:auto auto 1fr;align-items:start}",
    ".dt-top{grid-column:1/3}.dt-hud{grid-column:1;grid-row:2;width:auto}.dt-room{display:none}",
    ".dt-week{grid-column:2;grid-row:2;justify-self:end}.dt-sbig{font-size:24px}.dt-skan{font-size:14px}",
    ".dt-clouds{top:50px}.dt-sun{top:70px}.dt-stn{height:210px}.dt-pad{width:150px;height:150px}.dt-sheet{padding:8px 14px 10px}",
    ".dt-arr{align-items:flex-start;overflow-y:auto}.dt-gemoji{font-size:34px}.dt-boxes{gap:20px 14px}.dt-rcard{max-width:520px}}",
    // short phones upright (the card view sits between AnkiDroid's bars): a smaller sign and ground
    "@media (orientation:portrait) and (max-height:660px){.dt-root{--g:112px}.dt-sbig{font-size:28px}.dt-long{font-size:23px}",
    ".dt-sign{padding:4px 10px}.dt-legs{height:6px}.dt-prog{padding:4px 12px}}",
    // reduced motion: no drifting, spinning or flying; things fade in instead
    "@media (prefers-reduced-motion:reduce){.dt-layer,.dt-snow,.dt-root .dt-wh,.dt-root .dt-rod,.dt-trainbox,.dt-root .dt-puff,.dt-ping,.dt-bping{animation:none!important}",
    ".dt-bubble{animation:dt-fade .3s both}.dt-bout{animation:dt-fadeout .4s forwards}.dt-btrain{transition:none}",
    ".dt-arriving .dt-stn,.dt-arriving .dt-pf{animation:dt-fade .4s forwards;transform:none}.dt-leaving .dt-stn,.dt-leaving .dt-pf{animation:dt-fadeout .3s forwards;transform:none}",
    ".dt-hanko,.dt-inkspread,.dt-plane,.dt-confetti,.dt-rays{display:none}.dt-medal,.dt-banner{animation:dt-fadein .3s forwards}.dt-pressed .dt-bigst{animation:dt-fadein .3s forwards;transform:rotate(var(--tilt))}",
    ".dt-pressed .dt-pon,.dt-gift.dt-on,.dt-coinup.dt-on,.dt-flytxt,.dt-sheet,.dt-panel,.dt-mbox,.dt-toast,.dt-bigstamp,.dt-flip,.dt-bump{animation:dt-fadein .3s forwards}",
    ".dt-pressed .dt-pon{transform:rotate(12deg)}}",
    "@keyframes dt-fadein{from{opacity:0}to{opacity:1}}@keyframes dt-fadeout{to{opacity:0}}"
  ].join("\n");

  // ---- entry ------------------------------------------------------------------------------------
  g.DenshaTabi = { mount: mount };
  if (g.DT_TEST === true) {
    g.DT_TEST = { KEY: KEY, DEV_DAY_KEY: DEV_DAY_KEY, STATIONS: STATIONS, REGIONS: REGIONS, MODELS: MODELS, COLORS: COLORS,
      PASSENGERS: PASSENGERS, SPECIALS: SPECIALS, fresh: fresh, load: load, save: save, tidy: tidy, today: today, dayNo: dayNo,
      dayOf: dayOf, segLength: segLength, studyK: studyK, bonusFor: bonusFor, advance: advance, payCard: payCard,
      pressStamp: pressStamp, stampBox: stampBox, buy: buy, equip: equip, seat: seat, windowsOf: windowsOf, owns: owns,
      priceOf: priceOf, devPastDay: devPastDay, devArrive: devArrive, mount: mount, regionOf: regionOf,
      LINES: LINES, board: board, activeId: activeId, pending: pending, lineOf: lineOf, migrate: migrate,
      setShift: function (n) { shift = n; } };
  }
  // On a card: mount into #densha in AnkiDroid's study screen (it defines ankidroid.userAction; the
  // previewer and desktop Anki do not).
  var slot = doc && doc.getElementById("densha");
  // or on desktop Anki's answer side with the add-on (DESK); without it desktop shows nothing.
  if (slot && (DESK || (g.ankidroid && typeof g.ankidroid.userAction === "function"))) mount(slot);
})();
