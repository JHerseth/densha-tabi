# Desktop Anki — design addendum

Option A: desktop gets its own train, saved in the collection so it syncs between desktop computers through
AnkiWeb. The phone keeps its localStorage save. The two are separate trains (no write path from AnkiDroid's new
study screen to anything that syncs), and a card pays once a day on each.

## Why an add-on is needed (verified in Anki 26.09.3's source)

- `aqt/mediasrv.py`: the card server binds `127.0.0.1` on `ANKI_API_PORT` or port 0 (random each launch), and
  localStorage is per origin, so a save would be orphaned at every restart.
- `aqt/webview.py`: card webviews use `QWebEngineProfile()` without a storage name, i.e. off-the-record: web
  storage is memory-only and gone when Anki closes.

## The add-on (`addon/`, shipped as `densha-tabi.ankiaddon`)

Small, dependency-free, Anki ≥ 2.1.50 (test target: 26.09).

- **Storage:** a dict of string keys → string values in the collection config under `densha_tabi`
  (`mw.col.get_config` / `mw.col.set_config`), so it syncs with the collection. Keys mirror the game's
  localStorage keys (`densha-tabi`, `densha-tabi-dev-day`).
- **Injection (`gui_hooks.card_will_show`)**, only for kind `reviewAnswer` (never the question, previewer, card
  layout screen or browser): prepend a small script that defines, before the card's own scripts run:
  - `window.DENSHA_DESKTOP = { v: 1, card: <card id> }`
  - `window.DENSHA_STORE` = a synchronous localStorage-like object (`getItem`, `setItem`, `removeItem`) whose
    initial contents are the stored dict (JSON-encoded safely into the script, `</script>` escaped), and whose
    `setItem`/`removeItem` update the in-page copy and send `pycmd("densha:set:" + JSON.stringify([key, value]))`
    / `pycmd("densha:del:" + JSON.stringify(key))`.
  Desktop Anki keeps one page and swaps card HTML into it, so the injected object is re-created per card with
  the latest stored contents — writes made on the previous card have been processed by then (bridge messages are
  handled in order before the next card renders). Verify this ordering assumption in the code you write and
  guard it anyway: a per-page monotonically increasing write sequence, and Python ignores a stale write
  (lower seq than the last applied for that key).
- **Messages (`gui_hooks.webview_did_receive_js_message`)**: handle `densha:set:` / `densha:del:` only when the
  context is the `Reviewer`; return `(True, None)`; anything else passes through untouched. Validate: key in an
  allow-list, value a string, size cap (e.g. 256 KB) — reject silently otherwise.
- Don't mark undo; writing config is fine to mark the collection modified (it should sync).
- Never touch anything else in the collection.

## Game changes (`densha.js`)

- **Mount** when `ankidroid.userAction` is a function (as now) **or** when `window.DENSHA_DESKTOP` and
  `window.DENSHA_STORE` exist (set only by the add-on on the reviewer's answer side). Previewer, browser and card
  layout screen still show nothing; desktop without the add-on shows nothing.
- **Storage layer:** one small abstraction used everywhere the game touches storage today — `DENSHA_STORE` when
  present, else `localStorage`. Read-modify-write, locking, mending, quota handling and the dev-day key all go
  through it unchanged. The no-storage message stays phone-specific (desktop always has the store).
- **Card id:** prefer `data-card`; if it's missing or not numeric (older Anki without `{{CardID}}`), fall back to
  `DENSHA_DESKTOP.card`.
- **Re-running in one page:** desktop re-runs the script in the same document for every card (like preview.html
  does). Make sure there's one stylesheet, no duplicate listeners/timers, and the old mount is torn down when its
  slot leaves (the MutationObserver already does this — verify against Anki's way of swapping `#qa` content).
- **Layout on a big window:** the game overlay becomes a phone-sized column (max ~460 px wide, full height,
  centred) over a dimmed backdrop; clicking the backdrop closes it. The chip/bubble stay bottom-left of the
  reviewer. Mouse wheel scrolls the scrollers; nothing depends on touch.
- **Keyboard:** Anki's reviewer shortcuts (space, 1–4, e, …) still reach Anki while the game is open — we can't
  stop Qt shortcuts from JS. Answering simply tears the game down (already safe). Add `Esc` → close the game
  overlay if JS sees it (don't fight Anki if it doesn't).
- **Night mode:** the game keeps its own colours; just make sure the chip reads on Anki's dark reviewer.

## Tests

- Python: `tests/addon_test.py` (stdlib `unittest`) with a stubbed `aqt` / `mw` / `gui_hooks`: injection only on
  `reviewAnswer`; script escapes `</script>` and odd JSON; set/del handled only in Reviewer context; allow-list
  and size cap; stale-seq writes ignored; config round-trip. Run with `python3 -m unittest`.
- Node: mounting with the desktop globals and no `ankidroid`; not mounting with neither; storage goes to
  `DENSHA_STORE` (writes emitted as pycmd calls in order); the card-id fallback; re-running the script in one
  document keeps one stylesheet and one live mount; Esc closes; the wide-window layout class.
- `preview.html?desktop=1`: stubs `pycmd` + the injected globals (a fake store persisted to the preview's own
  localStorage), at a desktop size (e.g. 1280×800), for screenshots.

## Packaging

- `addon/__init__.py`, `addon/manifest.json` (`{"package": "densha_tabi", "name": "でんしゃ たび (Train Trip) —
  desktop save"}`), `addon/README` or `config.md`.
- `scripts/release.sh` also builds `dist/densha-tabi-<ver>.ankiaddon` (zip of addon/ contents) and puts it in the
  release zip; `INSTALL.txt` and `README.md` get a short "Desktop Anki" section (install the add-on via Tools →
  Add-ons → Install from file, restart; separate train from the phone; syncs between desktops).
