"""Build the homepage's preview card data for all moments, built or not.

public/data/moment-previews.json
    For every moment in content/moment-catalog.json: the teams, the real score and
    clock where the moment starts, and the key player's id (for his headshot).
    Comes from the verification report (transform.moment_finder), so the homepage can
    show a real "CHI 87 - LAL 86 · 0.6s left" even for moments that aren't playable yet.

    uv run python -m export.moment_previews
"""

import json

from export.players import OUTPUT_DIR
from ingest.cache import REPO_ROOT
from transform.season_tables import PROCESSED_DIR


def build_previews(results: list[dict]) -> dict[str, dict]:
    previews = {}
    for r in results:
        if "score" not in r:
            continue  # the finder couldn't resolve this moment
        key = r.get("keyPlay") or {}
        previews[str(r["number"])] = {
            "gameId": r["gameId"],
            "home": r["home"],
            "away": r["away"],
            "score": r["score"],
            "period": r["period"],
            "startClock": r["startClock"],
            "keyPlayerId": key.get("playerId") or None,
            "keyPlayerName": key.get("playerName") or None,
        }
    return previews


def main() -> None:
    report = PROCESSED_DIR / "moment_verification.json"
    if not report.exists():
        raise SystemExit("Run transform.moment_finder first (it writes data/processed/moment_verification.json)")
    previews = build_previews(json.loads(report.read_text()))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / "moment-previews.json"
    out.write_text(json.dumps(previews, separators=(",", ":")) + "\n")
    print(f"{out.relative_to(REPO_ROOT)}: {len(previews)} moments")


if __name__ == "__main__":
    main()
