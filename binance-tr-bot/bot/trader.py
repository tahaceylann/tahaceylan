"""Main trading loop wiring strategy, risk management, exchange and state
together."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from .config import Config
from .exchange import BinanceClient, ExchangeError
from .indicators import klines_to_dataframe
from .notifier import TelegramNotifier
from .risk import Position, RiskManager
from .state import load_state, save_state
from .strategy import Signal, StrategyParams, compute_indicators, generate_signal

logger = logging.getLogger(__name__)


def split_symbol_assets(symbol: str, quote_hints: tuple[str, ...] = ("TRY", "USDT", "BTC", "ETH")) -> tuple[str, str]:
    """Best-effort split of e.g. BTCTRY -> (BTC, TRY) without needing
    exchangeInfo (falls back to it being unavailable in dry-run/tests)."""
    for quote in quote_hints:
        if symbol.endswith(quote) and len(symbol) > len(quote):
            return symbol[: -len(quote)], quote
    # fallback: assume last 3 chars are quote
    return symbol[:-3], symbol[-3:]


class Trader:
    def __init__(self, config: Config):
        config.validate()
        self.config = config
        self.client = BinanceClient(config.api_key, config.api_secret, config.base_url)
        self.notifier = TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)
        self.strategy_params = StrategyParams(
            fast_ma=config.fast_ma,
            slow_ma=config.slow_ma,
            rsi_period=config.rsi_period,
            rsi_overbought=config.rsi_overbought,
            rsi_oversold=config.rsi_oversold,
        )
        self.risk = RiskManager(
            stop_loss_pct=config.stop_loss_pct,
            take_profit_pct=config.take_profit_pct,
            trailing_stop_pct=config.trailing_stop_pct,
            max_daily_loss_pct=config.max_daily_loss_pct,
        )
        self.base_asset, self.quote_asset = split_symbol_assets(config.symbol)

        state = load_state(config.state_file)
        self.position: Position | None = (
            Position.from_dict(state["position"]) if state.get("position") else None
        )
        if state.get("risk"):
            self.risk.load_dict(state["risk"])
        self.trade_log: list[dict] = state.get("trade_log", [])

    # -- persistence -----------------------------------------------
    def _persist(self) -> None:
        save_state(
            self.config.state_file,
            {
                "position": self.position.to_dict() if self.position else None,
                "risk": self.risk.to_dict(),
                "trade_log": self.trade_log[-500:],
            },
        )

    def _log_trade(self, side: str, price: float, quantity: float, reason: str = "") -> None:
        entry = {
            "time": datetime.now(timezone.utc).isoformat(),
            "side": side,
            "symbol": self.config.symbol,
            "price": price,
            "quantity": quantity,
            "reason": reason,
            "dry_run": self.config.dry_run,
        }
        self.trade_log.append(entry)
        logger.info("TRADE %s", entry)
        self.notifier.send(
            f"{'[DRY] ' if self.config.dry_run else ''}{side} {self.config.symbol} "
            f"@ {price:.8g} qty={quantity:.8g} {('(' + reason + ')') if reason else ''}"
        )

    # -- core steps ---------------------------------------------------
    def fetch_dataframe(self):
        limit = max(200, self.strategy_params.slow_ma + 50)
        klines = self.client.get_klines(self.config.symbol, self.config.interval, limit=limit)
        df = klines_to_dataframe(klines)
        return compute_indicators(df, self.strategy_params)

    def current_price(self, df) -> float:
        return float(df.iloc[-1]["close"])

    def place_buy(self, price: float) -> None:
        quantity = self.config.quote_order_size / price
        if self.config.dry_run:
            self.position = Position(symbol=self.config.symbol, entry_price=price, quantity=quantity)
            self._log_trade("BUY", price, quantity, reason="signal")
        else:
            try:
                order = self.client.create_market_order(
                    self.config.symbol, "BUY", quote_order_qty=self.config.quote_order_size
                )
                fill_qty = float(order.get("executedQty", quantity))
                fill_price = float(order.get("price") or price)
                cumm_quote = float(order.get("cummulativeQuoteQty", 0) or 0)
                if fill_qty > 0 and cumm_quote > 0:
                    fill_price = cumm_quote / fill_qty
                self.position = Position(
                    symbol=self.config.symbol, entry_price=fill_price, quantity=fill_qty
                )
                self._log_trade("BUY", fill_price, fill_qty, reason="signal")
            except ExchangeError as exc:
                logger.error("Alis emri basarisiz: %s", exc)
                return
        self._persist()

    def place_sell(self, price: float, reason: str) -> None:
        if not self.position:
            return
        quantity = self.position.quantity
        if not self.config.dry_run:
            try:
                self.client.create_market_order(self.config.symbol, "SELL", quantity=quantity)
            except ExchangeError as exc:
                logger.error("Satis emri basarisiz: %s", exc)
                return

        pnl_pct = (price - self.position.entry_price) / self.position.entry_price
        self.risk.record_trade_pnl_pct(pnl_pct)
        self._log_trade("SELL", price, quantity, reason=f"{reason} pnl={pnl_pct:+.2%}")
        self.position = None
        self._persist()

    # -- one iteration --------------------------------------------------
    def step(self) -> None:
        self.risk.reset_if_new_day()

        if self.risk.trading_halted:
            logger.warning("Gunluk zarar limiti asildi; islem yapilmiyor.")
            return

        try:
            df = self.fetch_dataframe()
        except ExchangeError as exc:
            logger.error("Piyasa verisi alinamadi: %s", exc)
            return

        price = self.current_price(df)

        if self.position:
            exit_flag, reason = self.risk.should_exit(self.position, price)
            self._persist()  # keep highest_price up to date
            if exit_flag:
                self.place_sell(price, reason)
                return
            signal = generate_signal(df, self.strategy_params, in_position=True)
            if signal == Signal.SELL:
                self.place_sell(price, "signal")
            return

        signal = generate_signal(df, self.strategy_params, in_position=False)
        if signal == Signal.BUY:
            self.place_buy(price)

    def run_forever(self) -> None:
        mode = "DRY-RUN (kagit uzerinde islem)" if self.config.dry_run else "CANLI"
        logger.info(
            "Bot basladi | mod=%s | sembol=%s | interval=%s",
            mode, self.config.symbol, self.config.interval,
        )
        while True:
            try:
                self.step()
            except Exception:  # noqa: BLE001 - keep the bot alive, log and continue
                logger.exception("Beklenmeyen hata, dongu devam ediyor.")
            time.sleep(self.config.poll_seconds)
