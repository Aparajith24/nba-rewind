"""Tests for the player and league file exports."""

import math

import pandas as pd

from export.leagues import rules_for
from export.players import clean, index_entry, player_file


def test_clean_makes_values_json_friendly():
    assert clean(math.nan) is None
    assert clean(39.0) == 39 and isinstance(clean(39.0), int)
    assert clean(0.123456) == 0.1235
    assert clean("MIA") == "MIA"


def test_player_file_groups_seasons_and_profiles():
    rows = pd.DataFrame([
        {"player_id": 1, "player_name": "Ron Artest", "season": "2009-10", "season_type": "Regular Season",
         "team": "LAL", "team_id": 10, "age": 30.0, "pts": 1000.0},
        {"player_id": 1, "player_name": "Ron Artest", "season": "2009-10", "season_type": "Playoffs",
         "team": "LAL", "team_id": 10, "age": 30.0, "pts": 250.0},
        {"player_id": 1, "player_name": "Metta World Peace", "season": "2013-14", "season_type": "Regular Season",
         "team": "NYK", "team_id": 20, "age": 34.0, "pts": 100.0},
    ])
    player = player_file(rows)
    assert player["name"] == "Metta World Peace"  # latest spelling wins
    assert player["seasons"]["2009-10"]["playoffs"] == {"pts": 250}
    assert player["seasons"]["2009-10"]["regularSeason"] == {"pts": 1000}
    assert "playoffs" not in player["seasons"]["2013-14"]
    assert index_entry(player)["seasons"] == [
        {"season": "2009-10", "team": "LAL", "playoffs": True},
        {"season": "2013-14", "team": "NYK", "playoffs": False},
    ]


def test_rules_switch_on_in_the_right_seasons():
    assert rules_for("1996-97")["three_point_feet_above_break"] == 22.0
    assert rules_for("1997-98")["three_point_feet_above_break"] == 23.75
    assert not rules_for("2000-01")["zone_defense_allowed"]
    assert rules_for("2001-02")["zone_defense_allowed"]
    assert not rules_for("2003-04")["hand_checking_banned"]
    assert rules_for("2004-05")["hand_checking_banned"]
    assert not rules_for("2017-18")["offensive_rebound_reset_14"]
    assert rules_for("2018-19")["offensive_rebound_reset_14"]
