"""Optional Telegram notifications. No-op if not configured."""
from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.enabled = bool(bot_token and chat_id)

    def send(self, message: str) -> None:
        if not self.enabled:
            logger.debug("Telegram devre disi; mesaj: %s", message)
            return
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            requests.post(
                url, json={"chat_id": self.chat_id, "text": message}, timeout=10
            )
        except requests.RequestException as exc:
            logger.warning("Telegram bildirimi gonderilemedi: %s", exc)
