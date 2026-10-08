from export.draft_moments import choose_layout, game_label, layout_positions


def test_game_label():
    assert game_label("1998 Finals G6") == ("1998 NBA Finals · Game 6", "Game 6 of the 1998 NBA Finals")
    assert game_label("2021 WCF G2") == ("2021 Western Conference Finals · Game 2", "Game 2 of the 2021 Western Conference Finals")


def test_layout_follows_how_the_moment_starts():
    assert choose_layout(5, 300, None) == "jumpball"
    assert choose_layout(4, 720, None) == "halfcourt"
    assert choose_layout(4, 28, {"actionType": "Timeout"}) == "sideline"
    assert choose_layout(4, 19.4, {"actionType": "Free Throw"}) == "baseline"
    assert choose_layout(4, 300, {"actionType": "Timeout"}) == "baseline"  # not late enough to advance the ball


def test_a_big_inbounds_and_a_guard_brings_it_up():
    offense, defense = [1, 2, 3, 4, 5], [6, 7, 8, 9, 10]
    listed = {1: "G", 2: "C", 3: "F", 4: "G-F", 5: "F"}
    off, deff = layout_positions("baseline", offense, defense, listed)
    assert off[2] == (-1, 21)  # the center inbounds from under his own basket
    assert off[1] == (9, 14)  # a guard takes the inbound
    assert set(off) == set(offense) and set(deff) == set(defense)
