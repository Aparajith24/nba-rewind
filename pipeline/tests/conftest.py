"""Shared test helpers.

Tests that need real game data read it from the local cache (data/raw/), which
isn't in the repo. They skip when it's missing instead of calling the API, so the
suite never touches the network. Run the ingest first to enable them:

    uv run python -m ingest.moment_games --game 0049600088 0041200406 0042500402 0042500404
"""

import pytest

from ingest.cache import cache_path


def is_game_cached(game_id: str) -> bool:
    return all(cache_path(endpoint, {"game_id": game_id}).exists() for endpoint in ("playbyplayv3", "boxscoretraditionalv3"))


def require_game(game_id: str) -> None:
    if not is_game_cached(game_id):
        pytest.skip(f"game {game_id} not in data/raw; run ingest.moment_games first")


def action(team_id: int = 0, person_id: int = 0, action_type: str = "", description: str = "",
           player_name: str = "", period: int = 1, clock: str = "PT10M00.00S", sub_type: str = "") -> dict:
    """A minimal play-by-play action, with only the fields the transform reads."""
    return {
        "teamId": team_id, "personId": person_id, "actionType": action_type, "subType": sub_type,
        "description": description, "playerName": player_name, "playerNameI": player_name,
        "period": period, "clock": clock, "scoreHome": "", "scoreAway": "",
    }
