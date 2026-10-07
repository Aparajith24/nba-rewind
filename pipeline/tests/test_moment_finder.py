"""Tests for finding where a moment starts: the last dead ball before the famous play."""

import pytest

from conftest import action, require_game
from transform.moment_finder import find_key_play, find_start, is_dead_ball


def play(kind: str, description: str = "", clock: str = "PT00M10.00S", player: str = "") -> dict:
    a = action(action_type=kind, description=description, clock=clock, player_name=player)
    return a


@pytest.mark.parametrize("kind, description, dead", [
    ("Timeout", "Spurs Timeout", True),
    ("Made Shot", "Allen 25' 3PT Jump Shot", True),
    ("Foul", "Allen S.FOUL", True),
    ("Missed Shot", "MISS James 26' 3PT Jump Shot", False),
    ("Rebound", "Bosh REBOUND", False),
    ("Free Throw", "Leonard Free Throw 2 of 2", True),
    ("Free Throw", "MISS Leonard Free Throw 1 of 2", True),   # another free throw is coming
    ("Free Throw", "MISS Leonard Free Throw 2 of 2", False),  # missed last free throw: live rebound
])
def test_dead_ball_rules(kind, description, dead):
    a = play(kind, description)
    assert is_dead_ball(a, [a]) is dead


def test_turnover_with_a_steal_stays_live():
    turnover = play("Turnover", "James Bad Pass Turnover")
    steal = play("", "Ginobili STEAL (1 STL)")
    assert is_dead_ball(turnover, [turnover, steal]) is False
    out_of_bounds = play("Turnover", "Castle Step Out of Bounds Turnover")
    assert is_dead_ball(out_of_bounds, [out_of_bounds]) is True


def test_key_play_matches_last_name_closest_to_clock():
    actions = [
        play("Made Shot", "Allen jumper", "PT05M00.00S", "Allen"),
        play("Made Shot", "Allen 3PT", "PT00M05.20S", "Allen"),
        play("Rebound", "Bosh REBOUND", "PT00M06.30S", "Bosh"),
    ]
    assert find_key_play(actions, "Allen", 5) == 1
    with pytest.raises(ValueError, match="no plays by"):
        find_key_play(actions, "Duncan", 5)


@pytest.mark.parametrize("game_id, player, clock, expected_start", [
    ("0041200406", "Allen", 5, 19.4),       # Ray Allen: back past LeBron's miss and Bosh's rebound to Leonard's free throws
    ("0042500404", "Anunoby", 11, 30.3),    # Anunoby's block: back past Brunson's miss to Castle's free throws
    ("0042500402", "Wembanyama", 2, 7.5),   # Wemby's last shot: the Spurs timeout
    ("0049600088", "Kerr", 5, 28.0),        # Kerr's jumper: the Bulls timeout after Rodman's rebound
])
def test_finds_the_hand_verified_starts(game_id, player, clock, expected_start):
    require_game(game_id)
    start, _, _ = find_start(game_id, 4, player, clock)
    assert start == expected_start


def test_period_end_is_not_a_dead_ball_but_period_start_is():
    # Some games list "End of 1st OT" before the buzzer-beater itself (2020 Luka game).
    end = play("period", "End of 1st OT")
    end["subType"] = "end"
    start = play("period", "Start of 4th Period")
    start["subType"] = "start"
    assert is_dead_ball(end, [end]) is False
    assert is_dead_ball(start, [start]) is True


def test_and_one_key_play_is_the_shot_not_the_free_throw():
    actions = [
        play("Made Shot", "Johnson 26' 3PT Jump Shot", "PT00M05.70S", "Johnson"),
        play("Free Throw", "Johnson Free Throw 1 of 1", "PT00M05.70S", "Johnson"),
    ]
    assert find_key_play(actions, "Johnson", 6) == 0


def test_key_play_can_name_the_player_by_initial():
    avery = play("Made Shot", "Johnson 18' Jump Shot", "PT00M47.00S", "Johnson")
    avery["playerNameI"] = "A. Johnson"
    larry = play("Missed Shot", "MISS Johnson 3PT", "PT00M45.00S", "Johnson")
    larry["playerNameI"] = "L. Johnson"
    assert find_key_play([larry, avery], "A. Johnson", 45) == 1


@pytest.mark.parametrize("game_id, player, clock, expected_start", [
    ("0041200406", "Allen", 5, 19.4),
])
def test_ray_allen_through_action_keeps_the_key_play_out(game_id, player, clock, expected_start):
    require_game(game_id)
    from transform.moment_state import state_at
    start, through, _ = find_start(game_id, 4, player, clock)
    s = state_at(game_id, 4, start, through)
    assert (s.home.score, s.away.score) == (92, 95)
