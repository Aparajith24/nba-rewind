"""Draft a content file for every catalog moment that doesn't have one yet.

Writes content/moments/{id}.json (the hand-written side of a moment) from data:
the game, where the moment starts, the hook and intro (stated from the real score
and clock, nothing invented), and starting positions for the ten players, laid out
by how the moment starts (a baseline inbound after a score, a sideline inbound after
a late timeout, a jump ball for overtime). Drafts are marked "draft": true so they
can be polished by hand later. Drafts are regenerated on each run; once a file is
edited by hand and "draft" is removed, it is never overwritten.

    uv run python -m export.draft_moments
"""

import json

from export.moments import CONTENT_DIR
from ingest.moment_games import fetch_game_box, fetch_play_by_play, ingest_game
from ingest.playoff_games import find_game
from ingest.rosters import team_roster
from transform.moment_finder import CATALOG, find_start
from transform.moment_state import clock_seconds, state_at

HOOP = (88.75, 25.0)
LATE_GAME_SECONDS = 120

# Offense spots (feet, attacking the right basket). The first spot is the inbounder.
LAYOUTS = {
    "baseline": [(-1, 21), (9, 14), (13, 33), (38, 42), (52, 7)],  # after a score: inbound under their own basket
    "sideline": [(66, -1), (72, 14), (78, 30), (86, 44), (64, 40)],  # after a late timeout: ball advanced to the frontcourt
    "halfcourt": [(47, -1), (40, 14), (56, 25), (62, 41), (35, 38)],  # start of a quarter: inbound at the division line
    "jumpball": [(45, 25), (40, 12), (40, 38), (54, 12), (54, 38)],  # start of overtime
}
ROUNDS = {
    "Finals": "NBA Finals", "WCF": "Western Conference Finals", "ECF": "Eastern Conference Finals",
    "WCSF": "West Semifinals", "ECSF": "East Semifinals", "WCR1": "West First Round", "ECR1": "East First Round",
}
PERIOD_NAMES = {1: "the 1st quarter", 2: "the 2nd quarter", 3: "the 3rd quarter", 4: "the 4th quarter",
                5: "overtime", 6: "double overtime", 7: "triple overtime"}


def candidates_by_number() -> dict[int, dict]:
    """number -> {"game": "1998 Finals G6", "description": ...} from candidates.md."""
    rows = {}
    for line in (CONTENT_DIR / "candidates.md").read_text().splitlines():
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) == 5 and cells[0].isdigit():
            rows[int(cells[0])] = {"game": cells[1], "description": cells[2]}
    return rows


def game_label(game: str) -> tuple[str, str]:
    """"1998 Finals G6" -> ("1998 NBA Finals · Game 6", "Game 6 of the 1998 NBA Finals")."""
    year, rnd, g = game.split(" ")
    name = ROUNDS.get(rnd, rnd)
    n = g.lstrip("G")
    return f"{year} {name} · Game {n}", f"Game {n} of the {year} {name}"


def clock_text(seconds: float) -> str:
    if seconds >= 60:
        return f"{int(seconds // 60)}:{int(seconds % 60):02d}"
    return f"{seconds:.1f} seconds"


def period_text(period: int) -> str:
    """"the 4th quarter", "overtime", "triple overtime"."""
    return PERIOD_NAMES.get(period, f"{period - 4}OT")


def choose_layout(period: int, clock: float, marker: dict | None) -> str:
    if marker is None:
        return "jumpball" if period > 4 else "halfcourt"
    late = period >= 4 and clock <= LATE_GAME_SECONDS
    if marker["actionType"] in ("Timeout", "Foul", "Violation", "Turnover") and late:
        return "sideline"
    return "baseline"


def toward_hoop(p: tuple[float, float], share: float) -> tuple[float, float]:
    return (round(p[0] + (HOOP[0] - p[0]) * share, 1), round(p[1] + (HOOP[1] - p[1]) * share, 1))


def layout_positions(layout: str, offense: list[int], defense: list[int], listed: dict[int, str]) -> tuple[dict, dict]:
    """(offense positions, defense positions) by player id. A big inbounds, a guard brings it up."""
    def rank_inbounder(pid):  # centers first, then forwards
        pos = listed.get(pid, "")
        return 0 if "C" in pos else 1 if "F" in pos else 2

    def rank_handler(pid):
        return 0 if listed.get(pid, "").startswith("G") else 1

    rest = list(offense)
    inbounder = min(rest, key=rank_inbounder) if layout != "jumpball" else max(rest, key=rank_inbounder)
    rest.remove(inbounder)
    handler = min(rest, key=rank_handler)
    rest.remove(handler)
    order = [inbounder, handler, *rest]

    spots = LAYOUTS[layout]
    off = {pid: spots[i] for i, pid in enumerate(order)}
    deff = {}
    for i, pid in enumerate(defense):
        man = off[order[i]]
        if layout == "jumpball":
            deff[pid] = (round(94 - man[0], 1), man[1])
        elif i == 0:  # the inbounder's defender stands in front of him, on the floor
            deff[pid] = (man[0] + 3, max(man[1], 3)) if layout != "baseline" else (man[0] + 5, man[1])
        else:
            deff[pid] = toward_hoop(man, 0.15 if layout == "baseline" else 0.3)
    return off, deff


def draft(entry: dict, candidate: dict) -> dict:
    game_id = find_game(entry["season"], tuple(entry["teams"]), entry["game"])
    ingest_game(game_id)
    period = entry["period"]
    marker = None
    if "startClock" in entry:
        clock, through = float(entry["startClock"]), None
    else:
        clock, through, _ = find_start(game_id, period, entry["key"]["player"], entry["key"]["clock"])
        marker = next(a for a in fetch_play_by_play(game_id) if a["actionNumber"] == through)

    state = state_at(game_id, period, clock, through)
    box = fetch_game_box(game_id)
    offense_team = state.home if state.possession_tricode == state.home.tricode else state.away
    defense_team = state.away if offense_team is state.home else state.home
    listed = {pid: info["position"] for t in (state.home, state.away) for pid, info in team_roster(t.team_id, entry["season"]).items()}

    layout = choose_layout(period, clock, marker)
    off, deff = layout_positions(layout, [p.person_id for p in offense_team.on_floor], [p.person_id for p in defense_team.on_floor], listed)
    names = {p.person_id: p.name for t in (state.home, state.away) for p in t.on_floor}

    side = "home" if offense_team is state.home else "away"
    team_name = box[f"{side}Team"]["teamName"]
    diff = offense_team.score - defense_team.score
    period_start = clock >= (720 if period <= 4 else 300)
    when = f"Start of {period_text(period)}." if period_start else f"{clock_text(clock)} left."
    if diff < 0:
        hook = f"Down {-diff}. {when}"
        situation = f"The {team_name} trail {defense_team.score}-{offense_team.score}"
    elif diff == 0:
        hook = f"Tied at {offense_team.score}. {when}"
        situation = f"It's tied {offense_team.score}-{defense_team.score}"
    else:
        hook = f"Up {diff}. {when}"
        situation = f"The {team_name} lead {offense_team.score}-{defense_team.score}"
    timing = f"at the start of {period_text(period)}" if period_start else f"with {clock_text(clock)} left in {period_text(period)}"
    label, long_label = game_label(candidate["game"])
    away, home = box["awayTeam"]["teamName"], box["homeTeam"]["teamName"]
    ball = f"the {team_name} have the ball" if diff == 0 else "they have the ball"
    intro = f"{long_label}, {away} at {home}. {situation} {timing}, and {ball}."

    content = {
        "id": entry["id"],
        "number": entry["number"],
        "title": entry["title"],
        "game": label,
        "season": entry["season"],
        "gameId": game_id,
        "period": period,
        "clockSeconds": clock,
    }
    if through is not None and any(
        a["period"] == period and clock_seconds(a["clock"]) == clock and a["actionNumber"] != through
        for a in fetch_play_by_play(game_id)
    ):
        content["throughAction"] = through  # the start shares its clock with later events
    content.update({
        "hook": hook,
        "intro": intro,
        "realOutcome": candidate["description"] + ".",
        "draft": True,
        "positionsNote": f"Generated starting positions ({layout} layout). To be adjusted by hand.",
        "positions": {
            t.tricode: [{"playerId": pid, "name": names[pid], "x": float(x), "y": float(y)} for pid, (x, y) in (off if t is offense_team else deff).items()]
            for t in (state.home, state.away)
        },
    })
    return content


def main() -> None:
    catalog = json.loads(CATALOG.read_text())["moments"]
    candidates = candidates_by_number()
    # Files still marked "draft" are regenerated; anything edited by hand (draft removed) is left alone.
    existing = {d["number"] for d in (json.loads(p.read_text()) for p in CONTENT_DIR.glob("*.json")) if not d.get("draft")}
    for entry in catalog:
        if entry["number"] in existing:
            continue
        try:
            content = draft(entry, candidates[entry["number"]])
        except Exception as exc:  # report and keep going
            print(f"#{entry['number']:>2} {entry['id']}: FAILED {exc}")
            continue
        path = CONTENT_DIR / f"{content['id']}.json"
        path.write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n")
        print(f"#{entry['number']:>2} {entry['id']}: {content['hook']}")


if __name__ == "__main__":
    main()
