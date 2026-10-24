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
| Vertical 1080×1920, Road to Glory (brass bar on the facecam/game seam) | `overlays/vertical-brand.html` | `?ep=1` · `&seam=640` · `&div=7&rating=80&coins=12k&record=3W 1L` · `&hook=...&hookfor=4` · `&side=right` · `&bar=0` · `&crest=0` · `&series=` |
| Vertical 1080×1920, Pro Clubs | `overlays/vertical.html` | `?title=Could your captain do *this*?` (`|` = line break, `*word*` = gold) · `&md=12` · `&handle=@name` · `&table=0` · `&bg=1` · `&pos=bottom` |
| Leaderboard widget | `overlay.html` | see above |

Full URLs start with `https://waxysplash.github.io/waxydor/`. Socials, tagline and the default "next matchday" text come from `brand` in `data/config.json`; empty values are hidden.

## Twitch panel kit
`brand/panels.html` shows the seven panel headers with their descriptions ready to paste. The PNGs live in `brand/panels/` (320×100 at 2x) and are regenerated with `npm install && node scripts/panels.mjs`.

## How it works
- `scripts/poll.mjs` pulls member totals, the club record and the last ten league and playoff matches from EA's Pro Clubs endpoint every 20 minutes (GitHub Actions) and commits anything new into `data/`.
- EA only serves the last ten matches per type, so the poller runs often. Season tables do not depend on the match log: they are EA's running totals minus a snapshot taken at the start of each season (`data/snapshots/`).
- The **Waxy index** (out of 100) ranks the race: contribution points per game 35, appearances 10, match rating 15, pass accuracy 15, win rate 10, MOTM per game 10, shot and tackle accuracy 5, minus 2 per red card. Contribution points are scored per match by the position played (goals, assists, clean sheets, saves, tackles, passes, missed shots, goals conceded past 3; from Season 2 also a hat-trick bonus and big misses logged by the captain in `bigMisses`). Ten apps to qualify. From Season 2 (`positionRelative` on the season), contribution points, MOTM and match rating are judged against an average player in the same position, from every saved match, smoothed by `positionPrior` matches. The calculation is `ranking.js`, shared by the site, the overlays and `!table`; every number lives in `data/config.json`, and the site's "How it works" tab is written from it.

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

## Fan vote

`vote.html` is the fan ballot for the Waxy d'Or: log in with Twitch, pick a 1st/2nd/3rd (5-3-1), one ballot per Twitch account (voting again replaces it), followers only. Totals are published when voting closes; individual ballots never are.

- The server is `vote-api/`, deployed on Vercel with that folder as the project root. It checks every login with Twitch, checks the follow, and stores ballots in Upstash Redis keyed by Twitch user ID.
- Vercel environment: `TWITCH_CLIENT_ID` (from dev.twitch.tv) plus the Upstash integration's `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- Everything else is `fanVote` in `data/config.json`: dates, shortlist (set at the final whistle), points, `twitchClientId`, `apiUrl`. The server reads the same file, so page and server always agree.
