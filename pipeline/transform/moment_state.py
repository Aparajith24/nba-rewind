"""Rebuild the game state at any instant: score, possession, and the ten players on the floor.

"State at clock T" means everything that happened at game clock T or earlier
has already happened (all free throws, subs, and timeouts at T included).

Play-by-play records substitutions but never the lineup itself, and subs
between periods aren't logged. So each period's starting five is inferred:
a player started the period if he shows up in it (shot, rebound, foul,
assist, checking out...) before he ever checks in. A starter who never
touches the play-by-play is carried over from the end of the previous
period; if that's still ambiguous we raise rather than guess.

    uv run python -m transform.moment_state --game 0041200406 --period 4 --clock 19.4
"""

import argparse
import re
import unicodedata
from dataclasses import dataclass

from ingest.moment_games import fetch_game_box, fetch_play_by_play

LINEUP_SIZE = 5
CLOCK_PATTERN = re.compile(r"PT(\d+)M([\d.]+)S")
SUB_PATTERN = re.compile(r"SUB: (.+) FOR (.+)")
ASSIST_PATTERN = re.compile(r"\(([^()]+?) \d+ AST\)")
POSSESSION_ACTIONS = {"Made Shot", "Missed Shot", "Turnover", "Free Throw"}


@dataclass(frozen=True)
class Player:
    person_id: int
    name: str


@dataclass
class TeamState:
    team_id: int
    tricode: str
    score: int
    on_floor: list[Player]


@dataclass
class MomentState:
    game_id: str
    period: int
    clock_seconds: float
    home: TeamState
    away: TeamState
    possession_tricode: str | None  # inferred from the next action; moment files can override
    next_action: str | None
    notes: list[str]  # guesses made while rebuilding the state, for a human to check


class Roster:
    """One team's players, findable by the names play-by-play descriptions use.

    Descriptions like "SUB: Allen FOR Miller" name players by last name only, and
    the spelling can differ from the box score (accents, "Jr.", "Ty. Thomas" vs
    "Ti. Thomas", old names). So each player is indexed under several aliases. An
    exact alias match wins; dropping suffixes ("Williams III" -> "Williams") is a
    fallback, so "Williams" means Grant Williams, not Robert Williams III.
    """

    def __init__(self, team: dict, actions: list[dict]):
        self.team_id = team["teamId"]
        self.tricode = team["teamTricode"]
        self.players = {p["personId"]: Player(p["personId"], p["nameI"]) for p in team["players"]}
        self.minutes = {p["personId"]: _minutes(p.get("statistics", {}).get("minutes")) for p in team["players"]}
        self._exact: dict[str, set[int]] = {}
        self._loose: dict[str, set[int]] = {}
        for p in team["players"]:
            first, family = p["firstName"], p["familyName"]
            # nameI ("A. Davis") and longer initials ("Ty. Thomas", "Jal. Williams") are how
            # play-by-play tells apart teammates who share a last name.
            aliases = [family, f"{first} {family}", p["nameI"]] + [f"{first[:k]}. {family}" for k in range(2, 5)]
            aliases += FORMER_NAMES.get(family, [])
            for alias in aliases:
                self._add_alias(alias, p["personId"])
        for a in actions:
            if a["teamId"] == self.team_id and a["personId"] in self.players and a["playerName"]:
                self._add_alias(a["playerName"], a["personId"])

    def _add_alias(self, name: str, person_id: int) -> None:
        self._exact.setdefault(normalize_name(name), set()).add(person_id)
        self._loose.setdefault(normalize_name(name, drop_suffix=True), set()).add(person_id)

    def candidates(self, name: str) -> list[Player]:
        ids = self._exact.get(normalize_name(name)) or self._loose.get(normalize_name(name, drop_suffix=True), set())
        return [self.players[i] for i in sorted(ids)]

    def resolve(self, name: str, context: str, exclude: set[int] = frozenset()) -> Player:
        """The one player matching `name`, skipping anyone in `exclude` (e.g. already on the floor)."""
        matches = [p for p in self.candidates(name) if p.person_id not in exclude]
        if len(matches) != 1:
            found = [p.name for p in matches] or "nobody"
            raise ValueError(f"{self.tricode}: can't resolve player {name!r} (matched {found}) in: {context}")
        return matches[0]


# Players who changed names. Play-by-play uses the current name for a player's own actions,
# but substitution text keeps the name he had at the time. Keyed by current family name.
FORMER_NAMES = {
    "World Peace": ["Artest"],
    "Sandiford-Artest": ["Artest", "World Peace"],
    "Freedom": ["Kanter"],
}


NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def _minutes(value) -> float:
    """Box-score minutes as a number: "41:29" or "PT41M29.00S" -> 41.48."""
    if not value:
        return 0.0
    if value.startswith("PT"):
        m, sec = CLOCK_PATTERN.fullmatch(value).groups()
        return int(m) + float(sec) / 60
    m, _, sec = value.partition(":")
    return int(m) + (float(sec) / 60 if sec else 0)


def normalize_name(name: str, drop_suffix: bool = False) -> str:
    """'Nenê' -> 'nene', "O'Neal" -> 'oneal', 'Hardaway Jr.' -> 'hardaway jr' (or 'hardaway')."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z0-9 ]", "", ascii_name.lower().replace("-", " ")).split()
    if drop_suffix and len(words) > 1 and words[-1] in NAME_SUFFIXES:
        words = words[:-1]
    return " ".join(words)


def clock_seconds(clock: str) -> float:
    minutes, seconds = CLOCK_PATTERN.fullmatch(clock).groups()
    return int(minutes) * 60 + float(seconds)


def state_at(game_id: str, period: int, clock: float, through_action: int | None = None) -> MomentState:
    """through_action: if set, only actions up to and including this actionNumber count as
    "happened" at the given clock. Needed when the moment starts mid-way through events that
    share a clock (e.g. after a foul but before the free throws it led to)."""
    actions = fetch_play_by_play(game_id)
    box = fetch_game_box(game_id)
    rosters = {r.team_id: r for r in (Roster(box["homeTeam"], actions), Roster(box["awayTeam"], actions))}
    happened = happened_by(actions, period, clock, through_action)
    past = [a for a in actions if happened(a)]
    future = [a for a in actions if not happened(a)]

    on_floor: dict[int, list[Player]] = {}
    notes: list[str] = []
    for p in range(1, period + 1):
        period_actions = [a for a in actions if a["period"] == p]
        for team_id, roster in rosters.items():
            carried_over = on_floor.get(team_id, [])
            on_floor[team_id] = _infer_starters(period_actions, roster, carried_over, p, notes)
        for a in period_actions:
            if happened(a) and a["actionType"] == "Substitution":
                _apply_substitution(on_floor[a["teamId"]], rosters[a["teamId"]], a)

    home_score, away_score = _score(past)
    home, away = rosters[box["homeTeam"]["teamId"]], rosters[box["awayTeam"]["teamId"]]
    possession, next_action = _infer_possession(future, rosters)
    return MomentState(
        game_id=game_id,
        period=period,
        clock_seconds=clock,
        home=TeamState(home.team_id, home.tricode, home_score, on_floor[home.team_id]),
        away=TeamState(away.team_id, away.tricode, away_score, on_floor[away.team_id]),
        possession_tricode=possession,
        next_action=next_action,
        notes=notes,
    )


def happened_by(actions: list[dict], period: int, clock: float, through_action: int | None = None):
    """A predicate: has this action happened by (period, clock[, through_action])?"""
    cutoff = None
    if through_action is not None:
        cutoff = next(i for i, a in enumerate(actions) if a["actionNumber"] == through_action)
    order = {id(a): i for i, a in enumerate(actions)}

    def happened(a: dict) -> bool:
        if a["period"] != period:
            return a["period"] < period
        t = clock_seconds(a["clock"])
        if t != clock or cutoff is None:
            return t >= clock
        return order[id(a)] <= cutoff

    return happened


def _infer_starters(period_actions: list[dict], roster: Roster, carried_over: list[Player], period: int,
                    notes: list[str] | None = None) -> list[Player]:
    first_seen: dict[int, str] = {}  # person_id -> "started" or "checked_in"
    for a in period_actions:
        if a["teamId"] != roster.team_id or _is_off_court_action(a):
            continue
        if a["actionType"] == "Substitution":
            first_seen.setdefault(a["personId"], "started")
            # If two players share the name we can't tell yet who checked in; the
            # substitution pass below settles it using who's already on the floor.
            incoming = roster.candidates(_incoming_name(a))
            if len(incoming) == 1:
                first_seen.setdefault(incoming[0].person_id, "checked_in")
            elif not incoming:
                roster.resolve(_incoming_name(a), a["description"])  # raises with a clear message
            continue
        if a["personId"] in roster.players:
            first_seen.setdefault(a["personId"], "started")
        # Assists are extra evidence only, so an ambiguous assister is skipped rather than fatal.
        for assister in ASSIST_PATTERN.findall(a["description"]):
            matches = roster.candidates(assister)
            if len(matches) == 1:
                first_seen.setdefault(matches[0].person_id, "started")

    starters = [roster.players[pid] for pid, how in first_seen.items() if how == "started"]
    if len(starters) < LINEUP_SIZE:
        # Players who never appear in the period's play-by-play: assume they stayed on from last period.
        silent = [p for p in carried_over if p.person_id not in first_seen]
        missing = LINEUP_SIZE - len(starters)
        if len(silent) == missing:
            starters += silent
        elif len(silent) > missing:
            # More silent candidates than open spots: the ones who played more of the game are
            # likelier to have played the whole period without touching the ball. Flag it.
            picked = sorted(silent, key=lambda p: -roster.minutes.get(p.person_id, 0))[:missing]
            starters += picked
            if notes is not None:
                notes.append(f"{roster.tricode} period {period}: guessed {[p.name for p in picked]} "
                             f"from {[p.name for p in silent]} by game minutes")
    if len(starters) != LINEUP_SIZE:
        raise ValueError(f"{roster.tricode} period {period}: inferred {len(starters)} starters: {[p.name for p in starters]}")
    return starters


def _is_off_court_action(a: dict) -> bool:
    # Technicals and ejections can hit players on the bench, so they say nothing about who's on the floor.
    return a["actionType"] == "Ejection" or "Technical" in a["subType"] or "T.FOUL" in a["description"]


def _incoming_name(action: dict) -> str:
    # "SUB: X FOR Y": the action's player is Y (leaving); X (entering) appears only by name.
    incoming_name, _ = SUB_PATTERN.fullmatch(action["description"]).groups()
    return incoming_name


def _apply_substitution(lineup: list[Player], roster: Roster, action: dict) -> None:
    outgoing = next((i for i, p in enumerate(lineup) if p.person_id == action["personId"]), None)
    if outgoing is None:
        raise ValueError(f"{action['playerNameI']} subbed out but wasn't on the floor: {action['description']}")
    # Whoever checks in can't already be on the floor, which settles players who share a name.
    on_floor = {p.person_id for p in lineup}
    lineup[outgoing] = roster.resolve(_incoming_name(action), action["description"], exclude=on_floor)


def _score(past: list[dict]) -> tuple[int, int]:
    # Non-scoring actions carry "0"/"0" (older games) or ""/"" (newer), so take the last real score.
    for a in reversed(past):
        if a["scoreHome"] and a["scoreAway"] and (a["scoreHome"], a["scoreAway"]) != ("0", "0"):
            return int(a["scoreHome"]), int(a["scoreAway"])
    return 0, 0


def _infer_possession(future: list[dict], rosters: dict[int, Roster]) -> tuple[str | None, str | None]:
    for a in future:
        if a["teamId"] not in rosters:
            continue
        if a["actionType"] in POSSESSION_ACTIONS:
            return rosters[a["teamId"]].tricode, f"{a['clock']} {a['description']}"
        if a["actionType"] == "Foul":
            other = next(t for t in rosters if t != a["teamId"])
            return rosters[other].tricode, f"{a['clock']} {a['description']}"
    return None, None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game", required=True)
    parser.add_argument("--period", required=True, type=int)
    parser.add_argument("--clock", required=True, type=float, help="seconds left in the period")
    args = parser.parse_args()

    s = state_at(args.game, args.period, args.clock)
    print(f"Game {s.game_id}, period {s.period}, {s.clock_seconds}s left")
    print(f"Score: {s.home.tricode} {s.home.score} - {s.away.tricode} {s.away.score} (home first)")
    print(f"Possession: {s.possession_tricode} (next: {s.next_action})")
    for team in (s.home, s.away):
        print(f"{team.tricode} on floor: {', '.join(p.name for p in team.on_floor)}")


if __name__ == "__main__":
    main()
