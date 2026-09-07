"""REST client for Binance TR's own API (www.binance.tr / api.binance.me).

Binance TR does NOT use the standard Binance.com API format. Key
differences, per https://www.binance.tr/apidocs :

- Trading/account endpoints live under ``https://www.binance.tr/open/v1/...``
  and use symbols WITH an underscore, e.g. ``BTC_USDT``.
- Public market data (klines, trades, depth, aggTrades) is served from
  ``https://api.binance.me/api/v1/...`` and uses symbols WITHOUT the
  underscore, e.g. ``BTCUSDT``.
- Every response is wrapped as ``{"code": 0, "msg": "...", "data": ...,
  "timestamp": ...}`` - code 0 means success, anything else is an error.
- Order side is an int (0=BUY, 1=SELL) and order type is an int
  (2=MARKET, 1=LIMIT, ...) rather than the string enums Binance.com uses.

This client hides those details behind a small, Binance.com-flavoured
interface (get_klines/get_account/create_market_order/...) so the rest
of the bot doesn't need to know about the wrapper format.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
import urllib.parse
from typing import Any

import requests

logger = logging.getLogger(__name__)

SIDE_BUY = 0
SIDE_SELL = 1

ORDER_TYPE_LIMIT = 1
ORDER_TYPE_MARKET = 2


class ExchangeError(Exception):
    """Raised when the exchange REST API returns an error response."""


def to_trade_symbol(symbol: str) -> str:
    """BTCUSDT -> BTC_USDT (Binance TR's trading-endpoint symbol format).

    Already-underscored symbols are returned unchanged.
    """
    if "_" in symbol:
        return symbol.upper()
    # naive split: try common quote assets, longest first
    for quote in ("USDT", "TRY", "BUSD", "BTC", "ETH", "BNB"):
        if symbol.upper().endswith(quote) and len(symbol) > len(quote):
            base = symbol[: -len(quote)]
            return f"{base.upper()}_{quote}"
    return symbol.upper()


def to_market_symbol(symbol: str) -> str:
    """BTC_USDT -> BTCUSDT (Binance TR's market-data symbol format)."""
    return symbol.replace("_", "").upper()


class BinanceClient:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        trade_base_url: str = "https://www.binance.tr",
        market_base_url: str = "https://api.binance.me",
        timeout: float = 10.0,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.trade_base_url = trade_base_url.rstrip("/")
        self.market_base_url = market_base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        if api_key:
            self.session.headers.update({"X-MBX-APIKEY": api_key})

    # -- low level -------------------------------------------------
    def _sign(self, params: dict[str, Any]) -> dict[str, Any]:
        params = dict(params)
        params["timestamp"] = int(time.time() * 1000)
        query = urllib.parse.urlencode(params, doseq=True)
        signature = hmac.new(
            self.api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        params["signature"] = signature
        return params

    def _request(
        self,
        method: str,
        base_url: str,
        path: str,
        params: dict[str, Any] | None = None,
        signed: bool = False,
    ) -> Any:
        url = f"{base_url}{path}"
        params = params or {}
        if signed:
            params = self._sign(params)
        try:
            resp = self.session.request(method, url, params=params, timeout=self.timeout)
        except requests.RequestException as exc:
            raise ExchangeError(f"Network error calling {path}: {exc}") from exc

        if resp.status_code >= 400:
            raise ExchangeError(f"{resp.status_code} {path}: {resp.text[:300]}")
        try:
            payload = resp.json()
        except ValueError as exc:
            raise ExchangeError(
                f"{path} JSON dondurmedi (yanlis base URL olabilir): {resp.text[:300]}"
            ) from exc

        # Binance TR wraps every response as {"code", "msg", "data", "timestamp"}
        if isinstance(payload, dict) and "code" in payload:
            if payload.get("code") not in (0, None):
                raise ExchangeError(f"{path} hata döndürdü: {payload.get('msg')} ({payload})")
            return payload.get("data")
        return payload

    def _trade_request(self, method: str, path: str, params=None, signed=False) -> Any:
        return self._request(method, self.trade_base_url, path, params, signed)

    def _market_request(self, method: str, path: str, params=None) -> Any:
        return self._request(method, self.market_base_url, path, params, signed=False)

    # -- public market data -----------------------------------------
    def get_klines(self, symbol: str, interval: str, limit: int = 200) -> list[list[Any]]:
        data = self._market_request(
            "GET",
            "/api/v1/klines",
            {"symbol": to_market_symbol(symbol), "interval": interval, "limit": limit},
        )
        return data or []

    def get_server_time(self) -> int:
        data = self._trade_request("GET", "/open/v1/common/time")
        return int(data) if isinstance(data, (int, float, str)) else 0

    def get_exchange_symbols(self) -> list[dict[str, Any]]:
        data = self._trade_request("GET", "/open/v1/common/symbols")
        return (data or {}).get("list", [])

    # -- account / trading --------------------------------------------
    def get_account(self) -> dict[str, Any]:
        return self._trade_request("GET", "/open/v1/account/spot", signed=True) or {}

    def get_balance(self, asset: str) -> float:
        account = self.get_account()
        for bal in account.get("accountAssets", []):
            if bal.get("asset") == asset:
                return float(bal.get("free", 0.0))
        return 0.0

    def create_market_order(
        self,
        symbol: str,
        side: str,
        quote_order_qty: float | None = None,
        quantity: float | None = None,
    ) -> dict[str, Any]:
        """side: 'BUY' or 'SELL' (Binance.com-style string, translated here)."""
        params: dict[str, Any] = {
            "symbol": to_trade_symbol(symbol),
            "side": SIDE_BUY if side.upper() == "BUY" else SIDE_SELL,
            "type": ORDER_TYPE_MARKET,
        }
        if quote_order_qty is not None:
            params["quoteOrderQty"] = quote_order_qty
        if quantity is not None:
            params["quantity"] = quantity
        return self._trade_request("POST", "/open/v1/orders", params, signed=True) or {}

    def create_limit_order(
        self, symbol: str, side: str, quantity: float, price: float, time_in_force: int = 1
    ) -> dict[str, Any]:
        params = {
            "symbol": to_trade_symbol(symbol),
            "side": SIDE_BUY if side.upper() == "BUY" else SIDE_SELL,
            "type": ORDER_TYPE_LIMIT,
            "timeInForce": time_in_force,  # 1 = GTC
            "quantity": quantity,
            "price": price,
        }
        return self._trade_request("POST", "/open/v1/orders", params, signed=True) or {}

    def cancel_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        return self._trade_request(
            "POST",
            "/open/v1/orders/cancel",
            {"orderId": order_id},
            signed=True,
        ) or {}

    def get_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        return self._trade_request(
            "GET", "/open/v1/orders/detail", {"orderId": order_id}, signed=True
        ) or {}
