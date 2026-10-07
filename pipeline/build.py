"""Run the whole data pipeline, start to finish.

    uv run python -m build

1. Ingest: season stats for every season, plus the games behind every moment
   in content/moments/. Only requests that aren't cached hit the API, so the
   first run takes ~20 minutes and later runs take seconds.
2. Transform: raw responses -> tables in data/processed/, and a verification
   report for every moment in content/moment-catalog.json.
3. Export: tables + moment content -> JSON in public/data/ for the app.
"""

import json

from export import leagues, moments, players
from ingest import moment_games, season_stats
from ingest.season_stats import FIRST_SEASON, LAST_SEASON, season_label
from transform import moment_finder, playoff_step_up, season_tables


def step(title: str) -> None:
    print(f"\n== {title}")


def main() -> None:
    step("Ingest: season stats")
    for year in range(FIRST_SEASON, LAST_SEASON + 1):
        season_stats.ingest_season(season_label(year), quiet=True)
    print(f"  {season_label(FIRST_SEASON)} through {season_label(LAST_SEASON)} ready")

    step("Ingest: moment games")
    for path in sorted(moments.CONTENT_DIR.glob("*.json")):
        moment_games.ingest_game(json.loads(path.read_text())["gameId"])

    step("Transform")
    season_tables.main()
    playoff_step_up.main()
    moment_finder.main(args=[])

    step("Export")
    players.main()
    leagues.main()
    moments.main(args=[])


if __name__ == "__main__":
    main()
