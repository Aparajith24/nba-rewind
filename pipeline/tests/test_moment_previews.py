from export.moment_previews import build_previews


def test_previews_keep_resolved_moments_and_the_key_player():
    results = [
        {"number": 32, "gameId": "0041200406", "home": "MIA", "away": "SAS", "score": {"home": 92, "away": 95},
         "period": 4, "startClock": 19.4, "keyPlay": {"playerId": 951, "playerName": "R. Allen", "clock": 5.2, "description": "x"}},
        {"number": 10, "gameId": "g", "home": "LAL", "away": "POR", "score": {"home": 58, "away": 71},
         "period": 4, "startClock": 720.0},  # a takeover: no key play
        {"number": 99, "warnings": ["FAILED: nope"]},
    ]
    previews = build_previews(results)
    assert set(previews) == {"32", "10"}
    assert previews["32"]["keyPlayerId"] == 951 and previews["32"]["startClock"] == 19.4
    assert previews["10"]["keyPlayerId"] is None
