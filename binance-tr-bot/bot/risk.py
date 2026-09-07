"""Position/risk management: stop-loss, take-profit, trailing stop and a
daily loss kill-switch."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class Position:
    symbol: str
    entry_price: float
    quantity: float
    highest_price: float = 0.0

    def __post_init__(self) -> None:
        if self.highest_price <= 0:
            self.highest_price = self.entry_price

    def update_high(self, price: float) -> None:
        if price > self.highest_price:
            self.highest_price = price

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "entry_price": self.entry_price,
            "quantity": self.quantity,
            "highest_price": self.highest_price,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Position":
        return cls(**data)


@dataclass
class RiskManager:
    stop_loss_pct: float
    take_profit_pct: float
    trailing_stop_pct: float
    max_daily_loss_pct: float

    daily_pnl_pct: float = 0.0
    day: date = field(default_factory=date.today)
    trading_halted: bool = False

    def reset_if_new_day(self) -> None:
        today = date.today()
        if today != self.day:
            self.day = today
            self.daily_pnl_pct = 0.0
            self.trading_halted = False

    def record_trade_pnl_pct(self, pnl_pct: float) -> None:
        self.daily_pnl_pct += pnl_pct
        if self.daily_pnl_pct <= -abs(self.max_daily_loss_pct):
            self.trading_halted = True

    def should_exit(self, position: Position, price: float) -> tuple[bool, str]:
        """Check stop-loss / take-profit / trailing-stop against current price."""
        position.update_high(price)
        change = (price - position.entry_price) / position.entry_price

        if change <= -abs(self.stop_loss_pct):
            return True, "stop_loss"

        if change >= self.take_profit_pct:
            return True, "take_profit"

        drawdown_from_high = (price - position.highest_price) / position.highest_price
        if change > 0 and drawdown_from_high <= -abs(self.trailing_stop_pct):
            return True, "trailing_stop"

        return False, ""

    def to_dict(self) -> dict:
        return {
            "daily_pnl_pct": self.daily_pnl_pct,
            "day": self.day.isoformat(),
            "trading_halted": self.trading_halted,
        }

    def load_dict(self, data: dict) -> None:
        self.daily_pnl_pct = data.get("daily_pnl_pct", 0.0)
        self.trading_halted = data.get("trading_halted", False)
        day_str = data.get("day")
        if day_str:
            try:
                self.day = date.fromisoformat(day_str)
            except ValueError:
                pass
