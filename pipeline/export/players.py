"""Build the player files the app loads.

public/data/index.json
    Small search index, loaded up front: every player with the seasons he
    played, his team, and whether he played in the playoffs that year.

public/data/players/{playerId}.json
    Everything we have on one player, every season, loaded only when he's
    picked. Each season has a "playoffs" and a "regularSeason" profile (either
    can be missing). All stats from data/processed/player_seasons are
    included; which ones the sim uses is up to the engine. Seasons with both
    profiles also get "stepUp": how much he changed in the playoffs beyond the
    league's own change (1.0 = same as the league), plus his playoff minutes.
    "impact" carries crunch-time usage and on/off offensive lift (transform.player_impact).

    uv run python -m export.players
"""

import json
import math

import pandas as pd

from ingest.cache import REPO_ROOT
from transform.season_tables import PROCESSED_DIR

OUTPUT_DIR = REPO_ROOT / "public" / "data"
PROFILE_KEYS = {"Playoffs": "playoffs", "Regular Season": "regularSeason"}
SEASON_FIELDS = ("team", "team_id", "age")  # same in both profiles, so stored once per season
IDENTITY = ("player_id", "player_name", "season", "season_type")
FLOAT_DIGITS = 4


def clean(value):
    """JSON-friendly value: NaN becomes null, whole floats become ints, others are rounded."""
    if isinstance(value, float):
        if math.isnan(value):
            return None
        return int(value) if value.is_integer() else round(value, FLOAT_DIGITS)
    return value.item() if hasattr(value, "item") else value


def player_file(rows: pd.DataFrame, step_up: pd.DataFrame | None = None, impact: pd.DataFrame | None = None) -> dict:
    """step_up / impact: this player's rows from player_step_up / player_impact.parquet, indexed by season."""
    rows = rows.sort_values("season")
    stat_columns = [c for c in rows.columns if c not in IDENTITY and c not in SEASON_FIELDS]
    seasons = {}
    for season, season_rows in rows.groupby("season", sort=False):
        # Prefer the regular-season row for team (the last team he played for that year), else the playoff row.
        ordered = season_rows.sort_values("season_type", key=lambda s: s != "Regular Season")
        entry = {field: clean(ordered.iloc[0][field]) for field in SEASON_FIELDS}
        for _, row in season_rows.iterrows():
            entry[PROFILE_KEYS[row["season_type"]]] = {c: clean(row[c]) for c in stat_columns}
        if step_up is not None and season in step_up.index:
            entry["stepUp"] = {c: clean(v) for c, v in step_up.loc[season].items() if c != "player_id"}
        if impact is not None and season in impact.index:
            i = impact.loc[season]
            entry["impact"] = {
                "clutchUsage": clean(i["clutch_usage"]),
                "clutchMinutes": clean(i["clutch_minutes"]) or 0,
                "offensiveLift": clean(i["offensive_lift"]),
                "liftSource": i["lift_source"] if isinstance(i["lift_source"], str) else "estimated",
            }
        seasons[season] = entry
    # The most recent spelling of his name (e.g. Ron Artest became Metta World Peace).
    return {"id": clean(rows.iloc[0]["player_id"]), "name": rows.iloc[-1]["player_name"], "seasons": seasons}


def index_entry(player: dict) -> dict:
    return {
        "id": player["id"],
        "name": player["name"],
        "seasons": [
            {"season": season, "team": s["team"], "playoffs": "playoffs" in s}
            for season, s in player["seasons"].items()
        ],
    }


def main() -> None:
    table = pd.read_parquet(PROCESSED_DIR / "player_seasons.parquet")
    step_up = pd.read_parquet(PROCESSED_DIR / "player_step_up.parquet")
    step_up_by_player = {pid: rows.set_index("season") for pid, rows in step_up.groupby("player_id")}
    impact_path = PROCESSED_DIR / "player_impact.parquet"
    impact = pd.read_parquet(impact_path) if impact_path.exists() else pd.DataFrame(columns=["player_id", "season"])
    impact_by_player = {pid: rows.set_index("season") for pid, rows in impact.groupby("player_id")}
    players_dir = OUTPUT_DIR / "players"
    players_dir.mkdir(parents=True, exist_ok=True)

    index = []
    for player_id, rows in table.groupby("player_id"):
        player = player_file(rows, step_up_by_player.get(player_id), impact_by_player.get(player_id))
        (players_dir / f"{player['id']}.json").write_text(json.dumps(player, separators=(",", ":")))
        index.append(index_entry(player))

    index.sort(key=lambda p: p["name"])
    (OUTPUT_DIR / "index.json").write_text(json.dumps(index, separators=(",", ":")))

    total = sum(f.stat().st_size for f in players_dir.glob("*.json"))
    print(f"index.json: {len(index)} players, {(OUTPUT_DIR / 'index.json').stat().st_size / 1024:.0f} KB")
    print(f"players/: {len(index)} files, {total / 1024 / 1024:.1f} MB total")


if __name__ == "__main__":
    main()
