"""Thin REST client for a Binance-API-compatible exchange (e.g. Binance TR).

Only the endpoints the bot needs are implemented: public market data,
account balances, and placing/cancelling market & limit orders. All
private calls are HMAC-SHA256 signed the way Binance's API expects.
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


class ExchangeError(Exception):
    """Raised when the exchange REST API returns an error response."""


class BinanceClient:
    def __init__(self, api_key: str, api_secret: str, base_url: str, timeout: float = 10.0):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip("/")
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
        path: str,
        params: dict[str, Any] | None = None,
        signed: bool = False,
    ) -> Any:
        url = f"{self.base_url}{path}"
        params = params or {}
        if signed:
            params = self._sign(params)
        try:
            resp = self.session.request(method, url, params=params, timeout=self.timeout)
        except requests.RequestException as exc:
            raise ExchangeError(f"Network error calling {path}: {exc}") from exc

        if resp.status_code >= 400:
            raise ExchangeError(f"{resp.status_code} {path}: {resp.text}")
        try:
            return resp.json()
        except ValueError as exc:
            raise ExchangeError(f"Invalid JSON from {path}: {resp.text}") from exc

    # -- public market data -----------------------------------------
    def get_klines(self, symbol: str, interval: str, limit: int = 200) -> list[list[Any]]:
        return self._request(
            "GET",
            "/klines",
            {"symbol": symbol, "interval": interval, "limit": limit},
        )

    def get_ticker_price(self, symbol: str) -> float:
        data = self._request("GET", "/ticker/price", {"symbol": symbol})
        return float(data["price"])

    def get_exchange_info(self, symbol: str) -> dict[str, Any]:
        return self._request("GET", "/exchangeInfo", {"symbol": symbol})

    # -- account / trading --------------------------------------------
    def get_account(self) -> dict[str, Any]:
        return self._request("GET", "/account", signed=True)

    def get_balance(self, asset: str) -> float:
        account = self.get_account()
        for bal in account.get("balances", []):
            if bal.get("asset") == asset:
                return float(bal.get("free", 0.0))
        return 0.0

    def create_market_order(self, symbol: str, side: str, quote_order_qty: float | None = None,
                             quantity: float | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"symbol": symbol, "side": side, "type": "MARKET"}
        if quote_order_qty is not None:
            params["quoteOrderQty"] = quote_order_qty
        if quantity is not None:
            params["quantity"] = quantity
        return self._request("POST", "/order", params, signed=True)

    def create_limit_order(self, symbol: str, side: str, quantity: float, price: float,
                            time_in_force: str = "GTC") -> dict[str, Any]:
        params = {
            "symbol": symbol,
            "side": side,
            "type": "LIMIT",
            "timeInForce": time_in_force,
            "quantity": quantity,
            "price": price,
        }
        return self._request("POST", "/order", params, signed=True)

    def cancel_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        return self._request(
            "DELETE", "/order", {"symbol": symbol, "orderId": order_id}, signed=True
        )

    def get_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        return self._request(
            "GET", "/order", {"symbol": symbol, "orderId": order_id}, signed=True
        )
