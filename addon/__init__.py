"""でんしゃ たび (Train Trip) — desktop save.

The game (_densha.js on the back of cards) keeps its save in localStorage on AnkiDroid. Desktop Anki's card
webview forgets localStorage (its profile is off-the-record, and the card server's port changes every launch),
so this add-on gives the game a store kept in the collection config instead, which syncs between desktop
computers through AnkiWeb. The phone's train is separate. See DESKTOP.md in the game's repository.
"""
from __future__ import annotations

from typing import Any

from .core import Bridge, log

try:
    from aqt import gui_hooks, mw
    from aqt.reviewer import Reviewer
except ImportError:  # imported outside Anki (tests import core directly)
    gui_hooks = None
    mw = None
    Reviewer = None

bridge = Bridge()


def _card_will_show(text: str, card: Any, kind: str) -> str:
    try:
        return bridge.inject(text, card.id, kind, mw.col if mw else None)
    except Exception as e:  # noqa: BLE001  (Anki removes a hook that raises)
        log("injection failed: %r" % (e,))
        return text


def _allowed(context: Any) -> bool:
    """Our messages come from the reviewer; writes still queued as it leaves (the last card answered) arrive with the
    overview or deck browser as context, which run no card content. Every other context is refused."""
    if Reviewer is not None and isinstance(context, Reviewer):
        return True
    if mw is None or context is None:
        return False
    return any(context is getattr(mw, name, None) for name in ("overview", "deckBrowser"))


def _on_js_message(handled: tuple[bool, Any], message: str, context: Any) -> tuple[bool, Any]:
    try:
        return bridge.handle(handled, message, _allowed(context), mw.col if mw else None)
    except Exception as e:  # noqa: BLE001
        log("message failed: %r" % (e,))
        return (True, None) if isinstance(message, str) and message.startswith("densha:") else handled


def _profile_closed() -> None:
    bridge.applied.clear()


if gui_hooks is not None:
    gui_hooks.card_will_show.append(_card_will_show)
    gui_hooks.webview_did_receive_js_message.append(_on_js_message)
    gui_hooks.profile_will_close.append(_profile_closed)
    try:  # the setup menu and keeping _densha.js up to date (Qt; not available in tests)
        from . import ui

        ui.add_menu()
        gui_hooks.profile_did_open.append(ui.on_profile_open)
    except Exception as e:  # noqa: BLE001
        log("setup menu unavailable: %r" % (e,))
