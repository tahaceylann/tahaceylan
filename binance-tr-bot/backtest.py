#!/usr/bin/env python3
"""Simple historical backtest for the EMA-crossover + RSI strategy.

Fetches historical klines from the exchange's public endpoint (no API
key required) and simulates the strategy + risk management rules
bar-by-bar, printing a summary of trades and overall return.

Usage:
    python backtest.py --symbol BTC_TRY --interval 15m --limit 1000
"""
from __future__ import annotations

import argparse
import logging

from bot.config import Config
from bot.exchange import BinanceClient
from bot.indicators import klines_to_dataframe
from bot.risk import Position, RiskManager
from bot.strategy import Signal, StrategyParams, compute_indicators, generate_signal

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("backtest")


def run_backtest(symbol: str, interval: str, limit: int, config: Config) -> None:
    client = BinanceClient("", "", config.trade_base_url, config.market_base_url)
    klines = client.get_klines(symbol, interval, limit=limit)
    df = klines_to_dataframe(klines)

    params = StrategyParams(
        fast_ma=config.fast_ma,
        slow_ma=config.slow_ma,
        rsi_period=config.rsi_period,
        rsi_overbought=config.rsi_overbought,
        rsi_oversold=config.rsi_oversold,
    )
    df = compute_indicators(df, params)

    risk = RiskManager(
        stop_loss_pct=config.stop_loss_pct,
        take_profit_pct=config.take_profit_pct,
        trailing_stop_pct=config.trailing_stop_pct,
        max_daily_loss_pct=1.0,  # ignore the daily kill-switch in backtests
    )

    position: Position | None = None
    balance = 1.0  # start with 1 unit of quote currency, track multiplier
    trades = []
    min_bars = max(params.slow_ma, params.rsi_period) + 2

    for i in range(min_bars, len(df)):
        window = df.iloc[: i + 1]
        price = float(window.iloc[-1]["close"])

        if position:
            exit_flag, reason = risk.should_exit(position, price)
            if not exit_flag:
                signal = generate_signal(window, params, in_position=True)
                exit_flag, reason = (signal == Signal.SELL), "signal"
            if exit_flag:
                pnl_pct = (price - position.entry_price) / position.entry_price
                balance *= 1 + pnl_pct
                trades.append({"exit_price": price, "pnl_pct": pnl_pct, "reason": reason})
                position = None
            continue

        signal = generate_signal(window, params, in_position=False)
        if signal == Signal.BUY:
            position = Position(symbol=symbol, entry_price=price, quantity=1.0)

    wins = [t for t in trades if t["pnl_pct"] > 0]
    losses = [t for t in trades if t["pnl_pct"] <= 0]

    logger.info("Sembol: %s | Interval: %s | Mum sayisi: %d", symbol, interval, len(df))
    logger.info("Toplam islem: %d | Kazanan: %d | Kaybeden: %d", len(trades), len(wins), len(losses))
    if trades:
        win_rate = len(wins) / len(trades) * 100
        logger.info("Kazanma orani: %.1f%%", win_rate)
    logger.info("Bitis bakiye carpani: %.4fx (%.2f%% getiri)", balance, (balance - 1) * 100)


def main() -> None:
    parser = argparse.ArgumentParser(description="Strateji backtest araci")
    parser.add_argument("--symbol", default=None)
    parser.add_argument("--interval", default=None)
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args()

    config = Config()
    symbol = args.symbol or config.symbol
    interval = args.interval or config.interval
    run_backtest(symbol, interval, args.limit, config)


if __name__ == "__main__":
    main()
