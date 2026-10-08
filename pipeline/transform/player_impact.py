"""Crunch-time usage and offensive lift for every player-season.

player_impact.parquet, one row per player-season:

clutch_usage, clutch_minutes
    His share of team plays in "clutch" time (the NBA's definition: last 5 minutes,
    score within 5), regular season and playoffs combined, weighted by minutes. Stars
    take over late: LeBron 2015-16 went from 31% to 43%; Tristan Thompson fell to 9%.

offensive_lift, lift_source
    How many more points per 100 possessions his team scored with him on the floor than
    off it (on/off splits). The NBA has these from 2007-08 on. On/off is noisy when he
    barely sat (or barely played), so each observed value is blended with a prediction
    from his own stats, trusted by his minutes on the bench side. For seasons before
    2007-08 the prediction is all there is (lift_source "estimated").

The prediction is a minutes-weighted linear fit, on 2007-08+ seasons, of on/off lift
from usage, scoring efficiency relative to the league, and assist rate.

    uv run python -m transform.player_impact
"""

import numpy as np
import pandas as pd
from nba_api.stats.endpoints import LeagueDashPlayerClutch, TeamPlayerOnOffSummary

from ingest.cache import cache_path, read_cached
from ingest.season_stats import FIRST_SEASON, LAST_SEASON, SEASON_TYPES, season_label
from ingest.team_onoff import FIRST_ONOFF_SEASON, onoff_params, team_ids
from transform.season_tables import PROCESSED_DIR, result_frame

ONOFF_TRUST_MINUTES = 400  # minutes on the smaller side (on or off) at which observed on/off is half-trusted
FEATURES = ["usg_pct", "ts_rel", "ast_pct", "usg_x_ts"]


def clutch_table() -> pd.DataFrame:
    frames = []
    for year in range(FIRST_SEASON, LAST_SEASON + 1):
        season = season_label(year)
        for season_type in SEASON_TYPES:
            df = result_frame(read_cached(
                LeagueDashPlayerClutch, season=season, season_type_all_star=season_type,
                measure_type_detailed_defense="Usage", per_mode_detailed="Totals",
                clutch_time="Last 5 Minutes", point_diff=5, ahead_behind="Ahead or Behind",
            ))
            frames.append(pd.DataFrame({"player_id": df.PLAYER_ID, "season": season, "min": df.MIN, "usg": df.USG_PCT}))
    df = pd.concat(frames)
    df = df[df["min"] > 0]
    df["usg_min"] = df.usg * df["min"]
    out = df.groupby(["player_id", "season"]).agg(clutch_minutes=("min", "sum"), usg_min=("usg_min", "sum")).reset_index()
    out["clutch_usage"] = out.usg_min / out.clutch_minutes
    return out.drop(columns="usg_min")


def onoff_table() -> pd.DataFrame:
    rows = []
    for year in range(FIRST_ONOFF_SEASON, LAST_SEASON + 1):
        season = season_label(year)
        for team in team_ids(season):
            if not cache_path("teamplayeronoffsummary", onoff_params(team, season)).exists():
                continue
            sets = read_cached(TeamPlayerOnOffSummary, **onoff_params(team, season))["resultSets"]
            on = {r["VS_PLAYER_ID"]: r for r in (dict(zip(sets[1]["headers"], x)) for x in sets[1]["rowSet"])}
            off = {r["VS_PLAYER_ID"]: r for r in (dict(zip(sets[2]["headers"], x)) for x in sets[2]["rowSet"])}
            for pid, r in on.items():
                if pid in off and r["OFF_RATING"] is not None and off[pid]["OFF_RATING"] is not None:
                    rows.append({"player_id": pid, "season": season, "on_min": r["MIN"] or 0, "off_min": off[pid]["MIN"] or 0,
                                 "lift": r["OFF_RATING"] - off[pid]["OFF_RATING"]})
    df = pd.DataFrame(rows)
    # Traded players: combine teams, weighted by minutes on the floor.
    df["lift_w"] = df.lift * df.on_min
    out = df.groupby(["player_id", "season"]).agg(on_min=("on_min", "sum"), off_min=("off_min", "sum"), lift_w=("lift_w", "sum")).reset_index()
    out["observed_lift"] = out.lift_w / out.on_min.where(out.on_min > 0)
    return out.drop(columns="lift_w")


def features(players: pd.DataFrame, leagues: pd.DataFrame) -> pd.DataFrame:
    rs = players[players.season_type == "Regular Season"].copy()
    league_ts = leagues[leagues.season_type == "Regular Season"].set_index("season")
    league_ts = (league_ts.pts / (2 * (league_ts.fga + 0.44 * league_ts.fta)))
    ts = rs.pts / (2 * (rs.fga + 0.44 * rs.fta)).where(lambda d: d > 0)
    rs["ts_rel"] = (ts - rs.season.map(league_ts)).fillna(0)
    rs["usg_pct"] = rs.usg_pct.fillna(0)
    rs["ast_pct"] = rs.ast_pct.fillna(0)
    rs["usg_x_ts"] = rs.usg_pct * rs.ts_rel
    return rs[["player_id", "season", "min", *FEATURES]]


def fit_prediction(data: pd.DataFrame) -> tuple[np.ndarray, float]:
    """Weighted least squares of observed lift on the features. Returns (coefficients, weighted R²)."""
    fit = data.dropna(subset=["observed_lift"])
    fit = fit[(fit.on_min >= 300) & (fit.off_min >= 300)]
    w = np.minimum(fit.on_min, fit.off_min).to_numpy()
    X = np.column_stack([np.ones(len(fit)), fit[FEATURES].to_numpy()])
    y = fit.observed_lift.to_numpy()
    sw = np.sqrt(w)
    coef, *_ = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)
    pred = X @ coef
    r2 = 1 - np.sum(w * (y - pred) ** 2) / np.sum(w * (y - np.average(y, weights=w)) ** 2)
    return coef, float(r2)


def build() -> tuple[pd.DataFrame, np.ndarray, float]:
    players = pd.read_parquet(PROCESSED_DIR / "player_seasons.parquet")
    leagues = pd.read_parquet(PROCESSED_DIR / "league_seasons.parquet")
    data = features(players, leagues).merge(onoff_table(), on=["player_id", "season"], how="left")
    coef, r2 = fit_prediction(data)

    data["predicted_lift"] = np.column_stack([np.ones(len(data)), data[FEATURES].to_numpy()]) @ coef
    smaller_side = np.minimum(data.on_min.fillna(0), data.off_min.fillna(0))
    trust = (smaller_side / (smaller_side + ONOFF_TRUST_MINUTES)).where(data.observed_lift.notna(), 0)
    data["offensive_lift"] = trust * data.observed_lift.fillna(0) + (1 - trust) * data.predicted_lift
    data["lift_source"] = np.where(data.observed_lift.notna(), "on/off", "estimated")

    impact = data[["player_id", "season", "offensive_lift", "lift_source", "observed_lift", "predicted_lift"]].merge(
        clutch_table(), on=["player_id", "season"], how="outer")
    return impact, coef, r2


def main() -> None:
    impact, coef, r2 = build()
    impact.to_parquet(PROCESSED_DIR / "player_impact.parquet", index=False)
    print(f"player_impact: {len(impact)} player-seasons, {impact.clutch_usage.notna().sum()} with clutch usage, "
          f"{(impact.lift_source == 'on/off').sum()} with on/off, {(impact.lift_source == 'estimated').sum()} estimated")
    print("  lift prediction: " + ", ".join(f"{n} {c:+.1f}" for n, c in zip(["intercept", *FEATURES], coef)) + f"  (weighted R² {r2:.2f})")


if __name__ == "__main__":
    main()
