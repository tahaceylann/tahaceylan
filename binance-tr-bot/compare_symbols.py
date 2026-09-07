#!/usr/bin/env python3
"""Botun stratejisini (EMA crossover + RSI) borsadaki TRY paritelerinin
hepsinde (veya --symbols ile verilen listede) gecmis veri uzerinde
backtest edip sonuclari getiriye gore siralar.

ONEMLI: Gecmiste iyi calismis olmak gelecekte de iyi calisacagi
anlamina gelmez. Bu bir yatirim tavsiyesi degildir, sadece stratejinin
farkli coinlerdeki gecmis davranisini karsilastirmali gostermek icindir.

Kullanim:
    python compare_symbols.py --quote TRY --interval 15m --limit 1000
    python compare_symbols.py --symbols BTC_TRY,ETH_TRY,SOL_TRY
"""
from __future__ import annotations

import argparse
import logging
import time

from bot.config import Config
from bot.exchange import BinanceClient, ExchangeError
from bot.indicators import klines_to_dataframe
from bot.risk import Position, RiskManager
from bot.strategy import Signal, StrategyParams, compute_indicators, generate_signal

logging.basicConfig(level=logging.WARNING, format="%(message)s")
logger = logging.getLogger("compare")


def backtest_one(client: BinanceClient, symbol: str, interval: str, limit: int, config: Config) -> dict:
    klines = client.get_klines(symbol, interval, limit=limit)
    if not klines:
        raise ExchangeError("bos veri")
    df = klines_to_dataframe(klines)

    params = StrategyParams(
        fast_ma=config.fast_ma, slow_ma=config.slow_ma, rsi_period=config.rsi_period,
        rsi_overbought=config.rsi_overbought, rsi_oversold=config.rsi_oversold,
    )
    df = compute_indicators(df, params)

    risk = RiskManager(
        stop_loss_pct=config.stop_loss_pct, take_profit_pct=config.take_profit_pct,
        trailing_stop_pct=config.trailing_stop_pct, max_daily_loss_pct=1.0,
    )

    position: Position | None = None
    balance = 1.0
    trades = 0
    wins = 0
    min_bars = max(params.slow_ma, params.rsi_period) + 2

    if len(df) <= min_bars:
        raise ExchangeError("yetersiz mum sayisi")

    for i in range(min_bars, len(df)):
        window = df.iloc[: i + 1]
        price = float(window.iloc[-1]["close"])

        if position:
            exit_flag, reason = risk.should_exit(position, price)
            if not exit_flag:
                signal = generate_signal(window, params, in_position=True)
                exit_flag = signal == Signal.SELL
            if exit_flag:
                pnl_pct = (price - position.entry_price) / position.entry_price
                balance *= 1 + pnl_pct
                trades += 1
                if pnl_pct > 0:
                    wins += 1
                position = None
            continue

        signal = generate_signal(window, params, in_position=False)
        if signal == Signal.BUY:
            position = Position(symbol=symbol, entry_price=price, quantity=1.0)

    return {
        "symbol": symbol,
        "return_pct": (balance - 1) * 100,
        "trades": trades,
        "win_rate": (wins / trades * 100) if trades else 0.0,
        "bars": len(df),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", default=None, help="virgulle ayrilmis liste, orn. BTC_TRY,ETH_TRY")
    parser.add_argument("--quote", default="TRY", help="taranacak kotasyon para birimi, orn. TRY")
    parser.add_argument("--interval", default=None)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--max-symbols", type=int, default=25, help="taranacak maksimum sembol sayisi")
    args = parser.parse_args()

    config = Config()
    interval = args.interval or config.interval
    client = BinanceClient("", "", config.trade_base_url, config.market_base_url)

    if args.symbols:
        symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    else:
        print(f"Borsadan {args.quote} paritesi olan semboller cekiliyor...")
        all_symbols = client.get_exchange_symbols()
        symbols = [
            s["symbol"] for s in all_symbols
            if s.get("quoteAsset") == args.quote and s.get("spotTradingEnable")
        ][: args.max_symbols]
        print(f"{len(symbols)} sembol bulundu: {', '.join(symbols)}\n")

    results = []
    for symbol in symbols:
        try:
            res = backtest_one(client, symbol, interval, args.limit, config)
            results.append(res)
            print(f"OK   {symbol:<12} getiri={res['return_pct']:+7.2f}%  islem={res['trades']:<4} kazanma_orani={res['win_rate']:5.1f}%")
        except ExchangeError as exc:
            print(f"HATA {symbol:<12} {exc}")
        time.sleep(0.3)  # borsayi yormamak icin kucuk bir bekleme

    if not results:
        print("\nHicbir sembol icin sonuc alinamadi.")
        return

    results.sort(key=lambda r: r["return_pct"], reverse=True)
    print("\n=== Getiriye gore siralama (gecmis veri, garanti degildir) ===")
    for r in results:
        print(f"{r['symbol']:<12} getiri={r['return_pct']:+7.2f}%  islem={r['trades']:<4} kazanma_orani={r['win_rate']:5.1f}%  mum={r['bars']}")


if __name__ == "__main__":
    main()
