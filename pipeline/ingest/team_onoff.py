"""Pull on/off splits: each team's offensive rating with every player on vs. off the floor.

One request per team per regular season. The NBA only has these from 2007-08 on;
earlier seasons are estimated in transform.player_impact.

    uv run python -m ingest.team_onoff
"""

from nba_api.stats.endpoints import LeagueDashTeamStats, TeamPlayerOnOffSummary

from ingest.cache import fetch_cached, is_cached, read_cached
from ingest.season_stats import LAST_SEASON, season_label

FIRST_ONOFF_SEASON = 2007  # 2007-08


def team_ids(season: str) -> list[int]:
    result = read_cached(LeagueDashTeamStats, season=season, season_type_all_star="Regular Season",
                         measure_type_detailed_defense="Base", per_mode_detailed="Totals")["resultSets"][0]
    return [row[result["headers"].index("TEAM_ID")] for row in result["rowSet"]]


def onoff_params(team_id: int, season: str) -> dict:
    return dict(team_id=team_id, season=season, season_type_all_star="Regular Season",
                measure_type_detailed_defense="Advanced", per_mode_detailed="Totals")


def team_onoff(team_id: int, season: str) -> dict:
    return fetch_cached(TeamPlayerOnOffSummary, **onoff_params(team_id, season))


def main() -> None:
    for year in range(FIRST_ONOFF_SEASON, LAST_SEASON + 1):
        season = season_label(year)
        teams = team_ids(season)
        new = sum(not is_cached(TeamPlayerOnOffSummary, **onoff_params(t, season)) for t in teams)
        for t in teams:
            team_onoff(t, season)
        print(f"{season}: {len(teams)} teams ({new} fetched)", flush=True)


if __name__ == "__main__":
    main()
