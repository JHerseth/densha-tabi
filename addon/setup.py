"""Setup helpers for でんしゃ たび on desktop, without Anki: the slot in back templates and the bundled script.

Pure functions (tested in tests/addon_test.py); the dialog and menu in ui.py only call these.
"""
from __future__ import annotations

import os
import re
import tempfile
from typing import Any, Optional

BEGIN = "<!-- densha-tabi:begin -->"
END = "<!-- densha-tabi:end -->"
SCRIPT_NAME = "_densha.js"

# our marked block, with the one newline we put before it
_BLOCK = re.compile(r"\n?" + re.escape(BEGIN) + r".*?" + re.escape(END), re.S)
# the plain two-line snippet older decks have (the sample deck's, the README's), data-dev either side of data-card
_DEV = r'(?: data-dev="1")?'
_PLAIN = re.compile(
    r'\n?<div id="densha"' + _DEV + r' data-card="\{\{CardID\}\}"' + _DEV + r'></div>[ \t]*(?:\r?\n)?[ \t]*'
    r'<script src="_densha\.js"></script>'
)
_DEV_IN = re.compile(r'data-dev="1"')


def snippet(dev: bool = False) -> str:
    return ('<div id="densha"' + (' data-dev="1"' if dev else "") + ' data-card="{{CardID}}"></div>\n'
            '<script src="_densha.js"></script>')


def block(dev: bool = False) -> str:
    return BEGIN + "\n" + snippet(dev) + "\n" + END


def detect(afmt: str) -> dict[str, bool]:
    """What a back template has: our marked block, the plain snippet, and whether either has test mode on."""
    marked = [m.group(0) for m in _BLOCK.finditer(afmt)]
    plain = [m.group(0) for m in _PLAIN.finditer(_BLOCK.sub("", afmt))]      # outside our blocks
    return {
        "present": bool(marked or plain),
        "marked": bool(marked),
        "plain": bool(plain),
        "dev": any(_DEV_IN.search(x) for x in marked + plain),
    }


def remove(afmt: str) -> str:
    """The back template without our block and without the plain snippet; everything else exactly as it was."""
    return _PLAIN.sub("", _BLOCK.sub("", afmt))


def add(afmt: str, dev: bool = False) -> str:
    """The back template with the game once, as our marked block at the end (replacing any plain snippet or older
    block). Already there exactly like that: unchanged."""
    if afmt.endswith("\n" + block(dev)) and len(_BLOCK.findall(afmt)) == 1 and not _PLAIN.search(_BLOCK.sub("", afmt)):
        return afmt
    base = remove(afmt)
    return base + "\n" + block(dev)


def plan(notetypes: list[dict[str, Any]], wanted: dict[tuple[int, int], bool], dev: dict[int, bool]) -> list[dict[str, Any]]:
    """The note types to save: for each (notetype id, template ord) in wanted, add or remove the game on that back
    template (with that note type's test mode). Returns changed copies only; templates not in wanted stay as they are."""
    out = []
    for nt in notetypes:
        changed = False
        tmpls = []
        for t in nt["tmpls"]:
            t2 = dict(t)
            key = (nt["id"], t["ord"])
            if key in wanted:
                t2["afmt"] = add(t["afmt"], dev.get(nt["id"], False)) if wanted[key] else remove(t["afmt"])
                changed = changed or t2["afmt"] != t["afmt"]
            tmpls.append(t2)
        if changed:
            nt2 = dict(nt)
            nt2["tmpls"] = tmpls
            out.append(nt2)
    return out


def remove_all(notetypes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every note type that has the game anywhere, with it removed from all back templates."""
    out = []
    for nt in notetypes:
        tmpls = [dict(t, afmt=remove(t["afmt"])) for t in nt["tmpls"]]
        if any(a["afmt"] != b["afmt"] for a, b in zip(tmpls, nt["tmpls"])):
            out.append(dict(nt, tmpls=tmpls))
    return out


# ---- the bundled script -------------------------------------------------------------------------
_VERSION = re.compile(r'DT_VERSION\s*=\s*"([^"]*)"')


def script_version(text: Optional[str]) -> Optional[str]:
    """The version stamped in a script ("1.2.0", "dev"), "" if it's ours but unstamped (older releases), or None
    if it isn't the game's script at all (or there's no file)."""
    if text is None:
        return None
    head = text[:8192]
    m = _VERSION.search(head)
    if m:
        return m.group(1)
    return "" if "でんしゃ たび" in head else None


def parse(version: Optional[str]) -> Optional[tuple[int, ...]]:
    """A dotted version as numbers, or None ("dev", empty, anything else)."""
    if not version or not re.fullmatch(r"\d+(\.\d+)*", version):
        return None
    return tuple(int(x) for x in version.split("."))


def is_newer(bundled: Optional[str], installed: Optional[str]) -> bool:
    """Whether the bundled script should replace the installed one. A bundled "dev" never does; an installed "dev"
    is never replaced; an installed one without a stamp ("") is older than any numbered release; a file that isn't
    ours (None) is never replaced; otherwise strictly newer numbers only (never a downgrade)."""
    b = parse(bundled)
    if b is None or installed is None or installed == "dev":
        return False
    if installed == "":
        return True
    i = parse(installed)
    return i is not None and b > i


def should_copy(installed_text: Optional[str], bundled: Optional[str], creating: bool) -> bool:
    """Whether to write the bundled script into the media folder. creating: the user just added the game to a note
    type (a missing file is then created); on profile open (creating False) a missing file is never created."""
    if bundled is None:
        return False
    if installed_text is None:
        return creating
    return is_newer(bundled, script_version(installed_text))


def write_media(folder: str, name: str, data: bytes) -> None:
    """Replace folder/name with data: a temporary file in the same folder, then a rename over the old one (the media
    folder's mtime changes, so Anki's media sync notices the file)."""
    fd, tmp = tempfile.mkstemp(prefix=".densha-", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, os.path.join(folder, name))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
