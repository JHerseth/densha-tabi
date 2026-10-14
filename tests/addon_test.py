"""Tests for the desktop add-on (addon/), with a stubbed aqt: python3 -m unittest tests/addon_test.py"""
from __future__ import annotations

import json
import os
import sys
import types
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Hook(list):
    """A gui_hooks filter/hook: a list of callbacks."""


class Col:
    """The collection's config, as get_config / set_config see it."""

    def __init__(self, conf=None):
        self.conf = dict(conf or {})
        self.writes = 0

    def get_config(self, key, default=None):
        return json.loads(json.dumps(self.conf[key])) if key in self.conf else default

    def set_config(self, key, val, *, undoable=False):
        assert undoable is False
        self.conf[key] = json.loads(json.dumps(val))
        self.writes += 1


class Reviewer:
    pass


class Card:
    def __init__(self, cid):
        self.id = cid


def load_addon(col):
    """Import addon/ as Anki would (a package), with stub aqt modules; returns (package, gui_hooks, mw)."""
    aqt = types.ModuleType("aqt")
    gui_hooks = types.SimpleNamespace(card_will_show=Hook(), webview_did_receive_js_message=Hook(), profile_will_close=Hook())
    mw = types.SimpleNamespace(col=col)
    aqt.gui_hooks, aqt.mw = gui_hooks, mw
    reviewer = types.ModuleType("aqt.reviewer")
    reviewer.Reviewer = Reviewer
    sys.modules["aqt"], sys.modules["aqt.reviewer"] = aqt, reviewer
    for name in [m for m in sys.modules if m == "addon" or m.startswith("addon.")]:
        del sys.modules[name]
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import addon  # noqa: E402
    return addon, gui_hooks, mw


def show(gui_hooks, text, cid, kind):
    for f in gui_hooks.card_will_show:
        text = f(text, Card(cid), kind)
    return text


def message(gui_hooks, msg, context):
    handled = (False, None)
    for f in gui_hooks.webview_did_receive_js_message:
        handled = f(handled, msg, context)
    return handled


def set_msg(key, value, seq):
    return "densha:set:" + json.dumps([key, value, seq])


class AddonTest(unittest.TestCase):
    def setUp(self):
        self.col = Col({"densha_tabi": {"densha-tabi": '{"v":2}', "junk": "x"}, "other": 1})
        self.addon, self.hooks, self.mw = load_addon(self.col)

    def test_hooks_registered(self):
        self.assertEqual(len(self.hooks.card_will_show), 1)
        self.assertEqual(len(self.hooks.webview_did_receive_js_message), 1)

    def test_injects_only_on_the_answer_side_of_the_reviewer(self):
        for kind in ["reviewQuestion", "previewQuestion", "previewAnswer", "clayoutQuestion", "clayoutAnswer"]:
            self.assertEqual(show(self.hooks, "<p>x</p>", 5, kind), "<p>x</p>")
        out = show(self.hooks, "<p>x</p>", 5, "reviewAnswer")
        self.assertTrue(out.startswith("<script>"))
        self.assertTrue(out.endswith("</script><p>x</p>"))       # before the card's own scripts
        self.assertIn("card: 5 }", out)
        self.assertIn('{"densha-tabi":"{\\"v\\":2}"}', out)        # stored data, only allowed keys
        self.assertNotIn("junk", out)
        self.assertNotIn("__DATA__", out)

    def test_script_is_safe_for_odd_values(self):
        evil = '</script><script>alert(1)</script><!--     & "quote"'
        self.col.conf["densha_tabi"] = {"densha-tabi": evil}
        out = show(self.hooks, "", 1, "reviewAnswer")
        body = out[len("<script>"):-len("</script>")]
        self.assertNotIn("</script", body.lower())
        self.assertNotIn("<!--", body)
        self.assertNotIn(" ", body)
        self.assertNotIn(" ", body)
        # and the value decodes back exactly
        start = body.index("var data = ") + len("var data = ")
        end = body.index(", applied = ")
        self.assertEqual(json.loads(body[start:end])["densha-tabi"], evil)

    def test_set_and_del_only_from_the_reviewer(self):
        msg = set_msg("densha-tabi", "A", 10)
        self.assertEqual(message(self.hooks, msg, object()), (False, None))   # not the reviewer: untouched
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], '{"v":2}')
        self.assertEqual(message(self.hooks, msg, Reviewer()), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi"), {"densha-tabi": "A", "junk": "x"})   # other keys kept
        self.assertEqual(message(self.hooks, "densha:del:" + json.dumps(["densha-tabi", 11]), Reviewer()), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi"), {"junk": "x"})
        self.assertEqual(self.col.conf["other"], 1)                            # nothing else touched

    def test_other_messages_pass_through(self):
        self.assertEqual(message(self.hooks, "ans", Reviewer()), (False, None))
        self.assertEqual(message(self.hooks, "ease3", Reviewer()), (False, None))

    def test_allow_list_types_and_size_cap(self):
        before = self.col.get_config("densha_tabi")
        bad = [
            set_msg("not-ours", "x", 1),
            set_msg("densha-tabi", 5, 2),
            set_msg("densha-tabi", "x" * (256 * 1024 + 1), 3),
            set_msg("densha-tabi", "x", "4"),
            set_msg("densha-tabi", "x", True),
            "densha:set:{not json",
            "densha:set:" + json.dumps(["densha-tabi", "x"]),
        ]
        for m in bad:
            self.assertEqual(message(self.hooks, m, Reviewer()), (True, None), m[:40])
        self.assertEqual(self.col.get_config("densha_tabi"), before)
        self.assertEqual(self.col.writes, 0)
        self.assertEqual(message(self.hooks, set_msg("densha-tabi-dev-day", "-2", 9), Reviewer()), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi-dev-day"], "-2")

    def test_stale_writes_are_ignored(self):
        message(self.hooks, set_msg("densha-tabi", "new", 20), Reviewer())
        message(self.hooks, set_msg("densha-tabi", "late old", 19), Reviewer())
        message(self.hooks, set_msg("densha-tabi", "repeat", 20), Reviewer())
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], "new")
        # the applied sequence goes into the next injection, so the page knows what the add-on has
        out = show(self.hooks, "", 1, "reviewAnswer")
        self.assertIn('applied = {"densha-tabi":20}', out)

    def test_config_round_trip_and_no_write_without_change(self):
        message(self.hooks, set_msg("densha-tabi", "Z", 1), Reviewer())
        writes = self.col.writes
        message(self.hooks, set_msg("densha-tabi", "Z", 2), Reviewer())
        self.assertEqual(self.col.writes, writes)
        out = show(self.hooks, "", 2, "reviewAnswer")
        self.assertIn('{"densha-tabi":"Z"}', out)

    def test_profile_close_forgets_sequences(self):
        message(self.hooks, set_msg("densha-tabi", "Z", 50), Reviewer())
        for f in self.hooks.profile_will_close:
            f()
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "after", 1), Reviewer()), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], "after")

    def test_no_collection(self):
        self.mw.col = None
        self.assertEqual(show(self.hooks, "x", 1, "reviewAnswer"), "x")
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "a", 1), Reviewer()), (False, None))

    def test_bad_messages_never_raise_or_unhook(self):
        for m in ["densha:set:" + "[" * 100000, "densha:set:" + "x" * (7 * 256 * 1024), "densha:del:" + "{" * 50000]:
            self.assertEqual(message(self.hooks, m, Reviewer()), (True, None))
        self.assertEqual(len(self.hooks.webview_did_receive_js_message), 1)
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "ok", 5), Reviewer()), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], "ok")

    def test_injection_errors_leave_the_card_as_it_is(self):
        self.assertEqual(show(self.hooks, "<p>x</p>", "not a number", "reviewAnswer"), "<p>x</p>")
        self.col.get_config = lambda *a, **k: 1 / 0
        self.assertEqual(show(self.hooks, "<p>y</p>", 3, "reviewAnswer"), "<p>y</p>")

    def test_stored_values_that_look_like_placeholders_stay_as_they_are(self):
        self.col.conf["densha_tabi"] = {"densha-tabi": "__SEQS__ __CARD__ __MAX__ __DATA__"}
        out = show(self.hooks, "", 7, "reviewAnswer")
        body = out[len("<script>"):-len("</script>")]
        start = body.index("var data = ") + len("var data = ")
        end = body.index(", applied = ")
        self.assertEqual(json.loads(body[start:end])["densha-tabi"], "__SEQS__ __CARD__ __MAX__ __DATA__")
        self.assertIn("card: 7 }", body)
        self.assertIn("MAX = 262144", body)

    def test_writes_keep_keys_this_version_doesnt_know(self):
        self.col.conf["densha_tabi"] = {"densha-tabi": "a", "future-key": {"x": 1}}
        message(self.hooks, set_msg("densha-tabi", "b", 1), Reviewer())
        self.assertEqual(self.col.get_config("densha_tabi"), {"densha-tabi": "b", "future-key": {"x": 1}})
        message(self.hooks, "densha:del:" + json.dumps(["densha-tabi", 2]), Reviewer())
        self.assertEqual(self.col.get_config("densha_tabi"), {"future-key": {"x": 1}})

    def test_late_writes_from_the_overview_or_deck_browser_are_kept(self):
        self.mw.overview, self.mw.deckBrowser, self.mw.editor = object(), object(), object()
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "o", 1), self.mw.overview), (True, None))
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "d", 2), self.mw.deckBrowser), (True, None))
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], "d")
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "e", 3), self.mw.editor), (False, None))
        self.assertEqual(message(self.hooks, set_msg("densha-tabi", "n", 4), None), (False, None))
        self.assertEqual(self.col.get_config("densha_tabi")["densha-tabi"], "d")

    def test_manifest(self):
        with open(os.path.join(ROOT, "addon", "manifest.json"), encoding="utf-8") as f:
            m = json.load(f)
        self.assertEqual(m["package"], "densha_tabi")


if __name__ == "__main__":
    unittest.main()
