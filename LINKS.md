# Waxy d'Or · every link

Also live at https://waxysplash.github.io/waxydor/links.html

## Site
- Stats site: https://waxysplash.github.io/waxydor/
- Twitch panel kit (headers + copy): https://waxysplash.github.io/waxydor/brand/panels.html
- Matchday Ops checklist (private, Claude): https://claude.ai/artifact/DY8B8VCcoQnyBWAp921RNB
- Repo: https://github.com/Waxysplash/waxydor

## OBS scenes (browser source, 1920×1080)
- Starting soon: https://waxysplash.github.io/waxydor/overlays/starting.html?at=19:00&md=12
- In-game HUD (transparent): https://waxysplash.github.io/waxydor/overlays/hud.html?md=12
- Half time / BRB: https://waxysplash.github.io/waxydor/overlays/brb.html
- Full time: https://waxysplash.github.io/waxydor/overlays/ending.html?raid=StreamerName&md=12
- Lower third (transparent): https://waxysplash.github.io/waxydor/overlays/lowerthird.html?title=Press%20conference&for=12

## Vertical, channel brand only (1080×1920, for the Morocco Road to Glory series and anything not Pro Clubs)
- Crest + twitch.tv/Waxysplash, nothing else: https://waxysplash.github.io/waxydor/overlays/vertical-brand.html
- `pos=bottom` crest at the bottom · `size=` crest height in px (default 360) · `bg=1` brand background
- Optional extras, off unless given: `series=` · `ep=` · `title=` headline (`|` line break, `*word*` gold) · `handle=@tiktok`

## Vertical, Pro Clubs (1080×1920)
- Transparent, over the game: https://waxysplash.github.io/waxydor/overlays/vertical.html?md=12&title=Could%20your%20captain%20do%20*this*%3F
- Headline at the bottom instead: add `&pos=bottom`
- No leaderboard: add `&table=0`
- Brand background for talking-head clips: add `&bg=1`
- Your handle: add `&handle=@yourtiktok` (or set it once in `data/config.json` → `brand.socials.tiktok`)

## Leaderboard widgets
- Full squad (500×560): https://waxysplash.github.io/waxydor/overlay.html
- Compact top five (360×200): https://waxysplash.github.io/waxydor/overlay.html?mode=top5

## Chat bot
- `!table` → `$(urlfetch https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/table.txt)`
- `!waxydor` → `The Waxy d'Or race, every stat, every match: https://waxysplash.github.io/waxydor/`

## Parameters
- `md` matchday number · `at` kick-off time (HH:MM, local) · `raid` raid target · `title` headline (`|` = line break, `*word*` = gold)
- `for` seconds a lower third stays · `pos` left/right (lower third) or top/bottom (vertical) · `next` next matchday text
