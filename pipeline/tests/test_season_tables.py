"""Tests for the season stats transform."""

import pytest
from nba_api.stats.endpoints import LeagueDashPlayerStats

from ingest.cache import is_cached
from transform.season_tables import ZONES, player_season_table, shot_zone_frame


def test_shot_zone_frame_unpacks_grouped_columns():
    zones = ["Restricted Area", "In The Paint (Non-RA)", "Mid-Range", "Left Corner 3",
             "Right Corner 3", "Above the Break 3", "Backcourt", "Corner 3"]
    response = {"resultSets": {
        "headers": [{"name": "SHOT_CATEGORY", "columnNames": zones, "columnSpan": 3, "columnsToSkip": 6}, {}],
        "rowSet": [[7, "Test Player", 1, "TST", 30.0, "Test",
                    5, 10, 0.5,  1, 4, 0.25,  2, 8, 0.25,  3, 6, 0.5,
                    0, 2, 0.0,  4, 9, 0.444,  None, None, None,  3, 8, 0.375]],
    }}
    row = shot_zone_frame(response).iloc[0]
    assert (row["ra_fgm"], row["ra_fga"]) == (5, 10)
    assert (row["left_corner3_fgm"], row["left_corner3_fga"]) == (3, 6)
    assert (row["above_break3_fgm"], row["above_break3_fga"]) == (4, 9)
    assert (row["backcourt_fgm"], row["backcourt_fga"]) == (0, 0)  # nulls become zero
    assert "corner3_fga" not in row  # the combined corner zone is skipped


def test_ray_allen_2013_playoffs():
    if not is_cached(LeagueDashPlayerStats, season="2012-13", season_type_all_star="Playoffs",
                     measure_type_detailed_defense="Base", per_mode_detailed="Totals"):
        pytest.skip("2012-13 stats not in data/raw; run ingest.season_stats first")
    table = player_season_table("2012-13", "Playoffs")
    allen = table[table["player_name"] == "Ray Allen"].iloc[0]
    assert (allen["fg3m"], allen["fg3a"]) == (39, 96)
    assert allen["left_corner3_fga"] + allen["right_corner3_fga"] == 44
    assert sum(allen[f"{z}_fga"] for z in ZONES.values()) == allen["fga"]
    assert table["player_id"].is_unique
