"""The desktop save of でんしゃ たび, without Anki: the injected store and the bridge messages.

Pure logic so it can be tested without Anki (see __init__.py for the hooks). The save is a dict of string keys to
string values in the collection config under CONFIG_KEY, so it syncs with the collection.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

CONFIG_KEY = "densha_tabi"
# the game's localStorage keys; only these are ever written (other keys already in the dict are kept as they are)
ALLOWED_KEYS = ("densha-tabi", "densha-tabi-dev-day")
MAX_VALUE = 256 * 1024
# a message can't be longer than its value JSON-escaped (at most 6 characters per character) plus a little
MAX_MESSAGE = 6 * MAX_VALUE + 64
SET = "densha:set:"
DEL = "densha:del:"

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "inject.js"), encoding="utf-8") as _f:
    TEMPLATE = _f.read()
_TOKENS = re.compile(r"__(DATA|SEQS|CARD|MAX)__")


def log(message: str) -> None:
    """A line for the console only. Never stderr: Anki's ErrorHandler (aqt/errors.py) takes over sys.stderr and
    shows its "An error occurred" window for anything written there."""
    print("densha_tabi: " + message, file=sys.stdout)


def script_json(value: Any) -> str:
    """JSON that is safe inside an HTML <script>: no '<', '>' or '&' (so no </script> or <!--), ASCII only (so no
    U+2028/2029 line breaks either)."""
    return (
        json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def raw_config(col: Any) -> dict[str, Any]:
    """The whole stored dict as it is (a non-dict counts as empty)."""
    raw = col.get_config(CONFIG_KEY, {}) if col is not None else {}
    return dict(raw) if isinstance(raw, dict) else {}


def stored(col: Any) -> dict[str, str]:
    """What the game sees: the allowed keys with string values."""
    return {k: v for k, v in raw_config(col).items() if k in ALLOWED_KEYS and isinstance(v, str)}


class Bridge:
    """The add-on's state for one Anki session: the last write sequence applied per key, so a write that arrives
    late (a lower sequence than one already applied) is ignored."""

    def __init__(self) -> None:
        self.applied: dict[str, int] = {}

    def inject(self, text: str, card_id: int, kind: str, col: Any) -> str:
        """card_will_show: on the reviewer's answer side only, prepend the store script to the card's HTML. Never
        raises (a hook that raises is removed by Anki): on any error the card is shown unchanged."""
        try:
            if kind != "reviewAnswer" or col is None:
                return text
            values = {
                "DATA": script_json(stored(col)),
                "SEQS": script_json(self.applied),
                "CARD": script_json(int(card_id)),
                "MAX": script_json(MAX_VALUE),
            }
            # one pass, so a stored value that happens to contain a token is never substituted
            js = _TOKENS.sub(lambda m: values[m.group(1)], TEMPLATE)
            return "<script>" + js + "</script>" + text
        except Exception as e:  # noqa: BLE001
            log("injection failed: %r" % (e,))
            return text

    def handle(self, handled: tuple[bool, Any], message: str, allowed_context: bool, col: Any) -> tuple[bool, Any]:
        """webview_did_receive_js_message: our messages from an allowed context are handled (also when invalid, which
        are dropped silently); everything else passes through untouched. Never raises."""
        if not isinstance(message, str) or not (message.startswith(SET) or message.startswith(DEL)):
            return handled
        if not allowed_context or col is None:
            return handled
        try:
            self._apply(message, col)
        except Exception as e:  # noqa: BLE001
            log("write dropped: %r" % (e,))
        return (True, None)

    def _apply(self, message: str, col: Any) -> None:
        if len(message) > MAX_MESSAGE:
            return
        try:
            if message.startswith(SET):
                key, value, seq = json.loads(message[len(SET):])
                if not isinstance(value, str) or len(value.encode("utf-8")) > MAX_VALUE:
                    return
            else:
                key, seq = json.loads(message[len(DEL):])
                value = None
        except (ValueError, TypeError):
            return
        if key not in ALLOWED_KEYS or not isinstance(seq, int) or isinstance(seq, bool):
            return
        if seq <= self.applied.get(key, -1):
            return                                    # stale: a newer write for this key was applied already
        self.applied[key] = seq
        data = raw_config(col)                        # change only this key; keep everything else as it was
        if value is None:
            if key not in data:
                return
            del data[key]
        else:
            if data.get(key) == value:
                return                                # nothing changed: don't mark the collection modified
            data[key] = value
        col.set_config(CONFIG_KEY, data)              # not undoable; marks the collection modified, so it syncs
