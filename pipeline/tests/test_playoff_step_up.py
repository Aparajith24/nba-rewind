"""Tests for the playoff step-up transform, using the README's worked examples."""

import pandas as pd
import pytest

from transform.playoff_step_up import STEP_UP_STATS, player_step_up, team_rates, true_shooting


def test_true_shooting_matches_ray_allen_2013_playoffs():
    assert true_shooting(234, 172, 54) == pytest.approx(0.598, abs=0.001)


def test_team_rates_measure_defense_on_points_allowed():
    base = pd.DataFrame({"PTS": [100], "PLUS_MINUS": [10], "FGA": [80], "FTA": [20], "FG3A": [30],
                         "TOV": [12], "AST": [22], "FGM": [40], "OREB": [10], "DREB": [30],
                         "STL": [8], "BLK": [5]})
    advanced = pd.DataFrame({"POSS": [100], "PACE": [98.0]})
    rates = team_rates(base, advanced)
    assert rates["points_per_100"] == 100
    assert rates["points_allowed_per_100"] == 90  # scored 100, won by 10


def profile(season_type: str, **stats) -> dict:
    row = {"player_id": 1, "season": "2012-13", "season_type": season_type,
           "pts": 100, "fga": 80, "fta": 20, "fg3a": 30, "tov": 10, "poss": 200, "stl": 4, "blk": 2,
           "usg_pct": 0.2, "ast_pct": 0.2, "oreb_pct": 0.05, "dreb_pct": 0.15, "def_rating": 105.0, "min": 500}
    row.update(stats)
    return row


def test_step_up_is_relative_to_the_league():
    # Same player in both profiles, except his usage rises 10% and his steals fall to zero.
    players = pd.DataFrame([profile("Regular Season"), profile("Playoffs", usg_pct=0.22, stl=0, min=300)])
    league = pd.DataFrame([{"season": "2012-13", **{s: 1.0 for s in STEP_UP_STATS.values()}, "true_shooting": 0.97}])
    row = player_step_up(players, league).iloc[0]

    assert row["playoff_minutes"] == 300
    assert row["usage"] == pytest.approx(1.10)
    # He shot exactly the same while the league dropped 3%, so he beat the league by ~3%.
    assert row["true_shooting"] == pytest.approx(1 / 0.97)
    assert row["steal_rate"] == 0


def test_step_up_is_undefined_when_regular_season_rate_is_zero():
    players = pd.DataFrame([profile("Regular Season", fg3a=0), profile("Playoffs", fg3a=3)])
    league = pd.DataFrame([{"season": "2012-13", **{s: 1.0 for s in STEP_UP_STATS.values()}}])
    assert pd.isna(player_step_up(players, league).iloc[0]["three_rate"])
