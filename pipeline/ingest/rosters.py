"""Team rosters: jersey numbers and listed positions for a team-season.

The play-by-play box score leaves jersey numbers blank for older games; the season
roster has them (and positions like "G", "F-C") for every season since 1996-97.

    uv run python -m ingest.rosters --team 1610612748 --season 2012-13
"""

import argparse

from nba_api.stats.endpoints import CommonTeamRoster

from ingest.cache import fetch_cached


def team_roster(team_id: int, season: str) -> dict[int, dict]:
    """personId -> {"jersey": "6", "position": "F"} for one team-season."""
    result = fetch_cached(CommonTeamRoster, team_id=team_id, season=season)["resultSets"][0]
    rows = [dict(zip(result["headers"], row)) for row in result["rowSet"]]
    return {r["PLAYER_ID"]: {"jersey": r["NUM"] or "", "position": r["POSITION"] or ""} for r in rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--team", type=int, required=True)
    parser.add_argument("--season", required=True)
    args = parser.parse_args()
    for pid, info in team_roster(args.team, args.season).items():
        print(pid, info)


if __name__ == "__main__":
    main()
