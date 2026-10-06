"""Pull league-wide player and team stats for each season.

Each call returns every player (or team) in the league for one season, so a
full season is only a couple dozen requests. Totals, not per-game, so the
transform step can build any rate it needs.

    uv run python -m ingest.season_stats --season 2012-13
    uv run python -m ingest.season_stats --all
"""

import argparse

from nba_api.stats.endpoints import (
    LeagueDashPlayerShotLocations,
    LeagueDashPlayerStats,
    LeagueDashTeamStats,
)

from ingest.cache import fetch_cached, is_cached

FIRST_SEASON = 1996
LAST_SEASON = 2025  # 2025-26, the last completed season

SEASON_TYPES = ("Playoffs", "Regular Season")
PLAYER_MEASURES = ("Base", "Advanced", "Misc", "Defense", "Usage", "Scoring")
TEAM_MEASURES = ("Base", "Advanced")


def season_label(start_year: int) -> str:
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def requests_for_season(season: str):
    for season_type in SEASON_TYPES:
        for measure in PLAYER_MEASURES:
            yield LeagueDashPlayerStats, dict(
                season=season,
                season_type_all_star=season_type,
                measure_type_detailed_defense=measure,
                per_mode_detailed="Totals",
            )
        yield LeagueDashPlayerShotLocations, dict(
            season=season,
            season_type_all_star=season_type,
            distance_range="By Zone",
            per_mode_detailed="Totals",
        )
        for measure in TEAM_MEASURES:
            yield LeagueDashTeamStats, dict(
                season=season,
                season_type_all_star=season_type,
                measure_type_detailed_defense=measure,
                per_mode_detailed="Totals",
            )


def ingest_season(season: str) -> None:
    for endpoint_cls, params in requests_for_season(season):
        label = f"{season} {params['season_type_all_star']:<14} {endpoint_cls.__name__} {params.get('measure_type_detailed_defense', '')}"
        if is_cached(endpoint_cls, **params):
            print(f"  cached   {label}")
            continue
        response = fetch_cached(endpoint_cls, **params)
        print(f"  fetched  {label} ({row_count(response)} rows)")


def row_count(response: dict) -> int:
    # Most endpoints return a list of result sets; shot locations returns a single dict.
    result_sets = response["resultSets"]
    first = result_sets[0] if isinstance(result_sets, list) else result_sets
    return len(first["rowSet"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--season", help="e.g. 2012-13")
    group.add_argument("--all", action="store_true", help=f"{season_label(FIRST_SEASON)} through {season_label(LAST_SEASON)}")
    args = parser.parse_args()

    seasons = [season_label(y) for y in range(FIRST_SEASON, LAST_SEASON + 1)] if args.all else [args.season]
    for season in seasons:
        print(season)
        ingest_season(season)


if __name__ == "__main__":
    main()
