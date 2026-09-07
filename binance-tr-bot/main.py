#!/usr/bin/env python3
"""Entry point for the Binance TR (Binance-API-compatible) trading bot.

Usage:
    python main.py

Configure everything via a .env file (see .env.example). By default the
bot runs in DRY_RUN mode, placing no real orders — flip DRY_RUN=false
only once you have verified the strategy and understand the risk.
"""
from __future__ import annotations

import logging
import sys

from bot.config import Config
from bot.trader import Trader


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


def main() -> int:
    config = Config()
    setup_logging(config.log_level)
    logger = logging.getLogger("main")

    try:
        trader = Trader(config)
    except ValueError as exc:
        logger.error("Yapilandirma hatasi: %s", exc)
        return 1

    if not config.dry_run:
        logger.warning(
            "CANLI MOD ACIK - gercek para ile islem yapilacak. "
            "5 saniye icinde iptal etmek icin Ctrl+C."
        )
        import time
        time.sleep(5)

    try:
        trader.run_forever()
    except KeyboardInterrupt:
        logger.info("Kullanici tarafindan durduruldu.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
