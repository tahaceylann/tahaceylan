"""Persist bot state (open position, risk counters) to a JSON file so a
restart doesn't lose track of an open position."""
from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any

logger = logging.getLogger(__name__)


def load_state(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"position": None, "risk": {}, "trade_log": []}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("State file %s okunamadi (%s); sifirdan basliyor.", path, exc)
        return {"position": None, "risk": {}, "trade_log": []}


def save_state(path: str, state: dict[str, Any]) -> None:
    """Write atomically so a crash mid-write can't corrupt the state file."""
    directory = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".state_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh, indent=2, default=str)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
