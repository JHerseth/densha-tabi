# でんしゃ たび (Train Trip)

A little game on the back of Anki cards, for a child studying on a phone in AnkiDroid. Every card whose answer is
shown moves a drawn train one step along Japan's 47 prefectures, 北海道 → 沖縄 and round again. Each station gives an
eki stamp for the stamp book, a souvenir and coins for the shop: more lines to ride (山手線, 江ノ電, ゆいレール,
小田急小田原線, 東海道新幹線) and the train itself (models, paint, cars, animal passengers).

It knows nothing about the card but its id, so it works on any note type and any deck size: the distance between
stations follows the player's own pace (one ordinary study day ≈ one station), and coins come from stations and
study days, never from card counts. Studying on more days of the week earns a bigger daily bonus, and nothing is
ever lost: no streaks that reset, no timers, nothing random. The full design is in [DESIGN.md](DESIGN.md).

The game's text is Japanese (kana with spaces between words), written for young learners.

## Screenshots

| | | |
|---|---|---|
| ![The card back: the train arrives at a station](docs/screenshots/card.webp) | ![The train in 近畿, with the station sign and the week's bonus](docs/screenshots/train.webp) | ![Pressing a station's eki stamp](docs/screenshots/stamp.webp) |
| On the card: an arrival | The trip, here in 近畿 | ポン！ A station's stamp |
| ![The stamp book](docs/screenshots/stamp-book.webp) | ![The 山手線 route map, a ring](docs/screenshots/yamanote.webp) | ![The shop's lines tab](docs/screenshots/shop.webp) |
| The stamp book | 山手線's route map | Lines to buy |

![江ノ電 by the sea](docs/screenshots/enoden.webp)

All at phone size (360 × 740).

## Download

Get `densha-tabi-<version>.zip` from the [releases page](../../releases). It has the script, the template snippet,
install instructions (`INSTALL.txt`) and an optional sample deck, `todoufuken.apkg`: Japan's 47 prefectures in 94
cards (reading the kanji, and guessing the prefecture from what it's famous for), with the game already set up.
Importing it is the quickest way to try the game.

## Setup in AnkiDroid

Needs AnkiDroid 2.23 or later; Android 11 or later is recommended for the emoji.

1. Copy `_densha.js` into the profile's `collection.media` folder (on desktop Anki: Tools → Check Media → View
   Files, then sync). The leading `_` keeps Check Media from deleting it. The Klee One fonts
   `_kleeone-regular.ttf` / `_kleeone-semibold.ttf` are used if they are there too (the sample deck brings them);
   otherwise it falls back to the phone's font.
2. Add this at the end of the **back** template of any card type (one slot per card back):

   ```html
   <div id="densha" data-card="{{CardID}}"></div>
   <script src="_densha.js"></script>
   ```

3. AnkiDroid settings: turn on the **new study screen** (Settings → New study screen), and turn on
   **"localStorage in Study Screen"** (Settings → Advanced, under Workarounds). The game saves there; without it
   the card shows a one-line reminder instead of the game.
4. Sync. A small train chip appears bottom-left on the back of cards; tap it to open the game.

It only runs in AnkiDroid's study screen (desktop Anki and the previewer show nothing). A card pays once a day
(the day starts at 04:00, as in Anki); showing the answer again or undoing pays nothing. It can't see which
answer button was pressed (the new study screen gives card scripts no way to), so it rewards studying, not right
answers. The save lives in that phone's localStorage and isn't synced. It can share a card with other card games
(it uses `#densha`, `dt-` classes and the `densha-tabi` localStorage key).

### Test mode

`data-dev="1"` on the slot adds a ⚙ to the game's top bar: 🪙＋50, a past study day for the stamp card, ＋10 steps,
arrive at the next station, move the game's day back or forward, and reset (asks first). It changes the real save
on that phone, so use it in a test profile only.

## Development

- `densha.js` is the whole game (one dependency-free IIFE). `sh scripts/build.sh` first refreshes its line data
  from `lines.json` (the block between `LINES-DATA:BEGIN/END`; edit `lines.json`, not that block), then copies it to
  `media/_densha.js`. The lines to buy are described in [LINES.md](LINES.md).
- Tests: `node --test` (Node 20+; `tests/harness.js` is a tiny fake DOM + localStorage running the script in `node:vm`).
- Preview: open `preview.html` in a browser (works from `file://`). It stubs `window.ankidroid`, shows a fake card
  back with the slot, and the strip at the top answers N cards (each a new card swap, as in AnkiDroid), sets the
  CardID and moves the day. `?dev=1` adds `data-dev`; `?strip=none` hides the strip;
  `?garden=<url of _garden.js>` puts [Kanpeki Garden](https://github.com/JHerseth/kanpeki-garden) on the same card
  to check the two games coexist. For the fonts, put copies of `_kleeone-*.ttf` next to it.
- Screenshots: `node scripts/shots.mjs [name-filter]` drives headless Chromium at 360×740 (DPR 2) through a set of
  scenes into `out/screens/` (gitignored); `scripts/shot.mjs` takes a single shot of any URL.
- The sample deck: `anki/` holds its note type (templates, CSS) and notes; `scripts/anki_setup.py --profile NAME`
  creates or updates it in the open Anki profile through AnkiConnect and uploads `_densha.js`.
- Release zip: `sh scripts/release.sh 1.0.0 [deck.apkg]` builds, runs the tests and writes
  `dist/densha-tabi-1.0.0.zip`.

## Licence

MIT, see [LICENSE](LICENSE). The sample deck carries the Klee One font, under the SIL Open Font License
(`OFL-KleeOne.txt` in the zip).
