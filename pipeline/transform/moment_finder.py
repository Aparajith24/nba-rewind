"""Find and verify every moment in content/moment-catalog.json.

For each moment: look up the game, find the famous play in the play-by-play,
walk back to the last dead ball before it (where a moment starts; see
docs/simulation-rules.md), and rebuild the full state there. Takeovers give an explicit
start clock instead of a famous play.

Writes a review report to data/processed/moment_verification.{json,md}. It
lives in data/ (not the repo) because it's full of NBA play-by-play details.

    uv run python -m transform.moment_finder            # all moments
    uv run python -m transform.moment_finder --number 32
"""

import argparse
import json
import re

from export.moments import CONTENT_DIR
from ingest.moment_games import fetch_play_by_play, ingest_game
from ingest.playoff_games import find_game
from transform.moment_state import clock_seconds, normalize_name, state_at
from transform.season_tables import PROCESSED_DIR

CATALOG = CONTENT_DIR.parent / "moment-catalog.json"
FREE_THROW_PATTERN = re.compile(r"(\d) of (\d)")
NOT_A_PLAY = {"Substitution", "Timeout", "period", "Instant Replay"}
KEY_CLOCK_TOLERANCE = 5.0  # seconds between the catalog's guess and the play found, before we flag it


def is_dead_ball(action: dict, period_actions: list[dict]) -> bool:
    """True if play stops after this action: the ball has to be inbounded or free throws shot."""
    kind = action["actionType"]
    if kind == "period":
        # Only the start of a period. Some games list "End of period" before the buzzer-beater itself.
        return action["subType"] == "start"
    if kind in {"Timeout", "Substitution", "Violation", "Instant Replay", "Ejection", "Made Shot", "Foul"}:
        return True
    if kind == "Free Throw":
        n = FREE_THROW_PATTERN.search(action["description"])
        last_of_trip = n is None or n.group(1) == n.group(2)
        missed = action["description"].startswith("MISS")
        return not (last_of_trip and missed)  # a missed last free throw is a live rebound
    if kind == "Turnover":
        # A steal keeps the ball live; other turnovers (out of bounds, violations) stop play.
        same_clock = [a for a in period_actions if a["clock"] == action["clock"]]
        return not any("STEAL" in a["description"] for a in same_clock)
    return False


def find_key_play(period_actions: list[dict], player: str, clock: float) -> int:
    """Index of the play by `player` closest to `clock`. `player` is a last name ("Allen") or,
    when both teams have one, initial + last name ("A. Johnson"). Accents and suffixes are ignored."""
    wanted = normalize_name(player, drop_suffix=True)

    def is_player(a: dict) -> bool:
        names = (a["playerName"] or "", a["playerNameI"] or "")
        return any(normalize_name(n, drop_suffix=True) == wanted for n in names)

    candidates = [i for i, a in enumerate(period_actions) if a["actionType"] not in NOT_A_PLAY and is_player(a)]
    if not candidates:
        raise ValueError(f"no plays by {player!r} in this period")
    # Ties at the same clock go to the first play: an and-one's shot, not its free throw.
    return min(candidates, key=lambda i: (abs(clock_seconds(period_actions[i]["clock"]) - clock), i))


def find_start(game_id: str, period: int, player: str, clock: float) -> tuple[float, int, dict]:
    """(start clock, actionNumber the moment starts after, the key play)."""
    period_actions = [a for a in fetch_play_by_play(game_id) if a["period"] == period]
    key_index = find_key_play(period_actions, player, clock)
    for i in range(key_index - 1, -1, -1):
        if is_dead_ball(period_actions[i], period_actions):
            # Include every dead-ball action at that instant (free throws, subs, timeout)
            # that comes before the key play.
            start = period_actions[i]
            while (i + 1 < key_index and period_actions[i + 1]["clock"] == start["clock"]
                   and is_dead_ball(period_actions[i + 1], period_actions)):
                i += 1
            return clock_seconds(start["clock"]), period_actions[i]["actionNumber"], period_actions[key_index]
    raise ValueError("no dead ball before the key play in this period")


def verify(entry: dict) -> dict:
    result = {k: entry[k] for k in ("number", "season", "teams", "game", "period")}
    warnings = []
    try:
        game_id = find_game(entry["season"], tuple(entry["teams"]), entry["game"])
        ingest_game(game_id)
        result["gameId"] = game_id

        through_action = None
        if "startClock" in entry:
            start_clock = float(entry["startClock"])
        else:
            key = entry["key"]
            start_clock, through_action, play = find_start(game_id, entry["period"], key["player"], key["clock"])
            play_clock = clock_seconds(play["clock"])
            result["keyPlay"] = {"clock": play_clock, "description": play["description"],
                                 "playerId": play["personId"], "playerName": play["playerNameI"]}
            if abs(play_clock - key["clock"]) > KEY_CLOCK_TOLERANCE:
                warnings.append(f"key play found at {play_clock}s, catalog said ~{key['clock']}s")

        start = state_at(game_id, entry["period"], start_clock, through_action)
        end = state_at(game_id, entry["period"], 0)
        result.update({
            "startClock": start_clock,
            "throughAction": through_action,
            "home": start.home.tricode,
            "away": start.away.tricode,
            "score": {"home": start.home.score, "away": start.away.score},
            "possession": start.possession_tricode,
            "nextPlay": start.next_action,
            "lineups": {
                start.home.tricode: [p.name for p in start.home.on_floor],
                start.away.tricode: [p.name for p in start.away.on_floor],
            },
            "periodEnd": {"home": end.home.score, "away": end.away.score},
        })
        if start.possession_tricode is None:
            warnings.append("couldn't infer possession")
        warnings += [f"check: {n}" for n in start.notes]
    except Exception as exc:  # report every failure, keep going
        warnings.append(f"FAILED: {exc}")
    result["warnings"] = warnings
    return result


def report_markdown(results: list[dict]) -> str:
    lines = ["# Moment verification", "", "| # | Game | Start | Score (home first) | Ball | Key play | Warnings |", "|---|---|---|---|---|---|---|"]
    for r in results:
        game = f"{r['season']} {'-'.join(r['teams'])} G{r['game']}"
        if "score" not in r:
            lines.append(f"| {r['number']} | {game} | | | | | {'; '.join(r['warnings'])} |")
            continue
        start = f"P{r['period']} {r['startClock']}s"
        score = f"{r['home']} {r['score']['home']} - {r['away']} {r['score']['away']}"
        key = f"{r['keyPlay']['clock']}s {r['keyPlay']['description']}" if "keyPlay" in r else "(takeover)"
        lines.append(f"| {r['number']} | {game} | {start} | {score} | {r['possession']} | {key} | {'; '.join(r['warnings'])} |")
    return "\n".join(lines) + "\n"


def main(args: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--number", type=int, help="verify one moment (default: all)")
    args = parser.parse_args(args)

    catalog = json.loads(CATALOG.read_text())["moments"]
    entries = [m for m in catalog if args.number in (None, m["number"])]
    results = []
    for entry in entries:
        r = verify(entry)
        results.append(r)
        status = "; ".join(r["warnings"]) or "ok"
        where = f"P{r['period']} {r.get('startClock', '?')}s" if "startClock" in r else ""
        print(f"#{r['number']:>2} {r['season']} {'-'.join(r['teams'])} G{r['game']} {where}: {status}", flush=True)

    if args.number is None:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        (PROCESSED_DIR / "moment_verification.json").write_text(json.dumps(results, indent=2) + "\n")
        (PROCESSED_DIR / "moment_verification.md").write_text(report_markdown(results))
        ok = sum(not r["warnings"] for r in results)
        print(f"\n{ok} of {len(results)} moments verified cleanly; report in data/processed/moment_verification.md")


if __name__ == "__main__":
    main()
