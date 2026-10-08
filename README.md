# NBA Rewind

**Rewrite basketball history.** Pick one of 66 of the greatest NBA playoff moments since 1996–97, swap any player from any season onto the floor, and watch what happens.

**Live:** [rewind-moments.pages.dev](https://rewind-moments.pages.dev)

Every moment starts from its real game state, rebuilt from official play-by-play: the score, the clock, who has the ball, and the ten players on the floor. With no swap you watch what really happened. Make a swap and the engine plays the moment out thousands of times in your browser, to the final buzzer and through overtime, and tells you how often history changes.

---

## Features

- **66 playable moments**, 1997 Finals to today: Jordan's flu game, Ray Allen's corner three, the Block, Kawhi's four-bouncer, and more. Browse by era or search.
- **Any player, any season.** Every NBA player-season since 1996–97 can be swapped in. No minutes cutoff.
- **The real ending, replayed.** Without a swap, the actual play-by-play plays back on a top-down court, with substitutions and overtime.
- **Monte Carlo simulation in a Web Worker.** Thousands of possession-level timelines stream in live, compared side by side with the real lineup so you see what *your* swap changed.
- **Playoff-aware player profiles.** Each player's playoff self is built from his real playoff stats, blended by sample size with a projection from his regular season and his career playoff step-up (or fade).
- **Late-game basketball.** Hot hands, crunch-time usage, intentional fouls, timeouts, and putback-or-kick-out decisions on offensive rebounds.
- **Reproducible.** Seeded randomness: the same moment, swap and seed always produce the same timeline.
- **Static and serverless.** Everything runs in the browser. No accounts, no backend.

## How it works

```
stats.nba.com ──► Python pipeline ──► static JSON ──► Next.js app ──► sim engine (Web Worker)
                  ingest, transform,   players, leagues,  court, swap,     possession-level
                  export (cached)      moments            replay, results  Monte Carlo
```

1. **Pipeline (Python).** Pulls every player and team season since 1996–97 and the play-by-play of each moment's game, caches every response, and builds player profiles, league baselines, playoff adjustments and moment states.
2. **Engine (TypeScript).** A pure, seeded possession model: who uses the possession, shot zone, make or miss, turnover, foul, rebound, adjusted for the defense on the floor and the late-game situation.
3. **App (Next.js).** Loads only what it needs (a small search index, then one player file at a time), runs the simulations off the main thread, and animates the featured timeline on the court.

The basketball rules the simulation follows are in [`docs/simulation-rules.md`](docs/simulation-rules.md). Every calculation behind the data, with formulas and real examples, is [below](#how-the-data-is-calculated-and-why).

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 16 (static export), React 19, TypeScript, Tailwind CSS 4, Framer Motion |
| Simulation | TypeScript in a Web Worker, seeded PRNG |
| Data pipeline | Python 3.12, uv, nba_api, pandas, Parquet |
| Tests | Vitest (engine, replay, every moment), pytest (pipeline) |
| Hosting | Cloudflare Pages |

## Project structure

```
pipeline/          Python data pipeline (ingest → transform → export)
content/           hand-written moment content and the moment catalog
src/app/           routes: home, moments, moment page, how it works
src/ui/            screens and components
src/engine/        simulation engine (pure TypeScript, no UI imports)
src/animation/     turns event logs into court keyframes
src/workers/       Web Worker that runs simulation batches
docs/              simulation rules
```

## Getting started

This repo contains **code only**. No NBA data is committed: you build it yourself with the pipeline, once.

### Requirements
- [uv](https://docs.astral.sh/uv/) (`brew install uv` on macOS). It installs Python 3.12 and every dependency.
- Node.js 20+ and npm.
- No API key or account. stats.nba.com is public.

### 1. Build the data
```bash
cd pipeline
uv sync                    # first time only: install dependencies
uv run python -m build     # run the whole pipeline
```

The **first run takes about 20 minutes**, almost all of it waiting politely between API requests (~560 of them, 2 seconds apart). Every response is saved to disk and never requested again, so **every later run takes about 10 seconds**.

### 2. Run the app
```bash
npm install
npm run dev        # http://localhost:3000
```

### 3. Run the tests
```bash
npm test                          # engine, replay, and every moment
cd pipeline && uv run pytest      # data pipeline
```
Pipeline tests that need real game data skip themselves if you haven't built it yet. No test ever calls the API.

## Deployment

`npm run build` writes the whole site to `out/`, including `out/data/` copied from `public/data/`. Upload `out/` to any static host. The live site runs on Cloudflare Pages:

```bash
npm run build
cd out && npx wrangler pages deploy . --project-name <your-project> --branch main
```

Deploy from your machine, not from CI: the data is gitignored, and stats.nba.com is known to block cloud servers. Run the command from inside `out/` so Wrangler deploys the static files as they are instead of reconfiguring the project for a server build.

Team logos and player headshots load from the NBA's image servers at runtime and are never stored in this repo. If an image can't load, the app falls back to the team's abbreviation or a generated silhouette.

---

## The data pipeline

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

All three data folders are gitignored.

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

**Finding the start automatically.** Every moment is listed in `content/moment-catalog.json` with its two teams, the game number in the series, and the famous play (who, and roughly when). `pipeline/transform/moment_finder.py` then:

```
1. game ID   = the Nth game between the two teams that postseason (from the league's game list)
2. key play  = that player's play closest to the given clock
               (at the same clock, the first one: an and-one's shot, not its free throw)
3. start     = walk backward from the key play to the last dead ball:
                 dead:  timeout, substitution, made basket, foul, violation, start of a period,
                        a free throw (unless it's the last one and missed: that's a live rebound),
                        a turnover without a steal (out of bounds)
                 live:  missed shot, rebound, block, a turnover with a steal
4. state     = rebuild score, possession and lineups at that exact point
```

| Moment | Famous play found | Walks back past | Starts at |
|---|---|---|---|
| Ray Allen, 2013 | Allen three, 5.2 s | Bosh rebound, LeBron's missed three | **19.4 s**, Leonard's free throw (Heat down 95-92) |
| Steve Kerr, 1997 | Kerr jumper, 5.0 s | | **28.0 s**, Bulls timeout (tied 86-86) |
| Larry Johnson, 1999 | Johnson three, 5.7 s | | **11.9 s**, Knicks down 91-88, before the four-point play |
| Anunoby, 2026 | Anunoby block, 11.1 s | Fox rebound, Brunson's miss | **30.3 s**, Castle's free throws (Knicks down 106-105) |

It writes a review report to `data/processed/moment_verification.md`. Anything it had to guess is flagged. For example, in the 1997 Flu Game one Bulls player played the entire 4th quarter without appearing in the play-by-play; the two candidates were Kerr and Caffey, and it picked the one with more minutes (Kerr) and flagged it for review.

Names need care across 30 years: play-by-play writes "SUB: A. Davis FOR Smits" when a team has two Davises, "Ty. Thomas" vs "Ti. Thomas", and uses a player's *current* name for his own plays but his name *at the time* in substitutions ("World Peace" vs "Artest", "Freedom" vs "Kanter"). The lineup code matches all of these, prefers exact matches ("Williams" is Grant Williams, not Robert Williams III), and settles the rest by who's already on the floor.

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

#### 4c. Putting it together in the simulation

The full set of basketball rules the simulation follows (who shoots, fouling, timeouts, rebounds) is in [`docs/simulation-rules.md`](docs/simulation-rules.md). For player profiles, the pipeline provides every number the engine needs:

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

### 5. Crunch time and playmaking

**Why:** one player matters most late in close games. Stars take over, role players disappear, and when a creator leaves, everyone else's shots get harder because the defense no longer has to focus on him.

**Crunch-time usage.** The NBA's "clutch" stats (last 5 minutes, score within 5) give each player-season's usage in crunch time. In those minutes the simulation uses it, trusted by how many clutch minutes back it up, and falls back to regular-season usage:

```
crunch-time usage = trust × clutch usage + (1 − trust) × regular-season usage
trust             = clutch minutes ÷ (clutch minutes + 60)
```

**Example: 2015–16.** LeBron James used 31% of the Cavs' plays normally and 43% in 155 clutch minutes; Tristan Thompson fell to 9%.

**Offensive lift.** The NBA's on/off splits give each team's offensive rating with every player on and off the floor, from 2007–08 on:

```
offensive lift = team points per 100 with him on − with him off
```

On/off is noisy when a player barely sat, so each observed value is blended with a prediction from his own stats (trusted by the smaller of his on and off minutes, half-trusted at 400). Before 2007–08 the prediction is all there is. The prediction is a minutes-weighted fit on 9,677 player-seasons with on/off data, using usage, scoring efficiency relative to the league, and assist rate (weighted R² 0.32: it captures the broad shape, not every player).

**Example: LeBron James 2015–16:** +13.9 (observed +15.4: the Cavs scored 114.0 per 100 with him, 98.6 without).

**Playmaking in the simulation.** A swap changes the lineup's total lift. That change moves teammates' make rate, more for players who rely on being set up (their share of assisted makes):

```
change              = (lift coming in − lift going out) ÷ league points per 100
teammate make rate  × (1 + change × (his assisted share ÷ 0.6)),  kept between 0.85× and 1.15×
```

With no swap the change is 0. The swapped-in player keeps his own shooting.

**Effect, 2016 Finals Game 7 (tied, 2:50 left), 5,000 timelines:** with the real lineup the Warriors win 37.8%. Swapping in Jeff Teague (2020–21) for LeBron James raises that to 49.8%, up from 43% before crunch time and playmaking were modeled.

---

## Data source and credits

All statistics come from [stats.nba.com](https://www.nba.com/stats) via the open-source [nba_api](https://github.com/swar/nba_api) client. This project is not affiliated with or endorsed by the NBA. Team logos and player headshots are displayed from the NBA's own image servers and are the property of the NBA and its teams; none are stored in this repository. This is a free, non-commercial fan project.
