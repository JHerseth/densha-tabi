# でんしゃ たび (Train Trip)

A little game on the back of Anki cards, for a child studying on a phone in AnkiDroid. Every card whose answer is
shown moves a drawn train one step along Japan's 47 prefectures, 北海道 → 沖縄 and round again. Each station gives an
eki stamp for the stamp book, a souvenir and coins for the train shop (models, paint, cars, animal passengers).

It knows nothing about the card but its id, so it works on any note type and any deck size: the distance between
stations follows the player's own pace (one ordinary study day ≈ one station), and coins come from stations and
study days, never from card counts. The full design is in [DESIGN.md](DESIGN.md).

## Setup in AnkiDroid

1. Copy `media/_densha.js` into the profile's `collection.media` folder (the leading `_` keeps Anki's "Check Media"
   from deleting it). The Klee One fonts `_kleeone-regular.ttf` / `_kleeone-semibold.ttf` are used if they are there
   too; otherwise it falls back to the phone's font.
2. Add this at the end of the **back** template of any card type (one slot per card back):

   ```html
   <div id="densha" data-card="{{CardID}}"></div>
   <script src="_densha.js"></script>
   ```

   `data-dev="1"` on the div adds test controls (⚙ in the game) — only for a test profile.
3. AnkiDroid settings: turn on the **new study screen**, and under Advanced turn on **"localStorage in Study
   Screen"** (the game saves there; without it the card shows a one-line reminder instead of the game).
4. Sync. A small train chip appears bottom-left on the back of cards; tap it to open the game.

It only runs in AnkiDroid's study screen (desktop Anki and the previewer show nothing). It can share a card with
other card games (it uses `#densha`, `dt-` classes and the `densha-tabi` localStorage key).

## Development

- `densha.js` is the whole game (one dependency-free IIFE). `sh scripts/build.sh` copies it to `media/_densha.js`.
- Tests: `node --test` (Node 20+; `tests/harness.js` is a tiny fake DOM + localStorage running the script in `node:vm`).
- Preview: open `preview.html` in a browser (works from `file://`). It stubs `window.ankidroid`, shows a fake card
  back with the slot, and the strip at the top answers N cards (each a new card swap, as in AnkiDroid), sets the
  CardID and moves the day. `?dev=1` adds `data-dev`; `?garden=<url of _garden.js>` puts Kanpeki Garden on the
  same card to check the two games coexist. For the fonts, put copies of `_kleeone-*.ttf` next to it.
- Screenshots: `node scripts/shots.mjs [name-filter]` drives headless Chromium at 360×740 (DPR 2) through a set of
  scenes into `out/screens/` (gitignored); `scripts/shot.mjs` takes a single shot of any URL.
