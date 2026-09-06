#!/usr/bin/env python3
"""Bir sembol icin borsanin minimum emir tutari (NOTIONAL) ve minimum
miktar (LOT_SIZE) kurallarini gosterir. API anahtari gerektirmez.

Kullanim:
    python check_symbol.py --symbol BTC_TRY
"""
from __future__ import annotations

import argparse

from bot.config import Config
from bot.exchange import BinanceClient, to_trade_symbol


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default=None, help="orn. BTC_TRY")
    args = parser.parse_args()

    config = Config()
    symbol = to_trade_symbol(args.symbol or config.symbol)

    client = BinanceClient("", "", config.trade_base_url, config.market_base_url)
    symbols = client.get_exchange_symbols()

    match = next((s for s in symbols if s.get("symbol") == symbol), None)
    if not match:
        available = ", ".join(s.get("symbol", "?") for s in symbols[:30])
        print(f"'{symbol}' bulunamadi. Ornek semboller: {available} ...")
        return

    print(f"Sembol: {match['symbol']}  (baseAsset={match.get('baseAsset')}, quoteAsset={match.get('quoteAsset')})")
    print(f"Spot trading aktif mi: {bool(match.get('spotTradingEnable'))}")
    for f in match.get("filters", []):
        ftype = f.get("filterType")
        if ftype == "NOTIONAL":
            print(f"-> Minimum islem tutari (minNotional): {f.get('minNotional')} {match.get('quoteAsset')}")
        elif ftype == "LOT_SIZE":
            print(f"-> Minimum miktar (minQty): {f.get('minQty')} {match.get('baseAsset')}")
            print(f"-> Miktar adimi (stepSize): {f.get('stepSize')}")
        elif ftype == "PRICE_FILTER":
            print(f"-> Fiyat adimi (tickSize): {f.get('tickSize')}")


if __name__ == "__main__":
    main()
