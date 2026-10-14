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


def load_setup():
    """addon/setup.py on its own (pure; no aqt needed)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("densha_setup", os.path.join(ROOT, "addon", "setup.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


S = load_setup()
SAMPLE = """{{FrontSide}}
<hr id=answer>
<div class="a">{{よみ}}</div>

<div id="densha" data-card="{{CardID}}"></div>
<script src="_densha.js"></script>"""


class TemplateTest(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(S.detect("{{Back}}"), {"present": False, "marked": False, "plain": False, "dev": False})
        self.assertEqual(S.detect(SAMPLE), {"present": True, "marked": False, "plain": True, "dev": False})
        self.assertEqual(S.detect("x\n" + S.block(True)), {"present": True, "marked": True, "plain": False, "dev": True})
        odd = '<div id="densha" data-card="{{CardID}}" data-dev="1"></div>   \r\n\t<script src="_densha.js"></script>'
        self.assertEqual(S.detect(odd)["plain"], True)
        self.assertEqual(S.detect(odd)["dev"], True)
        self.assertEqual(S.detect('<div id="densha" data-card="{{CardID}}"></div><script src="_densha.js"></script>')["plain"], True)

    def test_add_is_idempotent_and_replaces_the_plain_snippet(self):
        once = S.add("{{Back}}")
        self.assertEqual(once, "{{Back}}\n" + S.block())
        self.assertEqual(S.add(once), once)
        both = SAMPLE + "\n" + S.block()
        fixed = S.add(both)
        self.assertEqual(fixed.count("densha-tabi:begin"), 1)
        self.assertEqual(fixed.count('id="densha"'), 1)
        self.assertTrue(fixed.startswith("{{FrontSide}}\n<hr id=answer>\n<div class=\"a\">{{よみ}}</div>\n"))
        self.assertEqual(S.add(SAMPLE).count('id="densha"'), 1)

    def test_remove_takes_exactly_ours(self):
        tmpl = "<b>{{Back}}</b>\n<script>var x = 1;</script>"
        self.assertEqual(S.remove(S.add(tmpl)), tmpl)
        self.assertEqual(S.remove(S.add(tmpl, dev=True)), tmpl)
        self.assertEqual(S.remove(SAMPLE), SAMPLE[: SAMPLE.index("\n<div id=")])
        self.assertEqual(S.remove(tmpl), tmpl)
        other = '<div id="densha2"></div>\n<script src="other.js"></script>'
        self.assertEqual(S.remove(other), other)
        mid = "A\n" + S.block() + "\nB"
        self.assertEqual(S.remove(mid), "A\nB")

    def test_test_mode_toggle(self):
        on = S.add("{{Back}}", dev=True)
        self.assertTrue(S.detect(on)["dev"])
        off = S.add(on, dev=False)
        self.assertFalse(S.detect(off)["dev"])
        self.assertEqual(off, "{{Back}}\n" + S.block())

    def test_plan_only_back_templates_and_only_changes(self):
        nts = [
            {"id": 1, "name": "A", "tmpls": [{"ord": 0, "name": "c1", "qfmt": "{{F}}", "afmt": "{{B}}"},
                                              {"ord": 1, "name": "c2", "qfmt": "{{F}}", "afmt": SAMPLE}]},
            {"id": 2, "name": "B", "tmpls": [{"ord": 0, "name": "c", "qfmt": "{{F}}", "afmt": "{{B}}"}]},
        ]
        out = S.plan(nts, {(1, 0): True, (1, 1): False, (2, 0): False}, {1: False})
        self.assertEqual([nt["id"] for nt in out], [1])
        self.assertTrue(S.detect(out[0]["tmpls"][0]["afmt"])["marked"])
        self.assertFalse(S.detect(out[0]["tmpls"][1]["afmt"])["present"])
        self.assertEqual(out[0]["tmpls"][0]["qfmt"], "{{F}}")
        self.assertEqual(nts[0]["tmpls"][0]["afmt"], "{{B}}")                 # the originals untouched
        self.assertEqual(S.remove_all(nts)[0]["tmpls"][1]["afmt"], SAMPLE[: SAMPLE.index("\n<div id=")])
        self.assertEqual(len(S.remove_all(nts)), 1)


class ScriptVersionTest(unittest.TestCase):
    def test_versions(self):
        self.assertEqual(S.script_version('/* でんしゃ たび */\n(function(){\n  var DT_VERSION = "1.2.0";'), "1.2.0")
        self.assertEqual(S.script_version('/* でんしゃ たび */ var DT_VERSION = "dev";'), "dev")
        self.assertEqual(S.script_version("/* でんしゃ たび (Train Trip) */ old release"), "")
        self.assertIsNone(S.script_version("someone else's script"))
        self.assertIsNone(S.script_version(None))
        self.assertEqual(S.parse("1.10.0"), (1, 10, 0))
        self.assertIsNone(S.parse("dev"))
        self.assertIsNone(S.parse("1.0-beta"))

    def test_is_newer(self):
        self.assertTrue(S.is_newer("1.2.10", "1.2.9"))
        self.assertFalse(S.is_newer("1.2.0", "1.2.0"))
        self.assertFalse(S.is_newer("1.1.0", "1.2.0"))          # never a downgrade
        self.assertFalse(S.is_newer("dev", "1.0.0"))             # a dev build never replaces anything
        self.assertFalse(S.is_newer("2.0.0", "dev"))             # an installed dev build is never replaced
        self.assertTrue(S.is_newer("1.1.0", ""))                 # unstamped (older release): older than any number
        self.assertFalse(S.is_newer("1.1.0", None))              # not our file

    def test_should_copy(self):
        stamped = lambda v: '/* でんしゃ たび */ var DT_VERSION = "%s";' % v
        # profile open: never creates, refreshes an older one only
        self.assertFalse(S.should_copy(None, "1.2.0", creating=False))
        self.assertTrue(S.should_copy(stamped("1.1.0"), "1.2.0", creating=False))
        self.assertFalse(S.should_copy(stamped("1.3.0"), "1.2.0", creating=False))
        self.assertFalse(S.should_copy(stamped("dev"), "1.2.0", creating=False))
        self.assertFalse(S.should_copy(stamped("1.1.0"), "dev", creating=False))
        self.assertFalse(S.should_copy(stamped("1.1.0"), None, creating=False))
        # applying "Add": creates a missing one, else the same rule
        self.assertTrue(S.should_copy(None, "1.2.0", creating=True))
        self.assertFalse(S.should_copy(stamped("1.3.0"), "1.2.0", creating=True))
        self.assertTrue(S.should_copy("/* でんしゃ たび */", "1.2.0", creating=True))

    def test_write_media_replaces_with_a_rename(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "_densha.js")
            with open(p, "w") as f:
                f.write("old")
            S.write_media(d, "_densha.js", b"new")
            with open(p) as f:
                self.assertEqual(f.read(), "new")
            self.assertEqual(sorted(os.listdir(d)), ["_densha.js"])     # no temporary file left


class ReleaseStampTest(unittest.TestCase):
    def test_the_game_has_the_stamp_release_sh_replaces(self):
        with open(os.path.join(ROOT, "densha.js"), encoding="utf-8") as f:
            text = f.read()
        self.assertIn('var DT_VERSION = "dev";', text)
        self.assertEqual(S.script_version(text), "dev")


class ReviewFixesTest(unittest.TestCase):
    def test_apply_replaces_an_installed_dev_build_but_profile_open_doesnt(self):
        dev = '/* でんしゃ たび */ var DT_VERSION = "dev";'
        self.assertTrue(S.should_copy(dev, "1.2.0", creating=True))
        self.assertFalse(S.should_copy(dev, "1.2.0", creating=False))
        self.assertFalse(S.should_copy(dev, "dev", creating=True))

    def test_the_comment_line_above_the_plain_snippet_goes_with_it(self):
        with open(os.path.join(ROOT, "release", "template-snippet.html"), encoding="utf-8") as f:
            snip = f.read().rstrip("\n")
        tmpl = "{{Back}}\n" + snip
        self.assertTrue(S.detect(tmpl)["plain"])
        self.assertEqual(S.remove(tmpl), "{{Back}}")
        conv = S.add(tmpl)
        self.assertEqual(conv, "{{Back}}\n" + S.block())
        self.assertNotIn("でんしゃ たび:", conv)
        other = "<!-- my own comment -->\n{{Back}}"
        self.assertEqual(S.remove(other + "\n" + snip), other)


def load_ui():
    """addon/ui.py with stub aqt modules (Qt classes are never instantiated here)."""
    class Anything:
        def __init__(self, *a, **k):
            pass
    aqt = types.ModuleType("aqt")
    aqt.mw = types.SimpleNamespace(col=None)
    qt = types.ModuleType("aqt.qt")
    for n in ["QCheckBox", "QDialog", "QDialogButtonBox", "QGroupBox", "QLabel", "QMenu", "QScrollArea", "Qt", "QVBoxLayout", "QWidget"]:
        setattr(qt, n, Anything)
    ops = types.ModuleType("aqt.operations")
    ops.CollectionOp = Anything
    utils = types.ModuleType("aqt.utils")
    utils.askUser = utils.showWarning = utils.tooltip = lambda *a, **k: None
    sys.modules.update({"aqt": aqt, "aqt.qt": qt, "aqt.operations": ops, "aqt.utils": utils})
    for name in [m for m in sys.modules if m == "addon" or m.startswith("addon.")]:
        del sys.modules[name]
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import addon.ui as ui  # noqa: E402
    return ui


class SaveTest(unittest.TestCase):
    def setUp(self):
        self.ui = load_ui()

    def col(self, stored, fail=(), old_anki=False):
        log = []

        class Models:
            def get(self, nid):
                return json.loads(json.dumps(stored[nid])) if nid in stored else None

            def update_dict(self, nt, skip_checks=None):
                if old_anki and skip_checks is not None:
                    raise TypeError("unexpected keyword argument 'skip_checks'")
                if nt["name"] in fail:
                    raise RuntimeError("template error")
                log.append(("update", nt["name"], skip_checks))
                stored[nt["id"]] = nt

        c = types.SimpleNamespace(models=Models(), log=log)
        c.add_custom_undo_entry = lambda name: log.append(("undo", name)) or 7
        c.merge_undo_entries = lambda pos: log.append(("merge", pos)) or "changes"
        return c

    def nt(self, nid, name, mod=1):
        return {"id": nid, "name": name, "mod": mod, "tmpls": []}

    def test_one_undo_step_with_skip_checks(self):
        stored = {1: self.nt(1, "A"), 2: self.nt(2, "B")}
        c = self.col(stored)
        skipped = []
        self.assertEqual(self.ui._save(c, [self.nt(1, "A"), self.nt(2, "B")], skipped), "changes")
        self.assertEqual(c.log, [("undo", "でんしゃ たび setup"), ("update", "A", True), ("update", "B", True), ("merge", 7)])
        self.assertEqual(skipped, [])

    def test_old_anki_without_skip_checks(self):
        stored = {1: self.nt(1, "A")}
        c = self.col(stored, old_anki=True)
        self.ui._save(c, [self.nt(1, "A")], [])
        self.assertIn(("update", "A", None), c.log)

    def test_changed_or_failing_note_types_are_skipped_and_the_rest_saved(self):
        stored = {1: self.nt(1, "A"), 2: self.nt(2, "B", mod=5), 3: self.nt(3, "C")}
        c = self.col(stored, fail=("C",))
        skipped = []
        self.ui._save(c, [self.nt(1, "A"), self.nt(2, "B", mod=4), self.nt(3, "C"), self.nt(9, "Gone")], skipped)
        self.assertEqual(sorted(skipped), ["B", "C", "Gone"])
        self.assertEqual([x for x in c.log if x[0] == "update"], [("update", "A", True)])
        self.assertEqual(c.log[-1], ("merge", 7))           # the op still finishes normally
        self.assertIn("Skipped", self.ui._result([1, 2, 3, 4], skipped))


class ApkgVersionTest(unittest.TestCase):
    def setUp(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("apkg_version", os.path.join(ROOT, "scripts", "apkg_version.py"))
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_legacy_format(self):
        import tempfile
        import zipfile
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "deck.apkg")
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("media", json.dumps({"0": "font.ttf", "1": "_densha.js"}))
                z.writestr("0", b"x")
                z.writestr("1", '/* でんしゃ たび */\n  var DT_VERSION = "1.4.0";')
            self.assertEqual(self.m.densha_version(p), "1.4.0")
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("media", json.dumps({"0": "font.ttf"}))
            self.assertIsNone(self.m.densha_version(p))

    def test_new_format(self):
        try:
            from compression import zstd
        except ImportError:
            self.skipTest("needs Python 3.14 for zstd")
        import tempfile
        import zipfile

        def entry(name):
            b = name.encode()
            body = bytes([0x0A, len(b)]) + b + bytes([0x10, 5])
            return bytes([0x0A, len(body)]) + body
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "deck.apkg")
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("media", zstd.compress(entry("a.png") + entry("_densha.js")))
                z.writestr("0", zstd.compress(b"png"))
                z.writestr("1", zstd.compress('var DT_VERSION = "2.0.1";'.encode()))
            self.assertEqual(self.m.densha_version(p), "2.0.1")
