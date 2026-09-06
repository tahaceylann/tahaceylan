"""Trading signal generation.

Strategy: EMA crossover (fast/slow) confirmed by RSI filter.
  - BUY  when fast EMA crosses above slow EMA AND RSI is not overbought.
  - SELL when fast EMA crosses below slow EMA OR RSI is overbought.

This is intentionally simple and easy to reason about/backtest; swap
`generate_signal` out for a more advanced model without touching the
rest of the bot.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import pandas as pd

from .indicators import ema, rsi


class Signal(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class StrategyParams:
    fast_ma: int = 9
    slow_ma: int = 21
    rsi_period: int = 14
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0


def compute_indicators(df: pd.DataFrame, params: StrategyParams) -> pd.DataFrame:
    df = df.copy()
    df["ema_fast"] = ema(df["close"], params.fast_ma)
    df["ema_slow"] = ema(df["close"], params.slow_ma)
    df["rsi"] = rsi(df["close"], params.rsi_period)
    return df


def generate_signal(df: pd.DataFrame, params: StrategyParams, in_position: bool) -> Signal:
    """Return a trading signal from the most recent two candles.

    `df` must already contain ema_fast/ema_slow/rsi columns (see
    `compute_indicators`), have at least `slow_ma + 2` rows, and be sorted
    oldest -> newest.
    """
    required = max(params.slow_ma, params.rsi_period) + 2
    if len(df) < required:
        return Signal.HOLD

    prev, last = df.iloc[-2], df.iloc[-1]

    crossed_up = prev["ema_fast"] <= prev["ema_slow"] and last["ema_fast"] > last["ema_slow"]
    crossed_down = prev["ema_fast"] >= prev["ema_slow"] and last["ema_fast"] < last["ema_slow"]

    if not in_position and crossed_up and last["rsi"] < params.rsi_overbought:
        return Signal.BUY

    if in_position and (crossed_down or last["rsi"] >= params.rsi_overbought):
        return Signal.SELL

    return Signal.HOLD
