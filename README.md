# Waxy d'Or

Season tracker and awards for **Waxys Phantoms** (EA Sports FC Pro Clubs, club 392152), run by [twitch.tv/waxysplash](https://twitch.tv/waxysplash).

- Live site: https://waxysplash.github.io/waxydor/
- Every link in one place: https://waxysplash.github.io/waxydor/links.html (also `LINKS.md`)
- Stream overlay (OBS browser source, 500×560 for the full squad): https://waxysplash.github.io/waxydor/overlay.html — add `?n=5` for a top five, `&compact=1` to hide the header, `&short=1` to drop the G+A and MOTM columns, or `?mode=top5` for a compact top five (360×200).

## Stream scenes (OBS browser sources, 1920×1080)
All under `overlays/`, all pull live data from the tracker and share one look (`overlays/brand.css`).

| Scene | URL | Params |
|---|---|---|
| Starting soon | `overlays/starting.html` | `?at=19:00` countdown to a local time · `&md=12` matchday number · `&title=Kick-off|at 7` |
| In-game HUD (transparent) | `overlays/hud.html` | `?md=12` · `&noticker=1` · `&noplate=1` |
| Half time / BRB | `overlays/brb.html` | `?title=Half|time` · `&sub=Back in five` |
| Full time | `overlays/ending.html` | `?raid=StreamerName` · `&next=Sat 7PM CT` · `&md=12` |
| Lower third (transparent) | `overlays/lowerthird.html` | `?title=Press conference` · `&sub=...` · `&for=12` seconds · `&pos=right` |
| Vertical 1080×1920 (TikTok / Shorts) | `overlays/vertical.html` | `?title=Could your captain do *this*?` (`|` = line break, `*word*` = gold) · `&md=12` · `&handle=@name` · `&table=0` · `&bg=1` · `&pos=bottom` |
| Leaderboard widget | `overlay.html` | see above |

Full URLs start with `https://waxysplash.github.io/waxydor/`. Socials, tagline and the default "next matchday" text come from `brand` in `data/config.json`; empty values are hidden.

## Twitch panel kit
`brand/panels.html` shows the seven panel headers with their descriptions ready to paste. The PNGs live in `brand/panels/` (320×100 at 2x) and are regenerated with `npm install && node scripts/panels.mjs`.

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
