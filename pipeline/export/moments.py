"""Build the moment files the app loads.

Each hand-written file in content/moments/ (title, hook, start time, player
positions) is combined with the state rebuilt from play-by-play (score,
possession, who's on the floor) and written to public/data/moments/.
Positions must cover exactly the ten players the play-by-play says were on
the floor, so a typo or a wrong start time fails loudly.

Court coordinates are in feet, from the offense's point of view:
x runs 0 (the offense's own baseline) to 94 (the baseline it attacks),
y runs 0 to 50 across the floor. The basket being attacked is at (88.75, 25).

    uv run python -m export.moments
    uv run python -m export.moments --id 2013-finals-g6-allen
"""

import argparse
import json

from ingest.cache import REPO_ROOT
from transform.moment_state import MomentState, TeamState, state_at

CONTENT_DIR = REPO_ROOT / "content" / "moments"
OUTPUT_DIR = REPO_ROOT / "public" / "data" / "moments"

COURT_LENGTH_FT = 94.0
COURT_WIDTH_FT = 50.0
OUT_OF_BOUNDS_MARGIN_FT = 4.0  # room for an inbounder standing off the floor


def export_moment(content: dict) -> dict:
    start = state_at(content["gameId"], content["period"], content["clockSeconds"])
    end = state_at(content["gameId"], content["period"], 0)
    if start.possession_tricode is None:
        raise ValueError(f"{content['id']}: couldn't infer possession")

    return {
        "id": content["id"],
        "number": content["number"],
        "title": content["title"],
        "season": content["season"],
        "rulesSeason": content["season"],
        "hook": content["hook"],
        "intro": content["intro"],
        "realOutcome": content["realOutcome"],
        "gameId": content["gameId"],
        "state": {
            "period": start.period,
            "clockSeconds": start.clock_seconds,
            "score": {"home": start.home.score, "away": start.away.score},
            "possession": "home" if start.possession_tricode == start.home.tricode else "away",
        },
        "realEnd": {
            "period": end.period,
            "score": {"home": end.home.score, "away": end.away.score},
        },
        "teams": {
            "home": {"teamId": start.home.team_id, "tricode": start.home.tricode},
            "away": {"teamId": start.away.team_id, "tricode": start.away.tricode},
        },
        "lineups": {
            "home": _lineup(content, start, start.home),
            "away": _lineup(content, start, start.away),
        },
    }


def _lineup(content: dict, state: MomentState, team: TeamState) -> list[dict]:
    positions = {p["playerId"]: p for p in content["positions"][team.tricode]}
    on_floor = {p.person_id: p for p in team.on_floor}
    if positions.keys() != on_floor.keys():
        expected = sorted(p.name for p in team.on_floor)
        given = sorted(p["name"] for p in positions.values())
        raise ValueError(f"{content['id']} {team.tricode}: positions are for {given}, but on the floor were {expected}")

    lineup = []
    for player in team.on_floor:
        x, y = positions[player.person_id]["x"], positions[player.person_id]["y"]
        if not (-OUT_OF_BOUNDS_MARGIN_FT <= x <= COURT_LENGTH_FT + OUT_OF_BOUNDS_MARGIN_FT
                and -OUT_OF_BOUNDS_MARGIN_FT <= y <= COURT_WIDTH_FT + OUT_OF_BOUNDS_MARGIN_FT):
            raise ValueError(f"{content['id']}: {player.name} at ({x}, {y}) is off the court")
        lineup.append({"playerId": player.person_id, "name": player.name, "season": content["season"], "x": x, "y": y})
    return lineup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--id", help="export one moment (default: all)")
    args = parser.parse_args()

    paths = [CONTENT_DIR / f"{args.id}.json"] if args.id else sorted(CONTENT_DIR.glob("*.json"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in paths:
        moment = export_moment(json.loads(path.read_text()))
        out = OUTPUT_DIR / f"{moment['id']}.json"
        out.write_text(json.dumps(moment, indent=2) + "\n")
        print(f"{moment['id']}: wrote {out.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
