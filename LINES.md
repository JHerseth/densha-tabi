# ろせん (lines) — design addendum

The shop sells more lines. The 47-prefecture trip stays as the first line, 「にっぽん いっしゅう」, owned from
the start. Everything in DESIGN.md still holds (pace, bonus, coins, stamp card, content-agnostic); this only adds
*where* the train runs.

## The lines

| id | name | よみ | stations | type | price | fits the model |
|---|---|---|---|---|---|---|
| japan | にっぽん いっしゅう | — | 47 prefectures | loop with ✈️ (as now) | owned | any |
| yamanote | 山手線 | やまのてせん | 30 | loop | 🪙 200 | local |
| enoden | 江ノ島電鉄（江ノ電） | えのでん | 15 | there and back | 🪙 150 | tram |
| yui | ゆいレール | ゆいレール | 19 | there and back | 🪙 250 | monorail |
| odakyu | 小田急小田原線 | おだきゅう おだわらせん | 47 | there and back | 🪙 300 | local |
| tokaido | 東海道新幹線 | とうかいどう しんかんせん | 17 | there and back | 🪙 400 | shinkansen |

Station data (names, readings, a handful of landmark souvenirs, line colour, scenery per station range) lives in
`lines.json`; embed it at build time or in one clearly delimited data block, so it can be corrected without
touching logic.

## Rules

- **One active line.** Cards move the train on the active line only. Every line keeps its own position
  (station, direction, step, segment, laps); switching (のりかえ) pauses the old one where it was. Switching is free
  and instant, from the route map or after buying.
- **Pace is shared.** Segment length, the daily bonus, study days, the stamp card and coins work exactly as now,
  whatever the line. (+10 🪙 per arrival on every line.)
- **Loop lines** (山手線) go round forever; each full round is a lap (stamp ink colour by lap, as now).
- **There-and-back lines**: at the terminus the train turns around (「おりかえし！」) and runs back the other way.
  Each end-to-end run is a lap. The terminus counts as an arrival once (no double stamp on turnaround).
- **First full run of a line**: when every station of a line has a stamp, +100 🪙 and a gold 「ぜんえき せいは！」
  badge on that line (once per line). Make it a proper celebration.
- **Stamps** are per line and station. Stations with a landmark get its souvenir emoji in the stamp and the
  arrival's 「おみやげ」 line; plain stations get a stamp with the line's colour and a small train mark.
  The same real station on two lines (新宿 on 山手線 and 小田急, 品川 on 山手線 and 東海道新幹線, …) has a
  separate stamp per line — each line's stamp book is its own collection.
- **Station sign** (駅名標) and progress strip take the line's colour; the region label becomes the line name for
  non-japan lines.
- **Scenery** reuses the 8 region sets, chosen per station (lines.json gives a scenery key per station range),
  plus anything small that makes a line feel like itself if cheap (the sea for 江ノ電 is the 中国 coast set or a
  variant; city for 山手線; the 中部 set with Fuji around 新富士).
- **Arrival queue** entries carry their line; pressing stamps works as now; 「ぜんぶ おす」 too.
- **Stamp book / route map**: a line picker at the top (owned lines only; unowned shown locked with price). The
  route map draws loops as a ring (山手線) and other lines as the snake, in the line's colour, with the train
  and its direction.

## Shop

A new 「ろせん」 tab, first in the shop: one card per line with its colour band, name with furigana, station count,
a tiny route sketch (ring or line), and price. Owned lines show 「のる」 / 「のっている」 instead. Buying asks
「〇〇を かう？」, then offers 「いま のる？」.

## Save

Bump to `v: 2`. Migrate a v1 save: its position, stamps and queue become line `japan`; nothing else changes. A v1
script meeting a v2 save locks (as now: never overwrites). Keep unknown line ids in the save.
