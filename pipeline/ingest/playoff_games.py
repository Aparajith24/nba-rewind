"""Find playoff game IDs.

Game IDs can't be built from a pattern (1997 Finals G6 is 0049600088, 2013
Finals G6 is 0041200406), so we look them up: one LeagueGameFinder request per
playoff season lists every game with its date and matchup. A series' game N is
the Nth game between those two teams that postseason.

    uv run python -m ingest.playoff_games --season 2012-13 --teams MIA SAS --game 6
"""

import argparse

from nba_api.stats.endpoints import LeagueGameFinder

from ingest.cache import fetch_cached


def playoff_games(season: str) -> list[dict]:
    """One row per team per game (so two per game), as returned by the API."""
    response = fetch_cached(LeagueGameFinder, season_nullable=season, season_type_nullable="Playoffs", league_id_nullable="00")
    result = response["resultSets"][0]
    return [dict(zip(result["headers"], row)) for row in result["rowSet"]]


def find_game(season: str, teams: tuple[str, str], game_number: int) -> str:
    """The game ID of game N of the series between two teams (by abbreviation at the time)."""
    wanted = set(teams)
    games: dict[str, str] = {}
    for row in playoff_games(season):
        opponent = row["MATCHUP"].replace("@", "vs.").split(" vs. ")[-1]
        if {row["TEAM_ABBREVIATION"], opponent} == wanted:
            games[row["GAME_ID"]] = row["GAME_DATE"]
    series = sorted(games, key=lambda game_id: (games[game_id], game_id))
    if not series:
        raise ValueError(f"{season}: no playoff games between {teams[0]} and {teams[1]}")
    if game_number > len(series):
        raise ValueError(f"{season} {teams[0]}-{teams[1]}: asked for game {game_number}, series had {len(series)}")
    return series[game_number - 1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", required=True)
    parser.add_argument("--teams", nargs=2, required=True)
    parser.add_argument("--game", type=int, required=True)
    args = parser.parse_args()
    print(find_game(args.season, tuple(args.teams), args.game))


if __name__ == "__main__":
    main()
