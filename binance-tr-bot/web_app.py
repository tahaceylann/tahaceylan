#!/usr/bin/env python3
"""Binance TR Trading Bot — web kontrol paneli.

Sunucuda (VPS) arka planda calisir, tarayicidan (bilgisayar veya
telefondan) botu baslatip durdurabilir, canli loglari ve pozisyonu
izleyebilirsiniz. GUI (Tkinter) yerine bunu kullanin - sunucuda ekran
olmadigi icin Tkinter calismaz, bu Flask uygulamasi ise sadece bir
tarayici gerektirir.

Calistirma:
    python web_app.py
    -> tarayicidan http://SUNUCU_IP:8000 adresine gidin

Guvenlik: WEB_PASSWORD ortam degiskeni (.env icinde) ayarlandiysa basit
bir sifre ekrani gosterilir. Interneti acik bir sunucuda MUTLAKA
ayarlayin, aksi halde botunuzu herkes durdurup baslatiyor / API
anahtarlarinizi degistirebilir olabilir.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from functools import wraps

from dotenv import load_dotenv, set_key
from flask import Flask, jsonify, redirect, render_template_string, request, session, url_for

from bot.config import Config
from bot.trader import Trader

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if not os.path.exists(ENV_PATH):
    example = os.path.join(os.path.dirname(ENV_PATH), ".env.example")
    if os.path.exists(example):
        with open(example, "r", encoding="utf-8") as src, open(ENV_PATH, "w", encoding="utf-8") as dst:
            dst.write(src.read())

app = Flask(__name__)
app.secret_key = os.urandom(24)

LOG_BUFFER: deque[str] = deque(maxlen=500)


class BufferLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        LOG_BUFFER.append(self.format(record))


logging.getLogger().setLevel(logging.INFO)
_handler = BufferLogHandler()
_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
logging.getLogger().addHandler(_handler)

state_lock = threading.Lock()
bot_state = {"trader": None, "thread": None, "running": False, "dry_run": True}


def run_loop() -> None:
    while bot_state["running"] and bot_state["trader"] is not None:
        try:
            bot_state["trader"].step()
        except Exception:  # noqa: BLE001
            logging.getLogger("web").exception("Beklenmeyen hata")
        poll = bot_state["trader"].config.poll_seconds if bot_state["trader"] else 5
        for _ in range(poll):
            if not bot_state["running"]:
                break
            time.sleep(1)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        password = os.getenv("WEB_PASSWORD", "")
        if password and not session.get("authed"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper


LOGIN_PAGE = """
<!doctype html><title>Giris</title>
<body style="background:#0f1420;color:#e6ebf5;font-family:sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<form method="post" style="background:#161d2e;padding:32px;border-radius:12px;min-width:280px;">
  <h2>🤖 Binance TR Bot</h2>
  {% if error %}<p style="color:#e5484d;">{{ error }}</p>{% endif %}
  <input type="password" name="password" placeholder="Şifre" autofocus
    style="width:100%;padding:10px;margin:8px 0;background:#1e2740;border:1px solid #28304a;
    color:#e6ebf5;border-radius:6px;box-sizing:border-box;">
  <button style="width:100%;padding:10px;background:#3ecf8e;border:none;border-radius:6px;
    font-weight:bold;cursor:pointer;">Giriş</button>
</form></body>
"""


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("password") == os.getenv("WEB_PASSWORD", ""):
            session["authed"] = True
            return redirect(url_for("index"))
        error = "Yanlış şifre"
    return render_template_string(LOGIN_PAGE, error=error)


DASHBOARD_PAGE = """
<!doctype html>
<title>Binance TR Trading Bot</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body { background:#0f1420; color:#e6ebf5; font-family:-apple-system,Segoe UI,sans-serif; margin:0; }
  header { padding:16px 20px; display:flex; justify-content:space-between; align-items:center; }
  h1 { font-size:18px; margin:0; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px; }
  .dot.on { background:#3ecf8e; } .dot.off { background:#8b93a7; }
  main { display:grid; grid-template-columns: 320px 1fr; gap:16px; padding:0 20px 20px; }
  @media (max-width:800px) { main { grid-template-columns: 1fr; } }
  .panel { background:#161d2e; border:1px solid #28304a; border-radius:12px; padding:16px; }
  label { display:block; color:#8b93a7; font-size:12px; margin:10px 0 4px; }
  input[type=text], input[type=number], input[type=password] {
    width:100%; padding:8px; background:#1e2740; border:1px solid #28304a; color:#e6ebf5;
    border-radius:6px; box-sizing:border-box; font-size:14px;
  }
  button { cursor:pointer; border:none; border-radius:6px; padding:12px; font-weight:bold;
    font-size:14px; width:100%; margin-top:8px; }
  .btn-save { background:#1e2740; color:#e6ebf5; }
  .btn-start { background:#3ecf8e; color:#062018; }
  .btn-stop { background:#e5484d; color:#2a0a0b; }
  .cards { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .card { background:#161d2e; border:1px solid #28304a; border-radius:12px; padding:12px 16px; flex:1; min-width:120px; }
  .card .label { color:#8b93a7; font-size:12px; }
  .card .value { color:#3ecf8e; font-size:20px; font-weight:bold; margin-top:4px; }
  #logs { background:#0a0e17; border-radius:8px; padding:12px; height:60vh; overflow-y:auto;
    font-family:Consolas,monospace; font-size:12px; white-space:pre-wrap; }
  .checkbox-row { display:flex; align-items:center; gap:8px; margin-top:10px; }
</style>
<header>
  <h1>🤖 Binance TR Trading Bot</h1>
  <div><span id="status-dot" class="dot off"></span><span id="status-text">Durduruldu</span></div>
</header>
<main>
  <div class="panel">
    <h3>Ayarlar</h3>
    <label>İşlem çifti</label><input id="SYMBOL" type="text">
    <label>Mum periyodu</label><input id="INTERVAL" type="text">
    <label>Emir başı miktar</label><input id="QUOTE_ORDER_SIZE" type="text">
    <label>Stop-loss</label><input id="STOP_LOSS_PCT" type="text">
    <label>Take-profit</label><input id="TAKE_PROFIT_PCT" type="text">
    <label>Günlük zarar limiti</label><input id="MAX_DAILY_LOSS_PCT" type="text">
    <label>API Key</label><input id="BINANCE_API_KEY" type="password">
    <label>API Secret</label><input id="BINANCE_API_SECRET" type="password">
    <label>Telegram Bot Token</label><input id="TELEGRAM_BOT_TOKEN" type="password">
    <label>Telegram Chat ID</label><input id="TELEGRAM_CHAT_ID" type="text">
    <div class="checkbox-row">
      <input id="DRY_RUN" type="checkbox"><label style="margin:0;">Dry-Run (gerçek emir yok)</label>
    </div>
    <button class="btn-save" onclick="saveSettings()">Ayarları Kaydet</button>
    <button class="btn-start" onclick="startBot()">▶ BAŞLAT</button>
    <button class="btn-stop" onclick="stopBot()">■ DURDUR</button>
  </div>
  <div>
    <div class="cards">
      <div class="card"><div class="label">Pozisyon</div><div class="value" id="c-pos">Yok</div></div>
      <div class="card"><div class="label">Son Fiyat</div><div class="value" id="c-price">-</div></div>
      <div class="card"><div class="label">Günlük PnL</div><div class="value" id="c-pnl">%0.00</div></div>
    </div>
    <div class="panel"><h3>Canlı Loglar</h3><div id="logs"></div></div>
  </div>
</main>
<script>
async function loadSettings() {
  const r = await fetch('/api/settings'); const d = await r.json();
  for (const k in d) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = d[k]; else el.value = d[k];
  }
}
async function saveSettings() {
  const data = {};
  document.querySelectorAll('input').forEach(el => {
    data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  await fetch('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
  alert('Ayarlar kaydedildi');
}
async function startBot() {
  if (!document.getElementById('DRY_RUN').checked) {
    if (!confirm('DRY-RUN kapalı! Bot GERÇEK PARA ile işlem yapacak. Devam edilsin mi?')) return;
  }
  await saveSettings();
  const r = await fetch('/api/start', {method:'POST'});
  const d = await r.json();
  if (!d.ok) alert('Hata: ' + d.error);
}
async function stopBot() { await fetch('/api/stop', {method:'POST'}); }
async function refresh() {
  const r = await fetch('/api/status'); const d = await r.json();
  document.getElementById('status-dot').className = 'dot ' + (d.running ? 'on' : 'off');
  document.getElementById('status-text').textContent = d.running ? ('Çalışıyor (' + (d.dry_run ? 'DRY-RUN' : 'CANLI') + ')') : 'Durduruldu';
  document.getElementById('c-pos').textContent = d.position || 'Yok';
  document.getElementById('c-price').textContent = d.price || '-';
  document.getElementById('c-pnl').textContent = '%' + (d.pnl_pct ?? 0).toFixed(2);
  const logsEl = document.getElementById('logs');
  const atBottom = logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 10;
  logsEl.textContent = d.logs.join('\\n');
  if (atBottom) logsEl.scrollTop = logsEl.scrollHeight;
}
loadSettings();
refresh();
setInterval(refresh, 2000);
</script>
"""


@app.route("/")
@login_required
def index():
    return render_template_string(DASHBOARD_PAGE)


@app.route("/api/settings", methods=["GET", "POST"])
@login_required
def api_settings():
    load_dotenv(ENV_PATH, override=True)
    keys = [
        "SYMBOL", "INTERVAL", "QUOTE_ORDER_SIZE", "STOP_LOSS_PCT", "TAKE_PROFIT_PCT",
        "MAX_DAILY_LOSS_PCT", "BINANCE_API_KEY", "BINANCE_API_SECRET",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    ]
    if request.method == "POST":
        data = request.get_json(force=True)
        for key in keys:
            if key in data:
                set_key(ENV_PATH, key, str(data[key]))
        set_key(ENV_PATH, "DRY_RUN", "true" if data.get("DRY_RUN") else "false")
        return jsonify({"ok": True})

    result = {k: os.getenv(k, "") for k in keys}
    result["DRY_RUN"] = os.getenv("DRY_RUN", "true").lower() in ("1", "true", "yes", "on")
    return jsonify(result)


@app.route("/api/start", methods=["POST"])
@login_required
def api_start():
    with state_lock:
        if bot_state["running"]:
            return jsonify({"ok": True})
        load_dotenv(ENV_PATH, override=True)
        try:
            config = Config()
            bot_state["trader"] = Trader(config)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"ok": False, "error": str(exc)})
        bot_state["running"] = True
        bot_state["dry_run"] = config.dry_run
        bot_state["thread"] = threading.Thread(target=run_loop, daemon=True)
        bot_state["thread"].start()
    return jsonify({"ok": True})


@app.route("/api/stop", methods=["POST"])
@login_required
def api_stop():
    with state_lock:
        bot_state["running"] = False
        bot_state["trader"] = None
    return jsonify({"ok": True})


@app.route("/api/status")
@login_required
def api_status():
    trader = bot_state["trader"]
    position = None
    price = None
    pnl_pct = 0.0
    if trader is not None:
        if trader.position:
            position = f"{trader.position.quantity:.6f} @ {trader.position.entry_price:.2f}"
        if trader.last_price is not None:
            price = f"{trader.last_price:.8g}"
        pnl_pct = trader.risk.daily_pnl_pct * 100
    return jsonify({
        "running": bot_state["running"],
        "dry_run": bot_state["dry_run"],
        "position": position,
        "price": price,
        "pnl_pct": pnl_pct,
        "logs": list(LOG_BUFFER)[-200:],
    })


if __name__ == "__main__":
    port = int(os.getenv("WEB_PORT", "8000"))
    if not os.getenv("WEB_PASSWORD"):
        print("UYARI: WEB_PASSWORD ayarlanmadi! Bu paneli internete acik biraktmayin.")
    app.run(host="0.0.0.0", port=port)
