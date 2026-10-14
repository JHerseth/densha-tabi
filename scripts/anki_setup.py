#!/usr/bin/env python3
"""Create or update the とどうふけん note type, deck and notes (the cards that carry でんしゃ たび) in the open Anki profile, through AnkiConnect.

    python3 scripts/anki_setup.py --profile NAME [--dev]

Idempotent: the note type's templates and CSS are rewritten from anki/, and notes are matched by their Key
field (fields updated, never duplicated). --dev puts data-dev="1" on the slot (test controls; test profiles only).
Media (_densha.js) is uploaded as base64, since a Flatpak Anki can't read files outside its sandbox.
"""
import argparse
import re
import base64
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ANKI = ROOT / "anki"
MODEL = "とどうふけん"
DECK = "とどうふけん"
FIELDS = ["Key", "Name", "Yomi", "Region", "Capital", "Emoji", "Meibutsu", "Fact"]
TEMPLATES = [("よみ", "read"), ("めいぶつ", "clue")]


def call(action, **params):
    req = json.dumps({"action": action, "version": 6, "params": params}).encode()
    with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8765", req)) as r:
        out = json.load(r)
    if out.get("error"):
        raise SystemExit(f"{action}: {out['error']}")
    return out["result"]


def templates(dev):
    out = {}
    for name, stem in TEMPLATES:
        back = (ANKI / f"{stem}-back.html").read_text()
        if dev:
            back = back.replace('<div id="densha" ', '<div id="densha" data-dev="1" ')
        out[name] = {"Front": (ANKI / f"{stem}-front.html").read_text(), "Back": back}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True, help="the Anki profile that must be open")
    ap.add_argument("--dev", action="store_true", help='data-dev="1" on the slot')
    ap.add_argument("--version", default="dev",
                    help='stamp the uploaded _densha.js with this release version (X.Y.Z; default "dev"), so the desktop '
                         'add-on can update it later and a deck exported from this profile carries it')
    a = ap.parse_args()
    if a.version != "dev" and not re.fullmatch(r"\d+(\.\d+)*", a.version):
        sys.exit("--version must be X.Y.Z (or dev)")

    active = call("getActiveProfile")
    if active != a.profile:
        sys.exit(f"Anki has profile {active!r} open, not {a.profile!r}")

    css = (ANKI / "style.css").read_text()
    tpl = templates(a.dev)
    if MODEL not in call("modelNames"):
        call("createModel", modelName=MODEL, inOrderFields=FIELDS, css=css, isCloze=False,
             cardTemplates=[{"Name": n, **tpl[n]} for n, _ in TEMPLATES])
        print("created note type", MODEL)
    else:
        call("updateModelTemplates", model={"name": MODEL, "templates": tpl})
        call("updateModelStyling", model={"name": MODEL, "css": css})
        print("updated note type", MODEL)

    call("createDeck", deck=DECK)
    notes = json.loads((ANKI / "notes.json").read_text())
    have = {}
    ids = call("findNotes", query=f'"note:{MODEL}"')
    for info in call("notesInfo", notes=ids) if ids else []:
        have[info["fields"]["Key"]["value"]] = info["noteId"]
    added = updated = 0
    for n in notes:
        if n["Key"] in have:
            call("updateNoteFields", note={"id": have[n["Key"]], "fields": n})
            updated += 1
        else:
            call("addNote", note={"deckName": DECK, "modelName": MODEL, "fields": n, "tags": ["todoufuken"],
                                  "options": {"allowDuplicate": False}})
            added += 1
    print(f"notes: {added} added, {updated} updated")

    js = ROOT / "media" / "_densha.js"
    if js.exists():
        text = js.read_text(encoding="utf-8")
        stamped = text.replace('var DT_VERSION = "dev";', 'var DT_VERSION = "%s";' % a.version, 1)
        if a.version != "dev" and stamped == text:
            sys.exit("media/_densha.js has no DT_VERSION stamp to replace")
        name = call("storeMediaFile", filename="_densha.js", data=base64.b64encode(stamped.encode("utf-8")).decode())
        print("uploaded", name, "(DT_VERSION %s)" % a.version)
    else:
        print("media/_densha.js not built yet: skipped the upload")


if __name__ == "__main__":
    main()
