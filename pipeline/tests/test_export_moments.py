"""Tests for building the app's moment files."""

import json

import pytest

from conftest import require_game
from export.moments import CONTENT_DIR, export_moment


@pytest.fixture
def allen():
    content = json.loads((CONTENT_DIR / "2013-finals-g6-allen.json").read_text())
    require_game(content["gameId"])
    return content


def test_ray_allen_moment_exports_real_state(allen):
    moment = export_moment(allen)
    assert moment["state"] == {"period": 4, "clockSeconds": 19.4, "score": {"home": 92, "away": 95}, "possession": "home"}
    assert moment["realEnd"]["score"] == {"home": 95, "away": 95}
    assert len(moment["lineups"]["home"]) == len(moment["lineups"]["away"]) == 5


def test_positions_for_a_player_not_on_the_floor_fail(allen):
    allen["positions"]["SAS"][0] = {"playerId": 1495, "name": "T. Duncan", "x": 6, "y": 23}
    with pytest.raises(ValueError, match="on the floor were"):
        export_moment(allen)


def test_player_off_the_court_fails(allen):
    allen["positions"]["MIA"][0]["x"] = 120
    with pytest.raises(ValueError, match="off the court"):
        export_moment(allen)
