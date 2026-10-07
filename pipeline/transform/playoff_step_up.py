"""Measure how players and the league change from regular season to playoffs.

league_playoff_adjustment.parquet
    One row per season: how the *same playoff teams* changed from their own
    regular season to the playoffs (pace, shooting, turnovers, rebounding,
    defense). Comparing the whole league instead would hide the defensive
    effect, since only good offenses make the playoffs. Ratios: 1.0 = no change.

player_step_up.parquet
    One row per player-season that has both profiles: his playoff/regular-season
    ratio for each stat, divided by the league's ratio that season. So 1.0 means
    he changed exactly as much as the league did; 1.1 means he stepped up 10%
    beyond it on that stat. Plus his playoff minutes, so the engine can decide
    how much to trust each sample. Combining seasons, weighting by sample size,
    and adding randomness are model decisions and live in the engine.

    uv run python -m transform.playoff_step_up
"""

import pandas as pd
from nba_api.stats.endpoints import LeagueDashTeamStats

from ingest.cache import read_cached
from ingest.season_stats import FIRST_SEASON, LAST_SEASON, season_label
from transform.season_tables import PROCESSED_DIR, result_frame

PLAYOFFS, REGULAR = "Playoffs", "Regular Season"

# Player stat -> the league stat its change is measured against.
# Usage is a share of the team's plays, so the league's total never changes (ratio 1).
STEP_UP_STATS = {
    "usage": "usage",
    "true_shooting": "true_shooting",
    "three_rate": "three_rate",
    "free_throw_rate": "free_throw_rate",
    "turnover_rate": "turnover_rate",
    "assist_rate": "assist_rate",
    "offensive_rebound_rate": "offensive_rebound_rate",
    "defensive_rebound_rate": "defensive_rebound_rate",
    "steal_rate": "steal_rate",
    "block_rate": "block_rate",
    "defensive_rating": "points_allowed_per_100",
}


def true_shooting(pts, fga, fta):
    return pts / (2 * (fga + 0.44 * fta))


def team_rates(base: pd.DataFrame, advanced: pd.DataFrame) -> dict:
    """League-level rates for a set of teams, from summed totals."""
    pts, fga, fta, poss = base.PTS.sum(), base.FGA.sum(), base.FTA.sum(), advanced.POSS.sum()
    points_allowed = pts - base.PLUS_MINUS.sum()
    return {
        "pace": advanced.PACE.mean(),
        "points_per_100": 100 * pts / poss,
        # Defense is measured on points allowed: in the regular season playoff teams also face
        # bad offenses, so comparing against points scored would make everyone look worse.
        "points_allowed_per_100": 100 * points_allowed / poss,
        "usage": 1.0,
        "true_shooting": true_shooting(pts, fga, fta),
        "three_rate": base.FG3A.sum() / fga,
        "free_throw_rate": fta / fga,
        "turnover_rate": base.TOV.sum() / poss,
        "assist_rate": base.AST.sum() / base.FGM.sum(),
        "offensive_rebound_rate": base.OREB.sum() / (base.OREB.sum() + base.DREB.sum()),
        "defensive_rebound_rate": base.DREB.sum() / (base.OREB.sum() + base.DREB.sum()),
        "steal_rate": base.STL.sum() / poss,
        "block_rate": base.BLK.sum() / poss,
    }


def league_adjustment(season: str) -> dict:
    def teams(season_type: str, measure: str) -> pd.DataFrame:
        return result_frame(read_cached(
            LeagueDashTeamStats, season=season, season_type_all_star=season_type,
            measure_type_detailed_defense=measure, per_mode_detailed="Totals",
        )).set_index("TEAM_ID")

    playoff_base, playoff_adv = teams(PLAYOFFS, "Base"), teams(PLAYOFFS, "Advanced")
    playoff_teams = playoff_base.index
    regular_base = teams(REGULAR, "Base").loc[playoff_teams]
    regular_adv = teams(REGULAR, "Advanced").loc[playoff_teams]

    playoff, regular = team_rates(playoff_base, playoff_adv), team_rates(regular_base, regular_adv)
    row = {"season": season}
    row.update({stat: playoff[stat] / regular[stat] for stat in playoff})
    row["points_per_game"] = (playoff_base.PTS.sum() / playoff_base.GP.sum()) / (regular_base.PTS.sum() / regular_base.GP.sum())
    return row


def player_rates(p: pd.DataFrame, suffix: str) -> pd.DataFrame:
    """Per-player rates for one profile (columns end in _po or _rs). Undefined rates are NaN."""
    def col(name):
        return p[f"{name}{suffix}"]

    def safe(numerator, denominator):
        return numerator / denominator.where(denominator > 0)

    return pd.DataFrame({
        "usage": col("usg_pct"),
        "true_shooting": safe(col("pts"), 2 * (col("fga") + 0.44 * col("fta"))),
        "three_rate": safe(col("fg3a"), col("fga")),
        "free_throw_rate": safe(col("fta"), col("fga")),
        "turnover_rate": safe(col("tov"), col("poss")),
        "assist_rate": col("ast_pct"),
        "offensive_rebound_rate": col("oreb_pct"),
        "defensive_rebound_rate": col("dreb_pct"),
        "steal_rate": safe(col("stl"), col("poss")),
        "block_rate": safe(col("blk"), col("poss")),
        "defensive_rating": col("def_rating"),
    })


def player_step_up(players: pd.DataFrame, league: pd.DataFrame) -> pd.DataFrame:
    key = ["player_id", "season"]
    playoff = players[players.season_type == PLAYOFFS].set_index(key)
    regular = players[players.season_type == REGULAR].set_index(key)
    both = playoff.join(regular, lsuffix="_po", rsuffix="_rs", how="inner")

    po, rs = player_rates(both, "_po"), player_rates(both, "_rs")
    league_ratio = league.set_index("season").loc[both.index.get_level_values("season")]
    out = pd.DataFrame(index=both.index)
    out["playoff_minutes"] = both["min_po"]
    for stat, league_stat in STEP_UP_STATS.items():
        personal = po[stat] / rs[stat].where(rs[stat] > 0)
        out[stat] = personal.to_numpy() / league_ratio[league_stat].to_numpy()
    return out.reset_index()


def main() -> None:
    league = pd.DataFrame([league_adjustment(season_label(y)) for y in range(FIRST_SEASON, LAST_SEASON + 1)])
    players = pd.read_parquet(PROCESSED_DIR / "player_seasons.parquet")
    step_up = player_step_up(players, league)

    league.to_parquet(PROCESSED_DIR / "league_playoff_adjustment.parquet", index=False)
    step_up.to_parquet(PROCESSED_DIR / "player_step_up.parquet", index=False)

    print(f"league_playoff_adjustment: {len(league)} seasons")
    print(f"  same playoff teams, avg over all seasons: points/game {league.points_per_game.mean() - 1:+.1%}, "
          f"pace {league.pace.mean() - 1:+.1%}, points/100 {league.points_per_100.mean() - 1:+.1%}")
    print(f"player_step_up: {len(step_up)} player-seasons with both profiles")


if __name__ == "__main__":
    main()
