"""Build one league file per season: league averages plus the rules in force.

public/data/leagues/{season}.json
    "playoffs" and "regularSeason": league-wide totals and rates from
    data/processed/league_seasons (the baseline for the era toggle).
    "rules": which rule changes were in effect that season. These are facts
    about the rulebook only; how the sim uses them is the engine's job.
    "playoffAdjustment": how the same playoff teams changed from their own
    regular season to the playoffs (1.0 = no change), from transform.playoff_step_up.
    "bench": what a fringe player looked like that season: the regular-season
    totals of everyone under BENCH_MAX_MINUTES, with rates weighted by minutes.
    The sim pulls small samples toward this instead of the league average, since
    barely playing is itself evidence of a weaker player.

    uv run python -m export.leagues
"""

import json

import pandas as pd

from export.players import OUTPUT_DIR, PROFILE_KEYS, clean
from transform.season_tables import PROCESSED_DIR

# Rule changes inside our 1996-97+ window, keyed by the first season they applied.
RULE_CHANGES = {
    "three_point_line_restored": ("1997-98", "Three-point line back to 23'9\" (22' in the corners). In 1996-97 it was 22' all the way around."),
    "zone_defense_allowed": ("2001-02", "Illegal defense rules removed; zone defenses allowed."),
    "defensive_three_seconds": ("2001-02", "Defenders can't stay in the lane more than 3 seconds without guarding someone."),
    "eight_second_backcourt": ("2001-02", "8 seconds to get the ball past half court (was 10)."),
    "hand_checking_banned": ("2004-05", "Defenders can't use their hands to impede a ball handler on the perimeter."),
    "offensive_rebound_reset_14": ("2018-19", "Shot clock resets to 14 (not 24) after an offensive rebound."),
    "transition_take_foul_penalty": ("2022-23", "A take foul to stop a fast break gives one free throw plus possession."),
}

# Regular-season minutes below which a player counts as a fringe player for the bench profile.
BENCH_MAX_MINUTES = 500
# Rates are averaged weighted by minutes; counting stats are summed. Defensive rating is left
# out: for fringe players it mostly reflects garbage-time opponents and comes out better than
# the league's, so the sim keeps the league average for it.
BENCH_RATE_COLUMNS = ("usg_pct", "oreb_pct", "dreb_pct", "pct_fgm_unassisted")
BENCH_SUM_SKIP = {"player_id", "team_id", "age", "gp"}

CONSTANT_RULES = {"shot_clock": 24, "quarter_minutes": 12, "overtime_minutes": 5}


def rules_for(season: str) -> dict:
    # Season labels like "2001-02" sort chronologically as strings.
    in_force = {name: season >= start for name, (start, _) in RULE_CHANGES.items()}
    return {**CONSTANT_RULES, **in_force, "three_point_feet_above_break": 23.75 if in_force["three_point_line_restored"] else 22.0}


def bench_profile(players: pd.DataFrame, season: str) -> dict:
    """Totals and minute-weighted rates of the season's fringe players, shaped like a player profile."""
    rows = players[(players["season"] == season) & (players["season_type"] == "Regular Season")]
    rows = rows[(rows["min"] > 0) & (rows["min"] < BENCH_MAX_MINUTES)]
    profile = {"players": len(rows)}
    for column in rows.select_dtypes("number").columns:
        if column in BENCH_SUM_SKIP:
            continue
        if column in BENCH_RATE_COLUMNS:
            valid = rows[rows[column].notna()]
            profile[column] = clean(float((valid[column] * valid["min"]).sum() / valid["min"].sum()))
        elif column.endswith(("_fgm", "_fga")) or column in ("min", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "tov", "poss"):
            profile[column] = clean(float(rows[column].sum()))
    return profile


def main() -> None:
    table = pd.read_parquet(PROCESSED_DIR / "league_seasons.parquet")
    players = pd.read_parquet(PROCESSED_DIR / "player_seasons.parquet")
    adjustment = pd.read_parquet(PROCESSED_DIR / "league_playoff_adjustment.parquet").set_index("season")
    leagues_dir = OUTPUT_DIR / "leagues"
    leagues_dir.mkdir(parents=True, exist_ok=True)

    for season, rows in table.groupby("season"):
        league = {
            "season": season,
            "rules": rules_for(season),
            "playoffAdjustment": {c: clean(v) for c, v in adjustment.loc[season].items()},
            "bench": bench_profile(players, season),
        }
        for _, row in rows.iterrows():
            league[PROFILE_KEYS[row["season_type"]]] = {c: clean(row[c]) for c in rows.columns if c not in ("season", "season_type")}
        (leagues_dir / f"{season}.json").write_text(json.dumps(league, indent=2) + "\n")

    descriptions = {name: {"since": start, "description": text} for name, (start, text) in RULE_CHANGES.items()}
    (leagues_dir / "rule-changes.json").write_text(json.dumps(descriptions, indent=2) + "\n")
    print(f"leagues/: {table['season'].nunique()} seasons + rule-changes.json")


if __name__ == "__main__":
    main()
