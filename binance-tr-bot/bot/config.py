"""Configuration loading for the trading bot.

All settings are read from environment variables (typically via a .env
file) so that secrets never need to live in source code.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _float(name: str, default: float) -> float:
    val = os.getenv(name)
    return float(val) if val not in (None, "") else default


def _int(name: str, default: int) -> int:
    val = os.getenv(name)
    return int(val) if val not in (None, "") else default


@dataclass
class Config:
    api_key: str = field(default_factory=lambda: os.getenv("BINANCE_API_KEY", ""))
    api_secret: str = field(default_factory=lambda: os.getenv("BINANCE_API_SECRET", ""))
    base_url: str = field(
        default_factory=lambda: os.getenv(
            "BINANCE_BASE_URL", "https://www.binance.tr/apiproxy/v3/api"
        )
    )

    symbol: str = field(default_factory=lambda: os.getenv("SYMBOL", "BTCTRY"))
    interval: str = field(default_factory=lambda: os.getenv("INTERVAL", "15m"))

    fast_ma: int = field(default_factory=lambda: _int("FAST_MA", 9))
    slow_ma: int = field(default_factory=lambda: _int("SLOW_MA", 21))
    rsi_period: int = field(default_factory=lambda: _int("RSI_PERIOD", 14))
    rsi_overbought: float = field(default_factory=lambda: _float("RSI_OVERBOUGHT", 70))
    rsi_oversold: float = field(default_factory=lambda: _float("RSI_OVERSOLD", 30))

    quote_order_size: float = field(default_factory=lambda: _float("QUOTE_ORDER_SIZE", 100))
    max_open_positions: int = field(default_factory=lambda: _int("MAX_OPEN_POSITIONS", 1))
    stop_loss_pct: float = field(default_factory=lambda: _float("STOP_LOSS_PCT", 0.02))
    take_profit_pct: float = field(default_factory=lambda: _float("TAKE_PROFIT_PCT", 0.04))
    trailing_stop_pct: float = field(default_factory=lambda: _float("TRAILING_STOP_PCT", 0.015))
    max_daily_loss_pct: float = field(default_factory=lambda: _float("MAX_DAILY_LOSS_PCT", 0.05))

    dry_run: bool = field(default_factory=lambda: _bool("DRY_RUN", True))
    poll_seconds: int = field(default_factory=lambda: _int("POLL_SECONDS", 30))

    state_file: str = field(default_factory=lambda: os.getenv("STATE_FILE", "state.json"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    telegram_bot_token: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_TOKEN", ""))
    telegram_chat_id: str = field(default_factory=lambda: os.getenv("TELEGRAM_CHAT_ID", ""))

    def validate(self) -> None:
        if not self.dry_run and (not self.api_key or not self.api_secret):
            raise ValueError(
                "DRY_RUN=false icin BINANCE_API_KEY ve BINANCE_API_SECRET gereklidir."
            )
        if self.fast_ma >= self.slow_ma:
            raise ValueError("FAST_MA, SLOW_MA'dan kucuk olmalidir.")
        if self.quote_order_size <= 0:
            raise ValueError("QUOTE_ORDER_SIZE pozitif olmalidir.")
