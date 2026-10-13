# でんしゃ たび (Train Trip) — design

A game on the back of Anki cards, for a child studying on a phone (AnkiDroid's new study screen). Studying
drives a little train around Japan, station by station, from 北海道 to 沖縄 and round again. Each new station
gives an **eki stamp** (えきスタンプ) for the stamp book and a souvenir (おみやげ). The UI is Japanese, in kana with
spaces between words (わかちがき), for an 8–10 year old.

## The key requirement: content-agnostic and scalable

The game knows **nothing** about the card it's on. It must work unchanged on any note type and any deck: 10
cards a day or 300. The only input is the card's id. So:

- **Per card:** the train moves forward. Nothing else depends on what was studied.
- **Pace scales itself:** the distance to the next station is set, when the train leaves a station, from the
  player's own recent pace, so that **one ordinary study day ≈ one station** whether the deck is tiny or huge.
- **Currency comes from days and stations, not from card counts**, so prices never need tuning per deck.

## Design goals

1. **Reward study, visibly, on every card**: the train moves on the card itself ("あと 6 で うつのみや").
2. **Reward regular days**: one study day ≈ one station, the first card of a day gives a bonus that grows with
   how many of the last 7 days were study days, and a stamp card fills one box per study day.
3. **Pull, never push**: nothing is lost, nothing expires, no streak resets, no randomness, no timers inside a
   day. Missing days just means a smaller bonus for a while. Hooks are positive: the next station is close,
   tomorrow's stamp box, the next souvenir, saving up for a shinkansen.
4. **Mobile only**: touch, portrait first (landscape must not break), 360×740 is the reference screen.
5. Quietly educational: stations are the 47 prefectures in order, with their kanji names (with furigana), so
   the stamp book becomes a map of Japan the child has "visited".

## Platform constraints (same as the Kanpeki Garden game)

- Runs only in **AnkiDroid's new study screen**: mount only when `globalThis.ankidroid` exists and
  `ankidroid.userAction` is a function. There is no usable JS API (we can't see which answer button was
  pressed), so a card pays when its **back is shown**.
- The answer buttons are native, outside the WebView; answering swaps the page and our DOM is gone at any
  moment. Save immediately on every change.
- Save in **localStorage** (AnkiDroid Settings → Advanced → "localStorage in Study Screen"). If missing or it
  throws, show one short line asking for that setting instead of the chip.
- Each card pays **once per day** via `data-card="{{CardID}}"`; the day starts at **04:00** local time (as in
  Anki), as `YYYY-MM-DD`. Showing the answer again, undo, re-opening: nothing.
- One plain-JS file, no dependencies, no network. Installed as `_densha.js` in `collection.media`. Fonts
  `_kleeone-regular.ttf` / `_kleeone-semibold.ttf` are in the media folder: use "Klee One" for Japanese
  (declare @font-face in the injected CSS), fall back to sans-serif.
- Art: drawn with CSS / inline SVG (the train, scenery, station sign, stamps), emoji for souvenirs and
  passengers (nothing newer than Emoji 13.0). All CSS injected by the script, every class/id prefixed `dt-`.
- Must coexist on the same card with other card games (e.g. Kanpeki Garden's `#kg` chip, which sits
  bottom-right): put this chip **bottom-left**, own localStorage keys, no global name clashes.

## The slot (end of the back template of any card type)

```html
<div id="densha" data-card="{{CardID}}"></div>
<script src="_densha.js"></script>
```

`data-dev="1"` adds test controls (test profile only). Without `data-card` the chip shows but nothing moves.

## Movement and pace

- Each paying card: **+1 step**.
- The **first paying card of a day** makes the day a **study day**, and adds a **daily bonus** of
  `round(segment × k / 14)` extra steps, where `k` = study days among the last 7 (today included, 1–7) and
  `segment` = the current segment's length. A daily studier (k = 7) gets half a station free each day; after
  a break it climbs back up. Show it as 「まいにち ボーナス ×k」.
- **Segment length** (steps from one station to the next) is fixed when the train leaves a station:
  `clamp(median of cards-paid per study day over the last 7 study days, 6, 200)`; with no history yet, 12.
  (Keep a per-day count of paid cards for this: `{ "YYYY-MM-DD": n }`, pruned to the last ~30 days.)
- Overshoot carries over: arriving with extra steps continues toward the next station (each segment's length
  is computed at the moment it starts). Several stations can be passed in one day; each counts as an arrival.
- After station 47 (沖縄) the next lap starts at 北海道 (「ひこうきで ほっかいどうへ！」, a little ✈️ moment);
  lap 2's stamps are a different ink colour (lap 1 red, 2 blue, 3 green, 4 purple, 5+ gold) — the stamp book
  shows the best lap's stamp per station plus a small 「2しゅうめ」 badge.

## Rewards

- **Arrival at a station**: **+10 🪙** (コイン), that station's **eki stamp** and its **souvenir**.
  Arrivals that happen on cards are *queued*: the card's bubble announces them, and the stamp is pressed (a
  satisfying ポン！ animation) when the child next opens the game — one at a time, in order.
- **Stamp card (しゅっせき カード)**: like a ラジオたいそう card, 10 boxes; each study day stamps a box (on the
  day's first card). A full card gives **+50 🪙** and a **special passenger** (fixed sequence: 🐼, 🦊, 🐧, 🐨,
  🦉, 🐯, 🦁, 🐸, then 🪙+50 only), then a fresh card starts. Old cards are kept in a little pile (count shown).
- **Shop** (🪙): customise the train.
  - Train models: 🚃 ふつう でんしゃ (start, free), 🚋 ろめん でんしゃ 40, 🚝 モノレール 60, 🚂 SL 120,
    🚄 しんかんせん 200. Each is drawn (CSS/SVG side view), not an emoji; owned models can be switched any time.
  - Extra cars: 30 each, up to 4 extra.
  - Paint colours: 8 colours at 20 each (applied to the current model's body).
  - Passengers: 🐶 🐱 🐰 🐻 🐹 🐮 🐷 🐵 at 15 each; they sit in the windows (special passengers too). The
    child drags/taps to choose which passenger sits in which window.

## The 47 stations

In JIS order (北海道 → 沖縄). Each: kanji name, kana, a souvenir emoji + kana name. Use this table:

| # | name | よみ | souvenir |
|---|---|---|---|
| 1 | 北海道 | ほっかいどう | 🦀 かに |
| 2 | 青森 | あおもり | 🍎 りんご |
| 3 | 岩手 | いわて | 🥢 わんこそば |
| 4 | 宮城 | みやぎ | 🎋 たなばた |
| 5 | 秋田 | あきた | 🐕 あきたいぬ |
| 6 | 山形 | やまがた | 🍒 さくらんぼ |
| 7 | 福島 | ふくしま | 🐂 あかべこ |
| 8 | 茨城 | いばらき | 🍈 メロン |
| 9 | 栃木 | とちぎ | 🍓 いちご |
| 10 | 群馬 | ぐんま | 🥬 キャベツ |
| 11 | 埼玉 | さいたま | 🍠 さつまいも |
| 12 | 千葉 | ちば | 🥜 らっかせい |
| 13 | 東京 | とうきょう | 🗼 とうきょうタワー |
| 14 | 神奈川 | かながわ | 🥟 ちゅうかまん |
| 15 | 新潟 | にいがた | 🍙 おこめ |
| 16 | 富山 | とやま | 🦑 ほたるいか |
| 17 | 石川 | いしかわ | ✨ きんぱく |
| 18 | 福井 | ふくい | 🦕 きょうりゅう |
| 19 | 山梨 | やまなし | 🍇 ぶどう |
| 20 | 長野 | ながの | 🏔️ やま |
| 21 | 岐阜 | ぎふ | 🌰 くり |
| 22 | 静岡 | しずおか | 🍵 おちゃ |
| 23 | 愛知 | あいち | 🍤 えびフライ |
| 24 | 三重 | みえ | 🦞 いせえび |
| 25 | 滋賀 | しが | 🛶 びわこ |
| 26 | 京都 | きょうと | ⛩️ じんじゃ |
| 27 | 大阪 | おおさか | 🐙 たこやき |
| 28 | 兵庫 | ひょうご | 🌉 おおはし |
| 29 | 奈良 | なら | 🦌 しか |
| 30 | 和歌山 | わかやま | 🐼 パンダ |
| 31 | 鳥取 | とっとり | 🐫 さきゅう |
| 32 | 島根 | しまね | 🐚 しじみ |
| 33 | 岡山 | おかやま | 🍑 もも |
| 34 | 広島 | ひろしま | 🦪 かき |
| 35 | 山口 | やまぐち | 🐡 ふぐ |
| 36 | 徳島 | とくしま | 💃 あわおどり |
| 37 | 香川 | かがわ | 🍜 うどん |
| 38 | 愛媛 | えひめ | 🍊 みかん |
| 39 | 高知 | こうち | 🐋 くじら |
| 40 | 福岡 | ふくおか | 🏮 やたい |
| 41 | 佐賀 | さが | 🏺 やきもの |
| 42 | 長崎 | ながさき | 🍰 カステラ |
| 43 | 熊本 | くまもと | 🐻 くま |
| 44 | 大分 | おおいた | ♨️ おんせん |
| 45 | 宮崎 | みやざき | 🥭 マンゴー |
| 46 | 鹿児島 | かごしま | 🌋 さくらじま |
| 47 | 沖縄 | おきなわ | 🍍 パイナップル |

Regions for scenery: 北海道 (1), 東北 (2–7), 関東 (8–14), 中部 (15–23), 近畿 (24–30), 中国 (31–35),
四国 (36–39), 九州・沖縄 (40–47).

## The card back

- A **chip** fixed **bottom-left**: a tiny train + 「あと N」 (steps to the next station) — or 「🚉 N」 when
  N arrivals are waiting to be stamped. Tap → opens the game full screen. Small; readable on dark or light
  cards.
- When the card pays, a **bubble** rises above the chip for ~2.5 s, then shrinks into it: a tiny progress line
  (current station → next station, the train sliding forward one notch), 「つぎは うつのみや」 /
  「あと 6」. On the day's first card an extra line: 「📮 スタンプカード ＋1 ・ まいにち ボーナス ×k」. On an
  arrival: 「うつのみや に とうちゃく！🚉」 and 「スタンプを おしに いこう」. `prefers-reduced-motion`: fade only.
- Already paid today: only the chip.

## The game (full screen overlay, opened from the chip)

- **Main view — the line (side view)**: the drawn train (current model, colour, cars, passengers in windows)
  on rails across a parallax landscape that matches the current region (北海道 snow and pines; 東北 apple
  orchards and rice fields; 関東 city skyline and Tokyo Tower; 中部 Mt Fuji and mountains; 近畿 temples,
  pagoda and torii; 中国 coast and islands; 四国 mikan groves and bridges; 九州・沖縄 volcanoes, palms, sea).
  The train gently idles (wheels, a puff of steam for the SL, a bob); the scenery drifts slowly. Above: a
  **progress strip** — 駅名標 style (the white Japanese station sign: big kana name, kanji with furigana,
  previous ← → next station) for the next station, and a bar 「あと N」.
- **Arrival sequence** (for each queued arrival, on open): the train pulls into a little station, the station
  sign shows that station, then the **stamp** comes down — ポン！ (scale/rotate/ink-spread, a slight
  random-looking but deterministic tilt), the souvenir pops out, 「＋10 🪙」. Tap to continue / next.
- **Top bar**: 🪙 n, 📮 stamp-card progress (n/10), current lap, buttons: スタンプちょう, おみせ, ✕. Touch
  targets ≥44 px.
- **スタンプちょう (stamp book)**: a 47-cell grid (or pages by region) showing collected stamps (round
  eki-stamp style SVG: station kanji + kana + souvenir emoji inside a double ring, ink colour by lap) and
  empty dotted circles with the station name greyed for the ones not yet reached. Tap a stamp → big view with
  the souvenir and its name. Plus a **ろせんず** (route map) tab: a stylised subway-map line (not a real map
  outline) of all 47 stations snaking down the screen, region colours, the train's position, visited stations
  filled.
- **しゅっせき カード** view: the current 10-box card with stamped boxes (dates small under each), the reward
  waiting at the end, and the pile count of completed cards.
- **おみせ**: tabs でんしゃ (models), いろ (paint), しゃりょう (cars), じょうきゃく (passengers). Can't-afford
  greyed. Equip/arrange after buying; nothing is consumed or lost.

## Save

localStorage key `densha-tabi`, JSON `v: 1`. Suggested shape (adjust if needed, document it in the script):

```js
{ v: 1,
  paid: { "<cardId>": "YYYY-MM-DD" },  // the day each card last paid (prune to today/yesterday on write)
  perDay: { "YYYY-MM-DD": 23 },         // paid cards per day (last ~30 days), for the pace
  days: ["YYYY-MM-DD", ...],             // study days, sorted, unique (ever; small)
  pos: { lap: 1, station: 0, step: 5, seg: 12 },  // at/after station index 0..46, steps into a segment of seg
  queue: [ { lap: 1, station: 3 } ],     // arrivals not yet stamped in the game
  stamps: { "3": 1 },                    // station index -> best (highest) lap stamped
  coins: 0,
  card: { boxes: ["YYYY-MM-DD", ...], done: 0 },  // stamp card in progress, cards completed
  owned: { models: ["local"], colors: [...], cars: 0, passengers: {...} },
  train: { model: "local", color: "...", cars: 0, seats: [...] } }
```

- **Never overwrite a save that can't be read** (invalid JSON or a newer `v`): the game is locked, nothing
  pays, the chip says 「いま ひらけないよ」, the stored value is untouched. Mend what can be mended.
- Write right after every change.

## Test hooks

- `data-dev="1"`: a ⚙ in the game's top bar with: 🪙+50, +1 study day in the past (for the stamp card),
  「+10 すすむ」, 「つぎの えきへ」(arrive now), day −1 / +1 (offset in localStorage `densha-tabi-dev-day`,
  read only with data-dev), 「リセット」 (confirm first). Never shown without data-dev.
- A clock hook for node tests (e.g. `globalThis.DT_CLOCK`).
- `preview.html`: phone-sized page that stubs `window.ankidroid = { userAction(){} }`, renders a fake card
  back with the slot, and has a collapsible control strip: answer N cards (re-mount, as AnkiDroid does), set
  the CardID, move the day. Works from file:// and in headless Chrome.
