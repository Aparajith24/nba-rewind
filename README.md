# NBA Rewind

Take one of the greatest NBA playoff moments since 1996–97, swap any player from any season into it, and watch what happens. The app replays the moment from its real game state (score, clock, possession, the ten players on the floor) thousands of times and shows how often history changes.

> Work in progress. The data pipeline is done; the app and the simulation engine are next.

This repo contains **code only**. No NBA data is committed. You build the data yourself with the pipeline below, which pulls it from the public stats.nba.com API.

---

## Building the data

### Requirements
- [uv](https://docs.astral.sh/uv/) (`brew install uv` on macOS). It installs the right Python (3.12) and every dependency for you.
- No API key or account. stats.nba.com is public.

### One command
```bash
cd pipeline
uv sync                    # first time only: install dependencies
uv run python -m build     # run the whole pipeline
```

The **first run takes about 20 minutes**, almost all of it waiting politely between API requests (~560 of them, 2 seconds apart). Every response is saved to disk and never requested again, so **every later run takes about 10 seconds**.

### Run the tests
```bash
cd pipeline
uv run pytest
```
Tests that need real game data skip themselves if you haven't built the data yet. The tests never call the API.

### What gets built

```
stats.nba.com
     │  every request goes through one cached, throttled client
     ▼
data/raw/            raw API responses, one JSON file per request (~45 MB)
     │  transform
     ▼
data/processed/      clean tables (Parquet)
     │  export (+ hand-written moment content from content/moments/)
     ▼
public/data/         the JSON files the app loads (~30 MB)
```

| File | What it is |
|---|---|
| `public/data/index.json` | Search index: every player, his seasons, his team, whether he made the playoffs. Loaded once. |
| `public/data/players/{id}.json` | Everything about one player, every season. Loaded only when he's picked. |
| `public/data/leagues/{season}.json` | League averages, the rules in force, and how the playoffs differed that year. |
| `public/data/moments/{id}.json` | One moment: real score, clock, possession, both lineups, positions on the court. |

All three data folders are gitignored. To deploy, build locally and upload `public/data/` with the site. Don't build data in CI: it would slow every deploy, and stats.nba.com is known to block cloud servers.

### Pipeline layout

| Step | File | What it does |
|---|---|---|
| Ingest | `pipeline/ingest/cache.py` | The only code that calls the API. Waits 2 s between requests, retries failures, saves every raw response, never asks twice. |
| Ingest | `pipeline/ingest/season_stats.py` | Every player and team, every season since 1996–97, playoffs and regular season. 18 requests per season. |
| Ingest | `pipeline/ingest/moment_games.py` | One game's full play-by-play and roster. |
| Transform | `pipeline/transform/season_tables.py` | Raw stats → `player_seasons` and `league_seasons` tables. |
| Transform | `pipeline/transform/playoff_step_up.py` | How the league, and each player, changed from regular season to playoffs. |
| Transform | `pipeline/transform/moment_state.py` | The exact game state at any instant of a game. |
| Export | `pipeline/export/*.py` | Tables → the app's JSON files. |
| — | `pipeline/build.py` | Runs everything above in order. |

---

## How the data is calculated, and why

The app asks one question over and over: *if this player had been on the floor at this moment, what would he have done?* To answer it, the simulation needs three things: the exact situation, a profile of the player as he was in the playoffs, and how the game itself differed between eras. Here's how each is built.

### 1. The moment: rebuilding the real game state

**Why:** a swap only means something if everything else is real: the actual score, clock, who has the ball, and the nine other players who were on the floor.

**The problem:** play-by-play records every event, including substitutions, but **never the lineup itself**. Substitutions made between quarters aren't recorded at all. And the NBA's endpoints that should give lineups directly don't work for this (one returns nothing; the box score ignores its time filters).

**The rule:** for each quarter, a player **started the quarter if he appears in it before he ever checks in.** "Appears" means anything: a shot, rebound, foul, assist, steal, or checking out. Then every substitution is applied in order up to the moment.

```
for each quarter:
    starters = players whose first event is NOT "checking in"
    if fewer than 5 found:
        add players from the end of last quarter who never appear (they played silently)
    if still not exactly 5:
        stop with an error (never guess)
    apply substitutions in order:  "SUB: X FOR Y"  →  Y leaves, X enters
```

Edge cases it handles:
- **Technical fouls and ejections** can hit players on the bench, so they don't count as evidence.
- **Names** in substitutions are written by last name only, sometimes spelled differently from the roster (accents, "Jr."). Names are normalized (`Nenê → nene`, `Hardaway Jr. → hardaway`) and matched against both the roster and the play-by-play's own spelling of each player.
- **Two players with the same name**: whoever checks in can't already be on the floor, which settles it.

**Example: 2013 Finals Game 6.** In the last 30 seconds Popovich swaps Duncan and Diaw at every stoppage: `SUB: Diaw FOR Duncan` at 28.2 s, `SUB: Duncan FOR Diaw` at 20.1 s, `SUB: Diaw FOR Duncan` again at 19.4 s. Replaying those in order, the rebuilt Spurs lineup at 19.4 s is Parker, Green, Leonard, Diaw, Ginobili, with **Duncan on the bench** when Chris Bosh grabs the rebound that leads to Ray Allen's corner three. That's what really happened.

**Where a moment starts:** at the **last dead ball before the famous play**, not at the shot itself. Ray Allen's moment starts at 19.4 s (Heat down 95-92, Heat ball after Leonard's free throws), not at 5.2 s when the shot went in. That way the simulation plays the whole sequence (LeBron's miss, the rebound, the kick-out), and a swap can change who shoots, who rebounds and who's open.

**Court coordinates** are in feet, from the offense's point of view: `x` runs 0 (the offense's own baseline) to 94 (the baseline it attacks), `y` runs 0 to 50 across. The basket being attacked is at (88.75, 25). Full court, because many moments start with an inbound in the backcourt.

### 2. The player: one profile per player per season

**Why:** a swap is a specific version of a player (2015–16 Curry, not "Curry"), so everything is stored per season.

Every player-season gets **two profiles**, `regularSeason` and `playoffs`, each with:
- **Raw totals** (points, attempts, rebounds, turnovers...), so any rate can be recomputed exactly.
- **The NBA's advanced rates** (usage, true shooting, assist %, rebound %, defensive rating...).
- **Shots and makes in 7 court zones:** restricted area, paint, mid-range, left corner 3, right corner 3, above-the-break 3, backcourt.

The two rates used most below:

```
usage            = share of his team's plays he finishes while on the floor
                   (shot, free throws, or turnover). From the NBA.

true shooting    = points / (2 × (FGA + 0.44 × FTA))
                   Scoring efficiency counting threes and free throws.
                   0.44 converts free throw attempts into "possessions used".
```

**Example: Ray Allen, 2013 playoffs.** 234 points on 172 shots and 54 free throws:
```
true shooting = 234 / (2 × (172 + 0.44 × 54)) = 234 / 391.5 = 0.598
```
And from his zone data: 21 of 44 on corner threes.

**Data quirk:** the zone totals can come up a few shots short of total shot attempts, because the NBA occasionally drops a shot's location (at most 10 shots in a season, mostly 2015–17). Players who never took a shot are missing from the zone data entirely and get zeros.

### 3. The league: era baselines and rules

**Why:** the game changed a lot in 30 years. A three-pointer in 1997 and a three-pointer in 2026 are different decisions. The league tables let the app's "raised in that era" mode put a player's numbers in the context of a different season.

| Regular season | 1996–97 | 2012–13 | 2025–26 |
|---|---|---|---|
| Pace (possessions per 48 min) | 91.6 | 92.9 | 100.2 |
| Points per 100 possessions | 105.0 | 104.8 | 114.8 |
| Share of shots that are threes | 21% | 24% | 42% |
| Share of shots from mid-range | 40% | 28% | 10% |

Each league file also records **which rules were in force**, because some changed inside our window:

| Since | Rule |
|---|---|
| 1997–98 | Three-point line back to 23′9″ (22′ in the corners). **In 1996–97 it was 22′ all the way around.** |
| 2001–02 | Zone defense allowed; defensive three seconds; 8 seconds (not 10) to cross half court. |
| 2004–05 | Hand-checking banned. |
| 2018–19 | Shot clock resets to 14 (not 24) after an offensive rebound. |
| 2022–23 | Transition take foul: one free throw plus possession. |

These are stored as facts; how the simulation uses them is decided in the engine.

### 4. The playoffs: how the game, and each player, changes

**Why:** every moment is a playoff moment, and the playoffs are a different game. But many player-seasons have no playoff games (the team missed, or he was hurt or suspended), and some have only a game or two. To swap in *any* player-season, the app needs a believable playoff version of every player, built from evidence about how players change in the playoffs.

#### 4a. How the league changes in the playoffs

We compare the **same playoff teams' own regular season** with their playoffs. (Comparing against the whole league would hide the defensive effect, since only good teams make the playoffs.)

```
league adjustment (for any stat) = playoff teams' rate in the playoffs
                                   ÷ the same teams' rate in the regular season

1.00 = no change,  0.97 = 3% lower in the playoffs
```

The result is clear: **playoff teams score fewer points per game in the playoffs than in their own regular season in all 30 seasons**, 4.3% fewer on average. About 2.4% of that is slower pace (fewer possessions, more half-court) and 1.7% is lower efficiency (tighter defense).

**Example: 2012–13.**
```
true shooting:   playoffs ÷ regular season = 0.970   (shooting 3% worse)
free throw rate:                           = 1.075   (7.5% more trips to the line)
steal rate:                                = 0.892   (11% fewer steals: teams protect the ball)
points per game:                           = 0.952   (4.8% fewer points)
```

Defense is measured on **points allowed**, not points scored. In the regular season playoff teams also face bad offenses, so their regular-season defense looks better than it will against other playoff teams.

#### 4b. How each player changes: the "step-up"

Some players rise in the playoffs and some shrink, and our data covers 6,089 player-seasons with both profiles. For each one we measure his personal change **relative to the league's change that same year**, so a player is credited or penalized only for changing *more than everyone else did*:

```
his change     = his playoff rate ÷ his regular-season rate
step-up        = his change ÷ league adjustment for that stat

1.00 = he changed exactly as much as the league did
1.10 = he stepped up 10% beyond the league on that stat
0.90 = he faded 10% beyond the league
```

Stats measured: usage, true shooting, three-point rate, free throw rate, turnover rate, assist rate, offensive and defensive rebound rate, steal rate, block rate, defensive rating.

**Example: Jalen Brunson, 2023–24.**
```
usage:          playoffs 0.352 ÷ regular season 0.311 = 1.132
                league usage change is always 1.00 (it's a share of the team)
                step-up = 1.132 ÷ 1.00 = 1.132         → took 13% more of the offense

true shooting:  playoffs 0.536 ÷ regular season 0.593 = 0.905
                league change in 2023–24 = 0.955
                step-up = 0.905 ÷ 0.955 = 0.947        → shot 5% worse than the league's dip
```
Brunson carried a much bigger load and paid for it in efficiency: a classic playoff star.

**Example: Ray Allen, 2012–13.**
```
true shooting:  0.598 ÷ 0.599 = 0.998   (he barely changed)
league change in 2012–13 = 0.970        (everyone else got worse)
step-up = 0.998 ÷ 0.970 = 1.029         → 3% better than the league's playoff dip
```
Ray Allen held his shooting while everyone else got worse.

Averaged over whole careers (minutes-weighted, 1,500+ playoff minutes), the step-up numbers match what fans would say: Brunson and Reggie Miller rise, Kawhi Leonard shoots better, while James Harden, Karl Malone and lob-catching centers like Clint Capela fade.

**Small samples are noisy.** James Harden's 2012–13 playoffs (243 minutes) show a block-rate step-up of 2.13, which is a handful of blocks, not a real skill. The pipeline stores **playoff minutes** with every step-up so the simulation can decide how much to trust each one (next section).

#### 4c. Putting it together in the simulation (planned)

These rules are decided, and the engine will apply them. The pipeline already provides every number they need.

```
projected playoff rate = his regular-season rate
                         × league adjustment for the moment's season
                         × his step-up (from his other playoff runs; closer seasons count more)

his profile in the sim = w × his real playoff rate  +  (1 − w) × projected playoff rate
                         where w grows with his playoff minutes that season
                         (0 with no playoff games, close to 1 for a full playoff run)

each simulated timeline adds a little randomness, larger when the sample is small and capped
```

- **A full playoff run:** essentially his real playoff stats.
- **One hot playoff game:** mostly his regular season, with a chance of that hot hand showing up in some timelines. That's the surprise element, kept in check by the cap.
- **No playoff games:** a pure projection. What if Jordan's Bulls had beaten the Pistons?

The exact weighting and the size of the randomness will be tuned once the simulation runs and can be checked against real outcomes.

---

## Data source and credits

All statistics come from [stats.nba.com](https://www.nba.com/stats) via the open-source [nba_api](https://github.com/swar/nba_api) client. This project is not affiliated with or endorsed by the NBA. It uses no NBA or team logos, team colors, player photos or footage. Review NBA.com's terms of use before any public deployment.
