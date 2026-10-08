"""Build the moment files the app loads.

Each hand-written file in content/moments/ (title, game label, hook, start time, player
positions) is combined with the state rebuilt from play-by-play (score,
possession, who's on the floor) and written to public/data/moments/.
Positions must cover exactly the ten players the play-by-play says were on
the floor, so a typo or a wrong start time fails loudly.

Also added: the real ending as a replayable event log (what plays with no
swap), and for the sim: each player's shooting in that game before the moment
(hot hand), each team's timeouts left, and the real final score and winner
(timelines play to the end of the game, overtime included; history changed
means the real loser won).

Court coordinates are in feet, from the offense's point of view:
x runs 0 (the offense's own baseline) to 94 (the baseline it attacks),
y runs 0 to 50 across the floor. The basket being attacked is at (88.75, 25).

    uv run python -m export.moments
    uv run python -m export.moments --id 2013-finals-g6-allen
"""

import argparse
import json

from ingest.cache import REPO_ROOT
from ingest.moment_games import fetch_game_box, fetch_play_by_play
from ingest.rosters import team_roster
from transform.game_context import final_score, in_game_shooting, timeouts_left, timeouts_used
from transform.moment_state import MomentState, TeamState, happened_by, state_at
from transform.real_timeline import build_real_timeline

CONTENT_DIR = REPO_ROOT / "content" / "moments"
OUTPUT_DIR = REPO_ROOT / "public" / "data" / "moments"

COURT_LENGTH_FT = 94.0
COURT_WIDTH_FT = 50.0
OUT_OF_BOUNDS_MARGIN_FT = 4.0  # room for an inbounder standing off the floor


def export_moment(content: dict) -> dict:
    game_id, period, clock = content["gameId"], content["period"], content["clockSeconds"]
    start = state_at(game_id, period, clock, content.get("throughAction"))
    end = state_at(game_id, period, 0)
    if start.possession_tricode is None:
        raise ValueError(f"{content['id']}: couldn't infer possession")

    actions = fetch_play_by_play(game_id)
    happened = happened_by(actions, period, clock, content.get("throughAction"))
    past = [a for a in actions if happened(a)]
    shooting = in_game_shooting(past)
    box = fetch_game_box(game_id)
    team_names = {"home": box["homeTeam"]["teamName"], "away": box["awayTeam"]["teamName"]}
    final_home, final_away, periods = final_score(actions)
    # Jersey numbers and positions from the season rosters (box scores leave them blank for older games).
    roster_info = {**team_roster(start.home.team_id, content["season"]), **team_roster(start.away.team_id, content["season"])}
    jerseys = {pid: info["jersey"] for pid, info in roster_info.items()}
    positions_listed = {pid: info["position"] for pid, info in roster_info.items()}
    offense_side = "home" if start.possession_tricode == start.home.tricode else "away"

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
        "realFinal": {
            "periods": periods,
            "score": {"home": final_home, "away": final_away},
            "winner": "home" if final_home > final_away else "away",
        },
        "realTimeline": build_real_timeline(jerseys,
            game_id, period, clock, content.get("throughAction"), actions, box, offense_side,
            # The offense starts in the frontcourt if it's lined up past half court.
            sum(p["x"] for p in content["positions"][start.home.tricode if offense_side == "home" else start.away.tricode]) / 5 > 47,
            content.get("playCorrections", []),
        ),
        "timeoutsLeft": {
            side: timeouts_left(content["season"], period, clock, timeouts_used(past, team_names[side]))
            for side in ("home", "away")
        },
        "inGame": {
            str(p.person_id): shooting.get(p.person_id, {"fgm": 0, "fga": 0, "fg3m": 0, "fg3a": 0, "ftm": 0, "fta": 0, "pts": 0})
            for team in (start.home, start.away)
            for p in team.on_floor
        },
        "game": content["game"],
        "teams": {
            side: {"teamId": t.team_id, "tricode": t.tricode, "name": box[f"{side}Team"]["teamName"], "city": box[f"{side}Team"]["teamCity"]}
            for side, t in (("home", start.home), ("away", start.away))
        },
        "lineups": {
            "home": _lineup(content, start, start.home, jerseys, positions_listed),
            "away": _lineup(content, start, start.away, jerseys, positions_listed),
        },
    }


def _lineup(content: dict, state: MomentState, team: TeamState, jerseys: dict[int, str], listed: dict[int, str]) -> list[dict]:
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
        lineup.append({"playerId": player.person_id, "name": player.name, "jersey": jerseys.get(player.person_id, ""),
                       "position": listed.get(player.person_id, ""), "season": content["season"], "x": x, "y": y})
    return lineup


def main(args: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--id", help="export one moment (default: all)")
    args = parser.parse_args(args)

    paths = [CONTENT_DIR / f"{args.id}.json"] if args.id else sorted(CONTENT_DIR.glob("*.json"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for path in paths:
        try:
            moment = export_moment(json.loads(path.read_text()))
        except Exception as exc:  # report every broken moment, not just the first
            failed.append(path.stem)
            print(f"{path.stem}: FAILED {exc}")
            continue
        out = OUTPUT_DIR / f"{moment['id']}.json"
        out.write_text(json.dumps(moment, indent=2) + "\n")
        print(f"{moment['id']}: wrote {out.relative_to(REPO_ROOT)}")
    if failed:
        raise SystemExit(f"{len(failed)} moment(s) failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
