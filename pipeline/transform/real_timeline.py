"""Turn what really happened after a moment's start into the same event log the sim writes.

With no swap, the app replays reality: the real play-by-play from the moment's start to
the end of the game, staged on the court by the same animation as simulated timelines.
Events follow the engine's format (src/engine/types.ts), plus real-game extras the sim
doesn't produce: substitutions, team rebounds, and regular fouls.

Shot locations come from play-by-play coordinates (tenths of a foot from the hoop),
converted to the shooting team's frame: attacking the basket at (88.75, 25).
"""

import re

from transform.moment_state import clock_seconds, happened_by, state_at

FREE_THROW_OF = re.compile(r"Free Throw (\d) of (\d)")
ASSIST = re.compile(r"\(([^()]+?) \d+ AST\)")

HOOP_X = 88.75
CORNER_THREE_MAX_Y = 92  # tenths of a foot above the hoop: below this a three is a corner three
KEY_HALF_WIDTH = 80
KEY_DEPTH = 140


def _zone(action: dict) -> tuple[str, float, float]:
    """(zone, x, y) for a shot, in the shooting team's frame."""
    xl, yl = action.get("xLegacy") or 0, action.get("yLegacy") or 0
    distance = action.get("shotDistance") or 0
    three = action.get("shotValue") == 3 or "3PT" in action["description"]
    has_location = (xl, yl) != (0, 0)
    x, y = HOOP_X - yl / 10, 25 + xl / 10

    if three:
        if distance >= 40:
            zone = "backcourt"
        elif has_location and yl <= CORNER_THREE_MAX_Y:
            zone = "left_corner3" if xl < 0 else "right_corner3"
        else:
            zone = "above_break3"
        if not has_location:
            x, y = HOOP_X - 25, 25
    else:
        if distance <= 4 or any(w in action["description"] for w in ("Layup", "Dunk", "Tip")):
            zone = "ra"
        elif has_location and abs(xl) <= KEY_HALF_WIDTH and yl <= KEY_DEPTH:
            zone = "paint"
        else:
            zone = "mid"
        if not has_location:
            x, y = {"ra": (HOOP_X - 2, 25), "paint": (HOOP_X - 9, 25), "mid": (HOOP_X - 16, 25)}[zone]
    return zone, round(x, 1), round(y, 1)


def build_real_timeline(game_id: str, start_period: int, start_clock: float, through_action: int | None,
                        actions: list[dict], box: dict, starting_possession: str, starting_frontcourt: bool) -> dict:
    home_id, away_id = box["homeTeam"]["teamId"], box["awayTeam"]["teamId"]
    side_of_team = {home_id: "home", away_id: "away"}
    roster = {}
    for side, team in (("home", box["homeTeam"]), ("away", box["awayTeam"])):
        for p in team["players"]:
            roster[p["personId"]] = {"name": p["nameI"], "side": side}

    happened = happened_by(actions, start_period, start_clock, through_action)
    future = [a for a in actions if not happened(a)]
    start = state_at(game_id, start_period, start_clock, through_action)
    score = {"home": start.home.score, "away": start.away.score}
    period = start_period
    offense = starting_possession
    events: list[dict] = [{"period": start_period, "clock": start_clock, "score": dict(score),
                           "type": "possession", "team": starting_possession, "frontcourt": starting_frontcourt}]

    def stamp(a: dict | None = None) -> dict:
        return {
            "period": a["period"] if a else period,
            "clock": clock_seconds(a["clock"]) if a else 0.0,
            "score": dict(score),
        }

    def possession(side: str, a: dict, frontcourt: bool = False):
        nonlocal offense
        if side != offense:
            offense = side
            events.append({**stamp(a), "type": "possession", "team": side, "frontcourt": frontcourt})

    for i, a in enumerate(future):
        kind = a["actionType"]
        side = side_of_team.get(a["teamId"])
        same_clock = [b for b in future[i + 1:] if b["clock"] == a["clock"] and b["period"] == a["period"]]

        if kind == "period" and a["subType"] == "start":
            period = a["period"]
            lineups = state_at(game_id, period, clock_seconds(a["clock"]))
            events.append({**stamp(a), "type": "periodStart",
                           "lineups": {"home": [p.person_id for p in lineups.home.on_floor],
                                       "away": [p.person_id for p in lineups.away.on_floor]}})
            first = next((b for b in future[i + 1:] if side_of_team.get(b["teamId"]) and b["actionType"] != "Substitution"), None)
            if first:
                offense = ""  # force a possession event for whoever has the jump ball
                possession(side_of_team[first["teamId"]], a)
        elif kind == "period" and a["subType"] == "end":
            events.append({**stamp(a), "type": "periodEnd"})
        elif kind == "Substitution" and side:
            in_name = a["description"].split("SUB: ", 1)[1].split(" FOR ")[0]
            candidates = [pid for pid, r in roster.items() if r["side"] == side and r["name"].split(". ", 1)[-1] == in_name]
            if len(candidates) == 1:
                events.append({**stamp(a), "type": "substitution", "team": side, "out": a["personId"], "in": candidates[0]})
        elif kind == "Timeout" and side is None and a["description"].split(" ")[0].lower() in (
                box["homeTeam"]["teamName"].lower(), box["awayTeam"]["teamName"].lower()):
            name = a["description"].split(" ")[0].lower()
            team_side = "home" if name == box["homeTeam"]["teamName"].lower() else "away"
            events.append({**stamp(a), "type": "timeout", "team": team_side})
        elif kind in ("Made Shot", "Missed Shot") and side:
            zone, x, y = _zone(a)
            value = 3 if zone in ("left_corner3", "right_corner3", "above_break3", "backcourt") else 2
            made = kind == "Made Shot"
            fouled = any(b["actionType"] == "Free Throw" and b["personId"] == a["personId"] for b in same_clock)
            possession(side, a, frontcourt=True)
            assist = ASSIST.search(a["description"]) if made else None
            if assist:
                # "(Bosh 2 AST)": show the pass that set it up.
                passers = [pid for pid, r in roster.items() if r["side"] == side and r["name"].split(". ", 1)[-1] == assist.group(1)]
                if len(passers) == 1 and passers[0] != a["personId"]:
                    events.append({**stamp(a), "type": "pass", "team": side, "from": passers[0], "to": a["personId"]})
            if made:
                score[side] += value
            events.append({**stamp(a), "type": "shot", "team": side, "player": a["personId"], "zone": zone,
                           "value": value, "made": made, "x": x, "y": y, "fouled": fouled})
            if made and not fouled:
                possession("away" if side == "home" else "home", a)
        elif kind == "Free Throw" and side:
            made = not a["description"].startswith("MISS")
            match = FREE_THROW_OF.search(a["description"])
            n, of = (int(match.group(1)), int(match.group(2))) if match else (1, 1)
            if made:
                score[side] += 1
            events.append({**stamp(a), "type": "freeThrow", "team": side, "player": a["personId"], "made": made, "n": n, "of": of})
            if made and n == of and "Technical" not in a["description"]:
                possession("away" if side == "home" else "home", a)
        elif kind == "Rebound":
            team_side = side or side_of_team.get(a["personId"])  # team rebounds carry the team ID as personId
            if team_side:
                player = a["personId"] if a["personId"] in roster else 0
                events.append({**stamp(a), "type": "rebound", "team": team_side, "player": player, "offensive": team_side == offense})
                possession(team_side, a)
        elif kind == "Turnover" and side:
            steal = next((b for b in same_clock if "STEAL" in b["description"]), None)
            player = a["personId"] if a["personId"] in roster else 0
            events.append({**stamp(a), "type": "turnover", "team": side, "player": player,
                           "stolenBy": steal["personId"] if steal else None})
            possession("away" if side == "home" else "home", a, frontcourt=bool(steal))
        elif kind == "Foul" and side and a["personId"] in roster:
            fouled_player = next((b["personId"] for b in same_clock if b["actionType"] == "Free Throw"), None)
            kind_name = "shooting" if "S.FOUL" in a["description"] else "personal"
            events.append({**stamp(a), "type": "foul", "team": side, "player": a["personId"],
                           "on": fouled_player or 0, "kind": kind_name})

    final = dict(score)
    periods = max(a["period"] for a in actions)
    winner = "home" if final["home"] > final["away"] else "away"
    appearing = {start_p.person_id for t in (start.home, start.away) for start_p in t.on_floor}
    for e in events:
        for key in ("player", "in", "out", "stolenBy", "on", "from", "to"):
            if isinstance(e.get(key), int) and e[key]:
                appearing.add(e[key])
        for ids in (e.get("lineups") or {}).values():
            appearing.update(ids)
    return {
        "seed": "real",
        "events": events,
        "final": final,
        "periods": periods,
        "winner": winner,
        "historyChanged": False,
        "players": {str(pid): roster[pid] for pid in sorted(appearing) if pid in roster},
    }
