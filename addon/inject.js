/* でんしゃ たび desktop save: injected by the add-on before the card's answer, so it runs before the card's own
 * <script src="_densha.js"> (Anki's reviewer runs a card's scripts one at a time, in order, waiting for each
 * src script to load). It gives the game a synchronous localStorage-like store whose writes go to the add-on
 * (collection config, so they sync). The add-on fills in the stored dict, the last write sequence it has applied
 * per key, the card id and the size cap (the placeholders below).
 *
 * Desktop keeps one page and swaps card HTML into it, so page state (window.__dtPage) outlives each card. If a
 * write from an earlier card hasn't reached the add-on yet when this card was rendered (bridge messages are
 * asynchronous), the page's own newer value wins over the stale stored one. */
(function () {
  var data = __DATA__, applied = __SEQS__, MAX = __MAX__, w = window;
  var page = w.__dtPage || (w.__dtPage = { vals: {}, seqs: {}, n: 0 });
  // never below what the add-on has applied, so a clock that went back can't make our writes look stale
  Object.keys(applied).forEach(function (k) { if (applied[k] > page.n) page.n = applied[k]; });
  Object.keys(page.seqs).forEach(function (k) {
    if (page.seqs[k] > (applied[k] || 0)) {
      if (page.vals[k] === null) delete data[k]; else data[k] = page.vals[k];
    }
  });
  /** A write sequence that only goes up: microseconds-ish since 1970, past any earlier one on this page. */
  function seq() { page.n = Math.max(page.n + 1, Date.now() * 1000); return page.n; }
  function send(msg) { if (typeof w.pycmd === "function") w.pycmd(msg); }
  w.DENSHA_DESKTOP = { v: 1, card: __CARD__ };
  w.DENSHA_STORE = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) {
      k = String(k); v = String(v);
      // too big for the add-on to keep: fail like a full localStorage, so the game says its save is full
      if (unescape(encodeURIComponent(v)).length > MAX) {
        var e = new Error("QuotaExceededError: the save is too big"); e.name = "QuotaExceededError"; e.code = 22; throw e;
      }
      var s = seq();
      data[k] = v; page.vals[k] = v; page.seqs[k] = s;
      send("densha:set:" + JSON.stringify([k, v, s]));
    },
    removeItem: function (k) {
      k = String(k);
      var s = seq();
      delete data[k]; page.vals[k] = null; page.seqs[k] = s;
      send("densha:del:" + JSON.stringify([k, s]));
    }
  };
})();
