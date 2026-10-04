# Waxy d'Or

Season tracker and awards for **Waxys Phantoms** (EA Sports FC Pro Clubs, club 392152), run by [twitch.tv/waxysplash](https://twitch.tv/waxysplash).

- Live site: https://waxysplash.github.io/waxydor/
- Stream overlay (OBS browser source, 420×360): https://waxysplash.github.io/waxydor/overlay.html — add `?n=3` for fewer rows, `&compact=1` to hide the header.

## How it works
- `scripts/poll.mjs` pulls member totals, the club record and the last ten league and playoff matches from EA's Pro Clubs endpoint every 20 minutes (GitHub Actions) and commits anything new into `data/`.
- EA only serves the last ten matches per type, so the poller runs often. Season tables do not depend on the match log: they are EA's running totals minus a snapshot taken at the start of each season (`data/snapshots/`).
- The **Waxy index** blends average match rating (40%), goals + assists per game (40%) and MOTM per game (20%), scaled to 100 against the best in the squad. Five apps to qualify. Weights live in `data/config.json`.

## Captain's controls (edit and push, or ask Claude)
- **Seasons:** `data/config.json` → `seasons[]`. Add the next season with its `start`, `playoffsStart` and `end`. The poller freezes a snapshot the first time it runs after `start`.
- **Awards:** `data/awards.json` → `winners`. Example:
  ```json
  "winners": { "s1": { "waxydor": "CHIN0_LOKZ650", "fans": "Melo2Mellow" } }
  ```
  Golden Boot, Playmaker, Mr. Reliable and Iron Man are computed automatically unless you override them the same way.

## Chat commands
`data/table.txt` is regenerated on every poll. Point your bot at it:

- **StreamElements:** `!table` → `$(urlfetch https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/table.txt)`
- **Nightbot:** `!table` → `$(urlfetch https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/table.txt)`
- `!waxydor` → `The Waxy d'Or race, every stat, every match: https://waxysplash.github.io/waxydor/`
