"""Cached, throttled access to stats.nba.com through nba_api.

Every API request in the pipeline goes through fetch_cached(). Each response is
written once to data/raw/<endpoint>/<params>.json and never requested again.
Delete a file by hand if you really want it refetched.
"""

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from nba_api.stats.library.http import NBAStatsHTTP

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"

MIN_INTERVAL_S = 2.0  # stats.nba.com throttles hard; stay polite
TIMEOUT_S = 60
RETRY_DELAYS_S = (5, 20, 60)

_last_request_at = 0.0


def cache_path(endpoint_name: str, params: dict) -> Path:
    key = "__".join(f"{k}={params[k]}" for k in sorted(params))
    safe_key = re.sub(r"[^A-Za-z0-9=._-]+", "-", key)
    return RAW_DIR / endpoint_name / f"{safe_key}.json"


def fetch_cached(endpoint_cls, **params) -> dict:
    """Return the raw response dict for an nba_api endpoint, from cache if present."""
    path = cache_path(endpoint_cls.__name__.lower(), params)
    if path.exists():
        return json.loads(path.read_text())["response"]

    response = _request_with_retry(endpoint_cls, params)
    record = {
        "endpoint": endpoint_cls.__name__,
        "params": params,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "response": response,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(record))
    tmp.replace(path)  # atomic, so an interrupted run never leaves a half-written cache file
    return response


def is_cached(endpoint_cls, **params) -> bool:
    return cache_path(endpoint_cls.__name__.lower(), params).exists()


def _request_with_retry(endpoint_cls, params: dict) -> dict:
    global _last_request_at
    for attempt, retry_delay in enumerate((*RETRY_DELAYS_S, None)):
        wait = MIN_INTERVAL_S - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()
        try:
            # Build the request with nba_api but skip its response parsing, which crashes on
            # some older games. We only want the raw JSON anyway.
            request = endpoint_cls(**params, get_request=False)
            response = NBAStatsHTTP().send_api_request(
                endpoint=request.endpoint, parameters=request.parameters, timeout=TIMEOUT_S
            )
            return response.get_dict()
        except (requests.RequestException, json.JSONDecodeError) as exc:
            if retry_delay is None:
                raise
            print(f"  ! {endpoint_cls.__name__} failed ({exc.__class__.__name__}), retry {attempt + 1} in {retry_delay}s")
            time.sleep(retry_delay)
