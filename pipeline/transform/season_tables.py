"""Turn the raw season stats into two clean tables in data/processed/.

player_seasons.parquet
    One row per player, season, and season type (Playoffs / Regular Season).
    Raw totals (so any rate can be rebuilt), the NBA's own advanced rates,
    shots and makes in each of the seven court zones, and team-share stats.

league_seasons.parquet
    One row per season and season type: league-wide totals and rates
    (pace, efficiency, three-point rate, shot-zone mix, make % by zone).
    This is the baseline for the "raised in that era" toggle.

Reads only from data/raw/ and never calls the API.

    uv run python -m transform.season_tables
"""

import pandas as pd
from nba_api.stats.endpoints import LeagueDashPlayerShotLocations, LeagueDashPlayerStats, LeagueDashTeamStats

from ingest.cache import REPO_ROOT, read_cached
from ingest.season_stats import FIRST_SEASON, LAST_SEASON, SEASON_TYPES, season_label

PROCESSED_DIR = REPO_ROOT / "data" / "processed"

PLAYER_IDENTITY = {"PLAYER_ID": "player_id", "PLAYER_NAME": "player_name", "TEAM_ID": "team_id",
                   "TEAM_ABBREVIATION": "team", "AGE": "age"}

# Raw column -> our column, per measure type. Anything not listed is dropped
# (ranks, fantasy points, and duplicates of columns already taken from Base).
PLAYER_COLUMNS = {
    "Base": {
        "GP": "gp", "MIN": "min", "FGM": "fgm", "FGA": "fga", "FG3M": "fg3m", "FG3A": "fg3a",
        "FTM": "ftm", "FTA": "fta", "OREB": "oreb", "DREB": "dreb", "AST": "ast", "TOV": "tov",
        "STL": "stl", "BLK": "blk", "BLKA": "blka", "PF": "pf", "PFD": "pfd", "PTS": "pts",
        "PLUS_MINUS": "plus_minus",
    },
    "Advanced": {
        "POSS": "poss", "USG_PCT": "usg_pct", "AST_PCT": "ast_pct", "AST_TO": "ast_to",
        "OREB_PCT": "oreb_pct", "DREB_PCT": "dreb_pct", "TM_TOV_PCT": "tov_pct", "EFG_PCT": "efg_pct",
        "TS_PCT": "ts_pct", "OFF_RATING": "off_rating", "DEF_RATING": "def_rating",
        "NET_RATING": "net_rating", "PACE": "pace", "PIE": "pie",
    },
    "Misc": {
        "PTS_OFF_TOV": "pts_off_tov", "PTS_2ND_CHANCE": "pts_2nd_chance",
        "PTS_FB": "pts_fast_break", "PTS_PAINT": "pts_paint",
    },
    "Defense": {
        "PCT_STL": "team_share_stl", "PCT_BLK": "team_share_blk", "PCT_DREB": "team_share_dreb",
        "DEF_WS": "def_win_shares",
    },
    "Usage": {
        "PCT_FGA": "team_share_fga", "PCT_FTA": "team_share_fta", "PCT_TOV": "team_share_tov",
        "PCT_AST": "team_share_ast", "PCT_PTS": "team_share_pts",
    },
    "Scoring": {
        "PCT_AST_2PM": "pct_2pm_assisted", "PCT_AST_3PM": "pct_3pm_assisted",
        "PCT_UAST_FGM": "pct_fgm_unassisted",
    },
}

# Shot-location zones as the API names them -> our prefix. "Corner 3" is skipped:
# it's just left + right corner combined.
ZONES = {
    "Restricted Area": "ra",
    "In The Paint (Non-RA)": "paint",
    "Mid-Range": "mid",
    "Left Corner 3": "left_corner3",
    "Right Corner 3": "right_corner3",
    "Above the Break 3": "above_break3",
    "Backcourt": "backcourt",
}

LEAGUE_TOTALS = {"FGM": "fgm", "FGA": "fga", "FG3M": "fg3m", "FG3A": "fg3a", "FTM": "ftm", "FTA": "fta",
                 "OREB": "oreb", "DREB": "dreb", "AST": "ast", "TOV": "tov", "PTS": "pts"}


def result_frame(response: dict) -> pd.DataFrame:
    result = response["resultSets"][0]
    return pd.DataFrame(result["rowSet"], columns=result["headers"])


def shot_zone_frame(response: dict) -> pd.DataFrame:
    """Unpack the shot-location response: 6 identity columns, then (FGM, FGA, FG_PCT) per zone."""
    zone_header, column_header = response["resultSets"]["headers"]
    skip, span = zone_header["columnsToSkip"], zone_header["columnSpan"]
    rows = []
    for row in response["resultSets"]["rowSet"]:
        record = {"player_id": row[0]}
        for i, zone in enumerate(zone_header["columnNames"]):
            if zone in ZONES:
                fgm, fga = row[skip + i * span], row[skip + i * span + 1]
                record[f"{ZONES[zone]}_fgm"] = fgm or 0
                record[f"{ZONES[zone]}_fga"] = fga or 0
        rows.append(record)
    return pd.DataFrame(rows)


def player_season_table(season: str, season_type: str) -> pd.DataFrame:
    def measure(name: str) -> pd.DataFrame:
        return result_frame(read_cached(
            LeagueDashPlayerStats, season=season, season_type_all_star=season_type,
            measure_type_detailed_defense=name, per_mode_detailed="Totals",
        ))

    base = measure("Base")
    table = base[list(PLAYER_IDENTITY) + list(PLAYER_COLUMNS["Base"])].rename(columns=PLAYER_IDENTITY | PLAYER_COLUMNS["Base"])
    for name, columns in PLAYER_COLUMNS.items():
        if name == "Base":
            continue
        frame = measure(name)[["PLAYER_ID", *columns]].rename(columns={"PLAYER_ID": "player_id"} | columns)
        table = table.merge(frame, on="player_id", how="left", validate="one_to_one")

    zones = shot_zone_frame(read_cached(
        LeagueDashPlayerShotLocations, season=season, season_type_all_star=season_type,
        distance_range="By Zone", per_mode_detailed="Totals",
    ))
    table = table.merge(zones, on="player_id", how="left", validate="one_to_one")
    # Players who never took a shot are left out of the shot-location response; their zones are all zero.
    zone_columns = [c for c in zones.columns if c != "player_id"]
    no_shots = table["fga"] == 0
    table.loc[no_shots, zone_columns] = table.loc[no_shots, zone_columns].fillna(0)
    table.insert(1, "season", season)
    table.insert(2, "season_type", season_type)
    return table


def league_season_row(season: str, season_type: str, players: pd.DataFrame) -> dict:
    def team_measure(name: str) -> pd.DataFrame:
        return result_frame(read_cached(
            LeagueDashTeamStats, season=season, season_type_all_star=season_type,
            measure_type_detailed_defense=name, per_mode_detailed="Totals",
        ))

    base, advanced = team_measure("Base"), team_measure("Advanced")
    totals = {ours: base[raw].sum() for raw, ours in LEAGUE_TOTALS.items()}
    poss = advanced["POSS"].sum()
    row = {
        "season": season,
        "season_type": season_type,
        "teams": len(base),
        "games": base["GP"].sum() / 2,
        **totals,
        "poss": poss,
        "pace": advanced["PACE"].mean(),
        "pts_per_100": 100 * totals["pts"] / poss,
        "efg_pct": (totals["fgm"] + 0.5 * totals["fg3m"]) / totals["fga"],
        "fg3a_rate": totals["fg3a"] / totals["fga"],
        "fg3_pct": totals["fg3m"] / totals["fg3a"],
        "ft_rate": totals["fta"] / totals["fga"],
        "ft_pct": totals["ftm"] / totals["fta"],
        "tov_per_poss": totals["tov"] / poss,
        "oreb_pct": totals["oreb"] / (totals["oreb"] + totals["dreb"]),
    }
    zone_fga_total = sum(players[f"{z}_fga"].sum() for z in ZONES.values())
    for z in ZONES.values():
        fga, fgm = players[f"{z}_fga"].sum(), players[f"{z}_fgm"].sum()
        row[f"{z}_fga_share"] = fga / zone_fga_total if zone_fga_total else None
        row[f"{z}_fg_pct"] = fgm / fga if fga else None
    return row


def build() -> tuple[pd.DataFrame, pd.DataFrame]:
    player_tables, league_rows = [], []
    for start_year in range(FIRST_SEASON, LAST_SEASON + 1):
        season = season_label(start_year)
        for season_type in SEASON_TYPES:
            players = player_season_table(season, season_type)
            player_tables.append(players)
            league_rows.append(league_season_row(season, season_type, players))
    return pd.concat(player_tables, ignore_index=True), pd.DataFrame(league_rows)


def check(players: pd.DataFrame) -> None:
    """Sanity checks that should hold for every row; prints rather than fails so all problems show at once."""
    # The NBA's shot-location data drops the odd shot (mostly 2015-17), so a small shortfall is expected.
    gap = players["fga"] - sum(players[f"{z}_fga"] for z in ZONES.values())
    print(f"  zone shots short of FGA:       {(gap != 0).sum()} of {len(players)} rows, "
          f"worst {gap.max():.0f} shots ({(gap / players['fga']).max():.1%})")
    missing_zones = players["ra_fga"].isna().sum()
    print(f"  rows with no shot-zone data:   {missing_zones}")
    dupes = players.duplicated(["player_id", "season", "season_type"]).sum()
    print(f"  duplicate player-season rows:  {dupes}")


def main() -> None:
    players, leagues = build()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    players.to_parquet(PROCESSED_DIR / "player_seasons.parquet", index=False)
    leagues.to_parquet(PROCESSED_DIR / "league_seasons.parquet", index=False)
    print(f"player_seasons: {len(players)} rows, {players['player_id'].nunique()} players, {len(players.columns)} columns")
    print(f"league_seasons: {len(leagues)} rows")
    check(players)


if __name__ == "__main__":
    main()
