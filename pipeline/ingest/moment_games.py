"""Pull the raw game data needed to rebuild a moment's state.

For one game: the full play-by-play and the full-game box score (for each
team's roster). On-court lineups are inferred from play-by-play in
transform.moment_state.

Dead ends, so nobody retries them: GameRotation returns an empty body, and
BoxScoreTraditionalV3 ignores its period and time-range filters (it returns
wrong or empty lineups, or full-game totals).

    uv run python -m ingest.moment_games --game 0041200406
"""

import argparse

from nba_api.stats.endpoints import BoxScoreTraditionalV3, PlayByPlayV3

from ingest.cache import fetch_cached


def fetch_play_by_play(game_id: str) -> list[dict]:
    return fetch_cached(PlayByPlayV3, game_id=game_id)["game"]["actions"]


def fetch_game_box(game_id: str) -> dict:
    return fetch_cached(BoxScoreTraditionalV3, game_id=game_id)["boxScoreTraditional"]


def ingest_game(game_id: str) -> None:
    actions = fetch_play_by_play(game_id)
    box = fetch_game_box(game_id)
    periods = sorted({a["period"] for a in actions})
    print(f"{game_id}: {box['awayTeam']['teamTricode']} @ {box['homeTeam']['teamTricode']}, {len(actions)} actions, periods {periods[0]}-{periods[-1]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game", required=True, nargs="+", help="NBA game id(s), e.g. 0041200406")
    args = parser.parse_args()
    for game_id in args.game:
        ingest_game(game_id)


if __name__ == "__main__":
    main()
