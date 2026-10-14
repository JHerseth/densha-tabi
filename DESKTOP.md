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

## Setup from the add-on (Tools → でんしゃ たび)

The add-on also does the setup, so a desktop user never edits a template or copies a file by hand.

- **Tools → でんしゃ たび → Add the train to note types…** opens a small dialog (English UI): every note type with
  its card types as checkboxes, ticked where the back template already has the game, plus a "Test mode (data-dev)"
  checkbox per note type (off by default, with a one-line warning: it changes the real save). Apply adds or removes
  the slot on the **back** templates only and is one undo step ("でんしゃ たび setup").
  - Added as a marked block at the end of the back template:
    `<!-- densha-tabi:begin -->`, the two-line snippet, `<!-- densha-tabi:end -->`.
  - Detection also finds the plain two-line snippet older decks have (the sample deck's), with or without
    `data-dev="1"` and with any whitespace between its two lines. Removing a card type removes exactly our block
    or that snippet and nothing else; adding never duplicates (an existing plain snippet is replaced by the block).
  - Not a schema change: Anki's own card layout screen treats template text edits as basic changes
    (`aqt/clayout.py` calls `change_tracker.mark_basic()` for them, lines 503/753/849/888/925) and only asks for a
    schema change (one-way full sync) when card types are added, removed or moved (`mark_schema()`, 637/684/704).
    The add-on saves the same way the card layout screen does (`col.models.update_dict`, as
    `aqt/operations/notetype.py:21` `update_notetype_legacy`), inside a `CollectionOp`, so the reviewer and browser
    refresh. No warning is needed.
- **Tools → でんしゃ たび → Remove the train from all note types** (asks first) removes every block and plain snippet;
  `_densha.js` and the save are left alone.
- **The script ships in the add-on.** `release.sh` stamps the version into the script (`var DT_VERSION = "x.y.z"`,
  `"dev"` for local builds) and puts it in the `.ankiaddon`. When Apply adds the game anywhere, the add-on copies
  `_densha.js` into the profile's media folder if it's missing or older. When a profile opens, it refreshes
  `_densha.js` only if the file is already there and the bundled one is newer. Rules (`addon/setup.py`):
  - versions are compared as dotted numbers (`1.2.10` > `1.2.9`); a bundled `"dev"` build never replaces anything;
  - an installed `"dev"` build is never replaced (a developer's own file);
  - an installed script with no version stamp at all (released before the stamp) counts as older than any
    numbered release;
  - never a downgrade (a newer file may have come from a phone-side release through sync), never a new file in
    a profile that doesn't use the game.
- **Overwriting a media file:** `col.media.write_data` adds a hash suffix when the name exists with other content
  (`anki/media.py:97`), so the add-on writes into `col.media.dir()` itself: a temporary file next to it, then
  `os.replace`. Media sync only rescans the folder when the folder's own mtime changed (the change tracker,
  `rslib/src/sync/media/database/client/changetracker.rs`, compares `folder_mod` with `db_mod` before looking at
  files' mtimes), and a rename changes the folder's mtime where an in-place write might not. The new file then has a
  new mtime and content, so it's sent at the next sync and reaches phones that way.
