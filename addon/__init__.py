"""でんしゃ たび (Train Trip) — desktop save.

The game (_densha.js on the back of cards) keeps its save in localStorage on AnkiDroid. Desktop Anki's card
webview forgets localStorage (its profile is off-the-record, and the card server's port changes every launch),
so this add-on gives the game a store kept in the collection config instead, which syncs between desktop
computers through AnkiWeb. The phone's train is separate. See DESKTOP.md in the game's repository.
"""
from __future__ import annotations

from typing import Any

from .core import Bridge

try:
    from aqt import gui_hooks, mw
    from aqt.reviewer import Reviewer
except ImportError:  # imported outside Anki (tests import core directly)
    gui_hooks = None
    mw = None
    Reviewer = None

bridge = Bridge()


def _card_will_show(text: str, card: Any, kind: str) -> str:
    return bridge.inject(text, card.id, kind, mw.col if mw else None)


def _on_js_message(handled: tuple[bool, Any], message: str, context: Any) -> tuple[bool, Any]:
    is_reviewer = Reviewer is not None and isinstance(context, Reviewer)
    return bridge.handle(handled, message, is_reviewer, mw.col if mw else None)


def _profile_closed() -> None:
    bridge.applied.clear()


if gui_hooks is not None:
    gui_hooks.card_will_show.append(_card_will_show)
    gui_hooks.webview_did_receive_js_message.append(_on_js_message)
    gui_hooks.profile_will_close.append(_profile_closed)
