"""The desktop save of でんしゃ たび, without Anki: the injected store and the bridge messages.

Pure logic so it can be tested without Anki (see __init__.py for the hooks). The save is a dict of string keys to
string values in the collection config under CONFIG_KEY, so it syncs with the collection.
"""
from __future__ import annotations

import json
import os
from typing import Any

CONFIG_KEY = "densha_tabi"
# the game's localStorage keys; nothing else is ever stored
ALLOWED_KEYS = ("densha-tabi", "densha-tabi-dev-day")
MAX_VALUE = 256 * 1024
SET = "densha:set:"
DEL = "densha:del:"

_TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inject.js")


def _template() -> str:
    with open(_TEMPLATE_PATH, encoding="utf-8") as f:
        return f.read()


def script_json(value: Any) -> str:
    """JSON that is safe inside an HTML <script>: no '<', '>' or '&' (so no </script> or <!--), ASCII only (so no
    U+2028/2029 line breaks either)."""
    return (
        json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def stored(col: Any) -> dict[str, str]:
    """The stored dict, keeping only allowed keys with string values (anything else is ignored, not deleted)."""
    raw = col.get_config(CONFIG_KEY, {}) if col is not None else {}
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items() if k in ALLOWED_KEYS and isinstance(v, str)}


class Bridge:
    """The add-on's state for one Anki session: the last write sequence applied per key, so a write that arrives
    late (a lower sequence than one already applied) is ignored."""

    def __init__(self) -> None:
        self.applied: dict[str, int] = {}

    def inject(self, text: str, card_id: int, kind: str, col: Any) -> str:
        """card_will_show: on the reviewer's answer side only, prepend the store script to the card's HTML."""
        if kind != "reviewAnswer" or col is None:
            return text
        js = (
            _template()
            .replace("__DATA__", script_json(stored(col)))
            .replace("__SEQS__", script_json(self.applied))
            .replace("__CARD__", script_json(int(card_id)))
        )
        return "<script>" + js + "</script>" + text

    def handle(self, handled: tuple[bool, Any], message: str, is_reviewer: bool, col: Any) -> tuple[bool, Any]:
        """webview_did_receive_js_message: our messages from the reviewer are handled (also when invalid, which are
        dropped silently); everything else passes through untouched."""
        if not isinstance(message, str) or not (message.startswith(SET) or message.startswith(DEL)):
            return handled
        if not is_reviewer or col is None:
            return handled
        try:
            if message.startswith(SET):
                key, value, seq = json.loads(message[len(SET):])
                if not isinstance(value, str) or len(value.encode("utf-8")) > MAX_VALUE:
                    return (True, None)
            else:
                key, seq = json.loads(message[len(DEL):])
                value = None
        except (ValueError, TypeError):
            return (True, None)
        if key not in ALLOWED_KEYS or not isinstance(seq, int) or isinstance(seq, bool):
            return (True, None)
        if seq <= self.applied.get(key, -1):
            return (True, None)                      # stale: a newer write for this key was applied already
        self.applied[key] = seq
        data = stored(col)
        if value is None:
            if key not in data:
                return (True, None)
            del data[key]
        else:
            if data.get(key) == value:
                return (True, None)                  # nothing changed: don't mark the collection modified
            data[key] = value
        col.set_config(CONFIG_KEY, data)             # not undoable; marks the collection modified, so it syncs
        return (True, None)
