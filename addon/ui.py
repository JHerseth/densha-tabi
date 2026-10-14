"""Tools → でんしゃ たび: the setup dialog and menu (thin Qt; the logic is in setup.py)."""
from __future__ import annotations

import os
from typing import Any

from aqt import mw
from aqt.operations import CollectionOp
from aqt.qt import (
    QCheckBox, QDialog, QDialogButtonBox, QGroupBox, QLabel, QMenu, QScrollArea, Qt, QVBoxLayout, QWidget,
)
from aqt.utils import askUser, showWarning, tooltip

from . import setup
from .core import log

UNDO_NAME = "でんしゃ たび setup"
BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), setup.SCRIPT_NAME)


def bundled() -> tuple[bytes | None, str | None]:
    """The script shipped in the add-on and its version (None, None when there isn't one, e.g. a dev checkout)."""
    try:
        with open(BUNDLED, "rb") as f:
            data = f.read()
    except OSError:
        return None, None
    return data, setup.script_version(data.decode("utf-8", "replace"))


def installed_text(col: Any) -> str | None:
    try:
        with open(os.path.join(col.media.dir(), setup.SCRIPT_NAME), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def refresh_script(col: Any, creating: bool) -> str:
    """Copy the bundled _densha.js into the media folder when setup.should_copy says so. Returns what happened."""
    data, version = bundled()
    if data is None:
        return "no bundled script"
    if not setup.should_copy(installed_text(col), version, creating):
        return "kept"
    setup.write_media(col.media.dir(), setup.SCRIPT_NAME, data)
    return "copied " + str(version)


def _update(col: Any, nt: dict[str, Any]) -> None:
    """Save one note type. skip_checks: we only add or remove our own (valid) block, so a template error the user's
    deck already has (an imported {{Nope}}) mustn't stop us; Anki before 2.3 has no skip_checks."""
    try:
        col.models.update_dict(nt, skip_checks=True)
    except TypeError:
        col.models.update_dict(nt)


def _save(col: Any, changed: list[dict[str, Any]], skipped: list[str]) -> Any:
    """Save note types as one undo step. Before it starts, a note type that changed (or went) since the dialog read
    it is skipped; one that still fails to save is skipped too, so the others are saved and the op never fails (a
    failed op would clear Anki's undo history). Their names go into skipped."""
    ready = []
    for nt in changed:
        now = col.models.get(nt["id"])
        if not now or now.get("mod") != nt.get("mod"):
            skipped.append(nt["name"])
        else:
            ready.append(nt)
    pos = col.add_custom_undo_entry(UNDO_NAME)
    for nt in ready:
        try:
            _update(col, nt)
        except Exception as e:  # noqa: BLE001
            log("couldn't save note type %r: %r" % (nt["name"], e))
            skipped.append(nt["name"])
    return col.merge_undo_entries(pos)


def _result(changed: list[dict[str, Any]], skipped: list[str], extra: str = "") -> str:
    msg = "でんしゃ たび: %d note type(s) updated%s" % (len(changed) - len(skipped), extra)
    if skipped:
        msg += ". Skipped (changed meanwhile or couldn't be saved): " + ", ".join(skipped)
    return msg


class SetupDialog(QDialog):
    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setWindowTitle("でんしゃ たび — add the train to note types")
        self.col = mw.col
        self.notetypes = [self.col.models.get(x.id) for x in self.col.models.all_names_and_ids()]
        self.boxes: dict[tuple[int, int], QCheckBox] = {}
        self.devs: dict[int, QCheckBox] = {}
        self.start: dict[tuple[int, int], bool] = {}
        outer = QVBoxLayout(self)
        intro = QLabel(
            "Tick the card types whose back should move the train. The game is added at the end of the back "
            "template (and removed from unticked ones). Template text only: nothing else in your notes changes."
        )
        intro.setWordWrap(True)
        outer.addWidget(intro)
        inner = QWidget()
        lay = QVBoxLayout(inner)
        for nt in self.notetypes:
            group = QGroupBox(nt["name"])
            g = QVBoxLayout(group)
            dev_on = False
            for t in nt["tmpls"]:
                d = setup.detect(t["afmt"])
                dev_on = dev_on or d["dev"]
                box = QCheckBox(t["name"])
                box.setChecked(d["present"])
                self.boxes[(nt["id"], t["ord"])] = box
                self.start[(nt["id"], t["ord"])] = d["present"]
                g.addWidget(box)
            dev = QCheckBox("Test mode (data-dev)")
            dev.setChecked(dev_on)
            self.devs[nt["id"]] = dev
            g.addWidget(dev)
            warn = QLabel("<small>Test mode adds test buttons that change the real save; use it in a test profile only.</small>")
            warn.setWordWrap(True)
            g.addWidget(warn)
            lay.addWidget(group)
        lay.addStretch(1)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(inner)
        outer.addWidget(scroll)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Apply | QDialogButtonBox.StandardButton.Cancel)
        buttons.button(QDialogButtonBox.StandardButton.Apply).clicked.connect(self.apply)
        buttons.rejected.connect(self.reject)
        outer.addWidget(buttons)
        self.resize(460, 560)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)

    def apply(self) -> None:
        wanted: dict[tuple[int, int], bool] = {}
        for key, box in self.boxes.items():
            # a ticked box is (re)applied so a test mode change takes effect; an unticked one only if it had the game
            if box.isChecked() or self.start[key]:
                wanted[key] = box.isChecked()
        devs = {nid: box.isChecked() for nid, box in self.devs.items()}
        changed = setup.plan(self.notetypes, wanted, devs)
        adding = any(wanted.values())
        skipped: list[str] = []

        def done(_: Any) -> None:
            note = ""
            if adding:
                try:
                    note = refresh_script(mw.col, creating=True)
                except OSError as e:
                    showWarning("でんしゃ たび: couldn't copy _densha.js into the media folder: %s" % e)
            self.accept()          # close first; the tooltip belongs to the main window
            tooltip(_result(changed, skipped, "; _densha.js " + note if note.startswith("copied") else ""), parent=mw)

        if not changed:
            done(None)
            return
        CollectionOp(self, lambda col: _save(col, changed, skipped)).success(done).run_in_background()


def open_dialog() -> None:
    if mw.col:
        SetupDialog(mw).exec()


def remove_everywhere() -> None:
    if not mw.col:
        return
    notetypes = [mw.col.models.get(x.id) for x in mw.col.models.all_names_and_ids()]
    changed = setup.remove_all(notetypes)
    if not changed:
        tooltip("でんしゃ たび isn't on any note type.")
        return
    if not askUser(
        "Remove the train from all note types (%d)?\n\n_densha.js in your media folder and the game's save are "
        "left alone; you can add it back later." % len(changed)
    ):
        return
    skipped: list[str] = []
    CollectionOp(mw, lambda col: _save(col, changed, skipped)).success(
        lambda _: tooltip(_result(changed, skipped, " (removed)"), parent=mw)
    ).run_in_background()


def on_profile_open() -> None:
    """Keep _densha.js up to date in profiles that already use it (never create it, never downgrade)."""
    try:
        if mw.col:
            log("profile open: " + refresh_script(mw.col, creating=False))
    except Exception as e:  # noqa: BLE001
        log("couldn't refresh _densha.js: %r" % (e,))


def add_menu() -> None:
    menu = QMenu("でんしゃ たび", mw)
    menu.addAction("Add the train to note types…", open_dialog)
    menu.addAction("Remove the train from all note types", remove_everywhere)
    mw.form.menuTools.addMenu(menu)
