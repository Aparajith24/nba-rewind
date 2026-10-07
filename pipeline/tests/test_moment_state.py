"""Tests for rebuilding game state from play-by-play.

The known-state tests are checked against what really happened in each game.
"""

import pytest

from conftest import action, require_game
from ingest.moment_games import fetch_play_by_play
from transform.moment_state import (
    LINEUP_SIZE,
    Player,
    Roster,
    _apply_substitution,
    _infer_starters,
    clock_seconds,
    normalize_name,
    state_at,
)

TEAM = 1


def roster(*players: tuple[int, str, str], actions: list[dict] = ()) -> Roster:
    """A Roster from (person_id, first_name, family_name) tuples."""
    team = {
        "teamId": TEAM,
        "teamTricode": "TST",
        "players": [{"personId": pid, "firstName": first, "familyName": family, "nameI": f"{first[0]}. {family}"}
                    for pid, first, family in players],
    }
    return Roster(team, list(actions))


# --- pure unit tests (no data needed) ---

@pytest.mark.parametrize("clock, seconds", [("PT12M00.00S", 720), ("PT00M05.20S", 5.2), ("PT01M02.50S", 62.5)])
def test_clock_seconds(clock, seconds):
    assert clock_seconds(clock) == pytest.approx(seconds)


@pytest.mark.parametrize("name, plain, no_suffix", [
    ("Nenê", "nene", "nene"),
    ("O'Neal", "oneal", "oneal"),
    ("Hardaway Jr.", "hardaway jr", "hardaway"),
    ("Karl-Anthony Towns", "karl anthony towns", "karl anthony towns"),
    ("Ginóbili", "ginobili", "ginobili"),
])
def test_normalize_name(name, plain, no_suffix):
    assert normalize_name(name) == plain
    assert normalize_name(name, drop_suffix=True) == no_suffix


def test_roster_matches_accents_suffixes_and_play_by_play_spelling():
    r = roster((1, "Manu", "Ginóbili"), (2, "Tim", "Hardaway Jr."), (3, "Ron", "Artest"),
               actions=[action(TEAM, 3, "Made Shot", player_name="World Peace")])
    assert r.resolve("Ginobili", "").person_id == 1
    assert r.resolve("Hardaway", "").person_id == 2
    assert r.resolve("Hardaway Jr.", "").person_id == 2
    assert r.resolve("World Peace", "").person_id == 3  # learned from the play-by-play's own spelling


def test_unknown_name_raises():
    r = roster((1, "Ray", "Allen"))
    with pytest.raises(ValueError, match="can't resolve"):
        r.resolve("Duncan", "SUB: Duncan FOR Allen")


def test_shared_name_resolved_by_who_is_on_the_floor():
    r = roster((1, "Marcus", "Morris"), (2, "Markieff", "Morris"), (3, "Goran", "Dragic"),
               (4, "P.J.", "Tucker"), (5, "Eric", "Bledsoe"), (6, "Alex", "Len"))
    lineup = [r.players[i] for i in (1, 3, 4, 5, 6)]  # Marcus is on, Markieff is on the bench
    sub = action(TEAM, 6, "Substitution", "SUB: Morris FOR Len")
    _apply_substitution(lineup, r, sub)
    assert {p.person_id for p in lineup} == {1, 2, 3, 4, 5}


def test_starters_inferred_from_first_appearance():
    r = roster(*[(i, "P", f"Player{i}") for i in range(1, 8)])
    actions = [
        action(TEAM, 1, "Made Shot", "Player1 2' Layup (2 PTS) (Player2 1 AST)"),
        action(TEAM, 3, "Rebound"),
        action(TEAM, 4, "Substitution", "SUB: Player6 FOR Player4"),
        action(TEAM, 6, "Made Shot", "Player6 Jump Shot"),  # checked in first, so not a starter
        action(TEAM, 5, "Foul"),
    ]
    starters = _infer_starters(actions, r, carried_over=[], period=2)
    assert {p.person_id for p in starters} == {1, 2, 3, 4, 5}


def test_silent_starter_carried_over_from_last_period():
    r = roster(*[(i, "P", f"Player{i}") for i in range(1, 7)])
    actions = [action(TEAM, i, "Rebound") for i in (1, 2, 3, 4)]  # player 5 never touches the ball
    carried = [r.players[i] for i in (1, 2, 3, 4, 5)]
    starters = _infer_starters(actions, r, carried_over=carried, period=2)
    assert {p.person_id for p in starters} == {1, 2, 3, 4, 5}


def test_technical_on_bench_player_is_not_evidence():
    r = roster(*[(i, "P", f"Player{i}") for i in range(1, 7)])
    actions = [action(TEAM, i, "Rebound") for i in (1, 2, 3, 4, 5)]
    actions.insert(0, action(TEAM, 6, "Foul", "Player6 T.FOUL", sub_type="Technical"))
    starters = _infer_starters(actions, r, carried_over=[], period=1)
    assert 6 not in {p.person_id for p in starters}


def test_too_few_starters_raises_instead_of_guessing():
    r = roster(*[(i, "P", f"Player{i}") for i in range(1, 7)])
    actions = [action(TEAM, i, "Rebound") for i in (1, 2, 3)]
    with pytest.raises(ValueError, match="inferred 3 starters"):
        _infer_starters(actions, r, carried_over=[], period=1)


# --- known states from real games (need the local cache) ---

KNOWN_STATES = [
    pytest.param("0049600088", 4, 28.0, ("CHI", 86), ("UTA", 86), "CHI",
                 {"S. Kerr", "S. Pippen", "D. Rodman", "T. Kukoc", "M. Jordan"},
                 {"J. Stockton", "J. Hornacek", "B. Russell", "S. Anderson", "K. Malone"},
                 id="1997 Finals G6, before Kerr's shot"),
    pytest.param("0041200406", 1, 720.0, ("MIA", 0), ("SAS", 0), "MIA",
                 {"M. Chalmers", "L. James", "C. Bosh", "D. Wade", "M. Miller"},
                 {"T. Parker", "D. Green", "K. Leonard", "T. Duncan", "M. Ginobili"},
                 id="2013 Finals G6, opening tip"),
    pytest.param("0041200406", 4, 19.4, ("MIA", 92), ("SAS", 95), "MIA",
                 {"M. Chalmers", "L. James", "C. Bosh", "D. Wade", "R. Allen"},
                 {"T. Parker", "D. Green", "K. Leonard", "B. Diaw", "M. Ginobili"},
                 id="2013 Finals G6, Ray Allen moment (Duncan on the bench)"),
    pytest.param("0042500402", 4, 7.5, ("SAS", 104), ("NYK", 105), "SAS",
                 {"D. Harper", "V. Wembanyama", "L. Kornet", "S. Castle", "D. Vassell"},
                 {"M. Bridges", "L. Shamet", "O. Anunoby", "M. Robinson", "J. Hart"},
                 id="2026 Finals G2, Wemby's last shot"),
    pytest.param("0042500404", 4, 30.3, ("NYK", 105), ("SAS", 106), "NYK",
                 {"K. Towns", "O. Anunoby", "J. Hart", "J. Brunson", "J. Alvarado"},
                 {"V. Wembanyama", "D. Harper", "D. Fox", "D. Vassell", "S. Castle"},
                 id="2026 Finals G4, before Anunoby's tip-in"),
]


@pytest.mark.parametrize("game_id, period, clock, home, away, possession, home_five, away_five", KNOWN_STATES)
def test_known_state(game_id, period, clock, home, away, possession, home_five, away_five):
    require_game(game_id)
    s = state_at(game_id, period, clock)
    assert (s.home.tricode, s.home.score) == home
    assert (s.away.tricode, s.away.score) == away
    assert s.possession_tricode == possession
    assert {p.name for p in s.home.on_floor} == home_five
    assert {p.name for p in s.away.on_floor} == away_five


CACHED_GAMES = sorted({p.values[0] for p in KNOWN_STATES})


@pytest.mark.parametrize("game_id", CACHED_GAMES)
def test_every_period_rebuilds_cleanly(game_id):
    """Walk every substitution in the game: each period must start and end with five distinct players per team."""
    require_game(game_id)
    periods = sorted({a["period"] for a in fetch_play_by_play(game_id)})
    for period in periods:
        for clock in (720.0 if period <= 4 else 300.0, 0.0):
            s = state_at(game_id, period, clock)
            for team in (s.home, s.away):
                ids = {p.person_id for p in team.on_floor}
                assert len(ids) == LINEUP_SIZE, f"period {period} at {clock}s: {team.tricode} has {len(ids)} players"
