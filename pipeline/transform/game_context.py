"""Game context around a moment that the sim needs, from play-by-play.

- In-game shooting before the moment, per player: the "hot hand" signal.
- Timeouts each team has left at the moment's start.
- The real final score and winner, which is what "history changed" is judged on.
"""

from transform.moment_state import clock_seconds

MODERN_TIMEOUT_RULES_SINCE = "2017-18"


def in_game_shooting(past: list[dict]) -> dict[int, dict]:
    """Made/attempted field goals, threes and free throws per player, before the moment."""
    stats: dict[int, dict] = {}
    for a in past:
        kind = a["actionType"]
        if kind not in ("Made Shot", "Missed Shot", "Free Throw") or not a["personId"]:
            continue
        s = stats.setdefault(a["personId"], {"fgm": 0, "fga": 0, "fg3m": 0, "fg3a": 0, "ftm": 0, "fta": 0, "pts": 0})
        if kind == "Free Throw":
            made = not a["description"].startswith("MISS")
            s["fta"] += 1
            s["ftm"] += made
            s["pts"] += made
        else:
            made = kind == "Made Shot"
            three = a["shotValue"] == 3 or "3PT" in a["description"]
            s["fga"] += 1
            s["fgm"] += made
            s["fg3a"] += three
            s["fg3m"] += made and three
            s["pts"] += (3 if three else 2) if made else 0
    return stats


def timeouts_used(past: list[dict], team_name: str) -> list[tuple[int, float, str]]:
    """(period, clock, "regular" | "short") for each timeout this team called before the moment."""
    used = []
    for a in past:
        if a["actionType"] == "Timeout" and a["description"].lower().startswith(team_name.lower()):
            kind = "short" if ": Short" in a["description"] else "regular"
            used.append((a["period"], clock_seconds(a["clock"]), kind))
    return used


def timeouts_left(season: str, period: int, clock: float, used: list[tuple[int, float, str]]) -> int:
    """Timeouts a team can still call, by that era's rules.

    Approximate: the rulebook's per-quarter and last-minutes limits changed several times;
    this encodes the main ones. Since 2017-18: 7 per game, at most 4 in the 4th quarter and
    2 in its last 3 minutes, 2 per overtime. Before: 6 full plus one 20-second per half,
    at most 3 full in the 4th quarter and 2 in its last 2 minutes, 2 full per overtime.
    """
    def count(predicate) -> int:
        return sum(1 for u in used if predicate(*u))

    if season >= MODERN_TIMEOUT_RULES_SINCE:
        if period > 4:
            return max(0, 2 - count(lambda p, c, k: p == period))
        left = 7 - len(used)
        if period == 4:
            left = min(left, 4 - count(lambda p, c, k: p == 4))
            if clock <= 180:
                left = min(left, 2 - count(lambda p, c, k: p == 4 and c <= 180))
        return max(0, left)

    short_left = 1 - count(lambda p, c, k: k == "short" and p >= 3) if period >= 3 else 1
    if period > 4:
        full_left = 2 - count(lambda p, c, k: p == period and k == "regular")
    else:
        full_left = 6 - count(lambda p, c, k: k == "regular")
        if period == 4:
            full_left = min(full_left, 3 - count(lambda p, c, k: p == 4 and k == "regular"))
            if clock <= 120:
                full_left = min(full_left, 2 - count(lambda p, c, k: p == 4 and c <= 120 and k == "regular"))
    return max(0, full_left) + max(0, short_left)


def final_score(actions: list[dict]) -> tuple[int, int, int]:
    """(home, away, number of periods played) at the end of the game."""
    for a in reversed(actions):
        if a["scoreHome"] and a["scoreAway"] and (a["scoreHome"], a["scoreAway"]) != ("0", "0"):
            return int(a["scoreHome"]), int(a["scoreAway"]), max(x["period"] for x in actions)
    raise ValueError("no score in play-by-play")
