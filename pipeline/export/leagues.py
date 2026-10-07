"""Build one league file per season: league averages plus the rules in force.

public/data/leagues/{season}.json
    "playoffs" and "regularSeason": league-wide totals and rates from
    data/processed/league_seasons (the baseline for the era toggle).
    "rules": which rule changes were in effect that season. These are facts
    about the rulebook only; how the sim uses them is the engine's job.

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

CONSTANT_RULES = {"shot_clock": 24, "quarter_minutes": 12, "overtime_minutes": 5}


def rules_for(season: str) -> dict:
    # Season labels like "2001-02" sort chronologically as strings.
    in_force = {name: season >= start for name, (start, _) in RULE_CHANGES.items()}
    return {**CONSTANT_RULES, **in_force, "three_point_feet_above_break": 23.75 if in_force["three_point_line_restored"] else 22.0}


def main() -> None:
    table = pd.read_parquet(PROCESSED_DIR / "league_seasons.parquet")
    leagues_dir = OUTPUT_DIR / "leagues"
    leagues_dir.mkdir(parents=True, exist_ok=True)

    for season, rows in table.groupby("season"):
        league = {"season": season, "rules": rules_for(season)}
        for _, row in rows.iterrows():
            league[PROFILE_KEYS[row["season_type"]]] = {c: clean(row[c]) for c in rows.columns if c not in ("season", "season_type")}
        (leagues_dir / f"{season}.json").write_text(json.dumps(league, indent=2) + "\n")

    descriptions = {name: {"since": start, "description": text} for name, (start, text) in RULE_CHANGES.items()}
    (leagues_dir / "rule-changes.json").write_text(json.dumps(descriptions, indent=2) + "\n")
    print(f"leagues/: {table['season'].nunique()} seasons + rule-changes.json")


if __name__ == "__main__":
    main()
