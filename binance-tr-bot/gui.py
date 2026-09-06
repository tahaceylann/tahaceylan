#!/usr/bin/env python3
"""Binance TR Trading Bot — masaüstü kontrol paneli.

Tkinter tabanlı, tek pencerelik bir arayüz: ayarları görsel olarak
düzenleyin, tek tuşla botu başlatın/durdurun, canlı logları ve açık
pozisyonu izleyin. Python'un standart kütüphanesiyle gelir (tkinter),
ekstra bir GUI bağımlılığı gerekmez.

Çalıştırma:
    python gui.py

Windows'ta çift tıklanabilir bir .exe olarak paketlemek icin
build_windows_exe.bat dosyasina bakin.
"""
from __future__ import annotations

import logging
import os
import queue
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from dotenv import set_key

from bot.config import Config
from bot.trader import Trader

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

# -- renk paleti (koyu tema) --------------------------------------------
BG = "#0f1420"
PANEL = "#161d2e"
PANEL_2 = "#1e2740"
FG = "#e6ebf5"
MUTED = "#8b93a7"
ACCENT = "#3ecf8e"
ACCENT_DARK = "#2ba36f"
DANGER = "#e5484d"
DANGER_DARK = "#c53a3e"
BORDER = "#28304a"
FONT = ("Segoe UI", 10)
FONT_BOLD = ("Segoe UI", 11, "bold")
FONT_MONO = ("Consolas", 9)


class QueueLogHandler(logging.Handler):
    """Log kayitlarini bir thread-safe kuyruga yazar; GUI bunlari
    ana thread'de okuyup metin kutusuna basar."""

    def __init__(self, log_queue: "queue.Queue[str]"):
        super().__init__()
        self.log_queue = log_queue

    def emit(self, record: logging.LogRecord) -> None:
        self.log_queue.put(self.format(record))


class BotApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Binance TR Trading Bot")
        self.geometry("980x640")
        self.minsize(820, 560)
        self.configure(bg=BG)

        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.trader: Trader | None = None
        self.bot_thread: threading.Thread | None = None
        self.running = False

        self._ensure_env_file()
        self._build_style()
        self._build_layout()
        self.after(200, self._drain_log_queue)
        self.after(1000, self._refresh_status)

    # -- ilk kurulum -----------------------------------------------
    def _ensure_env_file(self) -> None:
        example = os.path.join(os.path.dirname(ENV_PATH), ".env.example")
        if not os.path.exists(ENV_PATH) and os.path.exists(example):
            with open(example, "r", encoding="utf-8") as src, open(ENV_PATH, "w", encoding="utf-8") as dst:
                dst.write(src.read())

    def _build_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("TLabel", background=BG, foreground=FG, font=FONT)
        style.configure("Panel.TLabel", background=PANEL, foreground=FG, font=FONT)
        style.configure("Muted.TLabel", background=PANEL, foreground=MUTED, font=FONT)
        style.configure("Header.TLabel", background=BG, foreground=FG, font=("Segoe UI", 16, "bold"))
        style.configure("Value.TLabel", background=PANEL, foreground=ACCENT, font=("Segoe UI", 13, "bold"))
        style.configure(
            "TEntry", fieldbackground=PANEL_2, foreground=FG, insertcolor=FG, borderwidth=0
        )
        style.configure(
            "TCombobox", fieldbackground=PANEL_2, foreground=FG, background=PANEL_2
        )

    # -- layout --------------------------------------------------------
    def _build_layout(self) -> None:
        header = ttk.Frame(self, style="TFrame")
        header.pack(fill="x", padx=20, pady=(18, 8))
        ttk.Label(header, text="🤖 Binance TR Trading Bot", style="Header.TLabel").pack(side="left")

        self.status_dot = tk.Label(header, text="●", fg=MUTED, bg=BG, font=("Segoe UI", 16))
        self.status_dot.pack(side="right", padx=(0, 6))
        self.status_label = ttk.Label(header, text="Durduruldu", style="TLabel")
        self.status_label.pack(side="right")

        body = ttk.Frame(self, style="TFrame")
        body.pack(fill="both", expand=True, padx=20, pady=(0, 16))
        body.columnconfigure(0, weight=1)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        self._build_settings_panel(body)
        self._build_right_panel(body)

    def _build_settings_panel(self, parent: ttk.Frame) -> None:
        panel = tk.Frame(parent, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        panel.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        ttk.Label(panel, text="Ayarlar", style="Panel.TLabel", font=FONT_BOLD, background=PANEL).pack(
            anchor="w", padx=16, pady=(14, 6)
        )

        form = tk.Frame(panel, bg=PANEL)
        form.pack(fill="x", padx=16, pady=4)

        self.vars: dict[str, tk.StringVar] = {}
        cfg = Config()

        fields = [
            ("SYMBOL", "İşlem çifti (örn. BTC_TRY)", cfg.symbol),
            ("INTERVAL", "Mum periyodu", cfg.interval),
            ("QUOTE_ORDER_SIZE", "Emir başı miktar", str(cfg.quote_order_size)),
            ("STOP_LOSS_PCT", "Stop-loss (0.02=%2)", str(cfg.stop_loss_pct)),
            ("TAKE_PROFIT_PCT", "Take-profit (0.04=%4)", str(cfg.take_profit_pct)),
            ("MAX_DAILY_LOSS_PCT", "Günlük zarar limiti", str(cfg.max_daily_loss_pct)),
        ]
        for key, label, default in fields:
            row = tk.Frame(form, bg=PANEL)
            row.pack(fill="x", pady=5)
            ttk.Label(row, text=label, style="Muted.TLabel").pack(anchor="w")
            var = tk.StringVar(value=os.getenv(key, default))
            entry = ttk.Entry(row, textvariable=var, style="TEntry")
            entry.pack(fill="x", pady=(2, 0), ipady=4)
            self.vars[key] = var

        # API keys
        api_row = tk.Frame(form, bg=PANEL)
        api_row.pack(fill="x", pady=5)
        ttk.Label(api_row, text="API Key", style="Muted.TLabel").pack(anchor="w")
        self.vars["BINANCE_API_KEY"] = tk.StringVar(value=os.getenv("BINANCE_API_KEY", ""))
        ttk.Entry(api_row, textvariable=self.vars["BINANCE_API_KEY"], style="TEntry", show="•").pack(
            fill="x", pady=(2, 0), ipady=4
        )

        secret_row = tk.Frame(form, bg=PANEL)
        secret_row.pack(fill="x", pady=5)
        ttk.Label(secret_row, text="API Secret", style="Muted.TLabel").pack(anchor="w")
        self.vars["BINANCE_API_SECRET"] = tk.StringVar(value=os.getenv("BINANCE_API_SECRET", ""))
        ttk.Entry(secret_row, textvariable=self.vars["BINANCE_API_SECRET"], style="TEntry", show="•").pack(
            fill="x", pady=(2, 0), ipady=4
        )

        # dry run toggle
        toggle_row = tk.Frame(form, bg=PANEL)
        toggle_row.pack(fill="x", pady=(10, 4))
        self.dry_run_var = tk.BooleanVar(value=cfg.dry_run)
        chk = tk.Checkbutton(
            toggle_row,
            text="Dry-Run (kağıt üzerinde işlem — gerçek emir yok)",
            variable=self.dry_run_var,
            bg=PANEL, fg=FG, selectcolor=PANEL_2, activebackground=PANEL,
            activeforeground=FG, font=FONT,
        )
        chk.pack(anchor="w")

        save_btn = tk.Button(
            panel, text="Ayarları Kaydet (.env)", command=self._save_settings,
            bg=PANEL_2, fg=FG, activebackground=BORDER, activeforeground=FG,
            font=FONT, relief="flat", bd=0, padx=10, pady=8, cursor="hand2",
        )
        save_btn.pack(fill="x", padx=16, pady=(14, 16))

        # start/stop buttons
        btn_row = tk.Frame(panel, bg=PANEL)
        btn_row.pack(fill="x", padx=16, pady=(0, 16))

        self.start_btn = tk.Button(
            btn_row, text="▶  BAŞLAT", command=self.start_bot,
            bg=ACCENT, fg="#062018", activebackground=ACCENT_DARK, activeforeground="#062018",
            font=("Segoe UI", 12, "bold"), relief="flat", bd=0, padx=10, pady=12, cursor="hand2",
        )
        self.start_btn.pack(fill="x", pady=(0, 8))

        self.stop_btn = tk.Button(
            btn_row, text="■  DURDUR", command=self.stop_bot, state="disabled",
            bg=DANGER, fg="#2a0a0b", activebackground=DANGER_DARK, activeforeground="#2a0a0b",
            font=("Segoe UI", 12, "bold"), relief="flat", bd=0, padx=10, pady=12, cursor="hand2",
        )
        self.stop_btn.pack(fill="x")

    def _build_right_panel(self, parent: ttk.Frame) -> None:
        right = ttk.Frame(parent, style="TFrame")
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)

        # info cards
        cards = tk.Frame(right, bg=BG)
        cards.pack(fill="x", pady=(0, 10))
        self.card_position = self._make_card(cards, "Pozisyon", "Yok")
        self.card_price = self._make_card(cards, "Son Fiyat", "-")
        self.card_pnl = self._make_card(cards, "Günlük PnL", "%0.00")
        for c in (self.card_position, self.card_price, self.card_pnl):
            c[0].pack(side="left", expand=True, fill="both", padx=4)

        # log panel
        log_panel = tk.Frame(right, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        log_panel.pack(fill="both", expand=True)
        ttk.Label(log_panel, text="Canlı Loglar", style="Panel.TLabel", font=FONT_BOLD, background=PANEL).pack(
            anchor="w", padx=16, pady=(12, 6)
        )
        text_frame = tk.Frame(log_panel, bg=PANEL)
        text_frame.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.log_text = tk.Text(
            text_frame, bg="#0a0e17", fg="#c7d0e0", insertbackground=FG,
            font=FONT_MONO, relief="flat", wrap="word", state="disabled",
        )
        scrollbar = tk.Scrollbar(text_frame, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scrollbar.set)
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.log_text.tag_config("ERROR", foreground=DANGER)
        self.log_text.tag_config("WARNING", foreground="#e5b73b")
        self.log_text.tag_config("INFO", foreground="#c7d0e0")

    def _make_card(self, parent, title, value):
        frame = tk.Frame(parent, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        ttk.Label(frame, text=title, style="Muted.TLabel", background=PANEL).pack(
            anchor="w", padx=14, pady=(10, 0)
        )
        val_label = tk.Label(frame, text=value, bg=PANEL, fg=ACCENT, font=("Segoe UI", 14, "bold"))
        val_label.pack(anchor="w", padx=14, pady=(2, 12))
        return frame, val_label

    # -- ayarlari .env'e yaz --------------------------------------------
    def _save_settings(self) -> None:
        try:
            for key, var in self.vars.items():
                set_key(ENV_PATH, key, var.get())
            set_key(ENV_PATH, "DRY_RUN", "true" if self.dry_run_var.get() else "false")
            messagebox.showinfo("Kaydedildi", "Ayarlar .env dosyasına kaydedildi.")
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Hata", f"Ayarlar kaydedilemedi:\n{exc}")

    # -- bot kontrol -----------------------------------------------
    def start_bot(self) -> None:
        if self.running:
            return
        self._save_settings()

        if not self.dry_run_var.get():
            if not messagebox.askyesno(
                "Canlı Mod Onayı",
                "DRY-RUN kapalı! Bot GERÇEK PARA ile işlem yapacak.\n\nDevam etmek istiyor musunuz?",
            ):
                return

        # reload env values freshly written to .env
        from dotenv import load_dotenv
        load_dotenv(ENV_PATH, override=True)

        try:
            config = Config()
            self.trader = Trader(config)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Yapılandırma Hatası", str(exc))
            return

        handler = QueueLogHandler(self.log_queue)
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)
        root_logger.addHandler(handler)

        self.running = True
        self.bot_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.bot_thread.start()

        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        mode = "DRY-RUN" if self.dry_run_var.get() else "CANLI"
        self.status_label.configure(text=f"Çalışıyor ({mode})")
        self.status_dot.configure(fg=ACCENT)

    def _run_loop(self) -> None:
        import time
        while self.running and self.trader is not None:
            try:
                self.trader.step()
            except Exception:  # noqa: BLE001
                logging.getLogger("gui").exception("Beklenmeyen hata")
            for _ in range(self.trader.config.poll_seconds if self.trader else 5):
                if not self.running:
                    break
                time.sleep(1)

    def stop_bot(self) -> None:
        self.running = False
        self.trader = None
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")
        self.status_label.configure(text="Durduruldu")
        self.status_dot.configure(fg=MUTED)

    # -- periyodik UI guncellemeleri --------------------------------
    def _drain_log_queue(self) -> None:
        while not self.log_queue.empty():
            line = self.log_queue.get_nowait()
            tag = "INFO"
            for lvl in ("ERROR", "WARNING"):
                if f"[{lvl}]" in line:
                    tag = lvl
                    break
            self.log_text.configure(state="normal")
            self.log_text.insert("end", line + "\n", tag)
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        self.after(200, self._drain_log_queue)

    def _refresh_status(self) -> None:
        if self.trader is not None:
            pos = self.trader.position
            self.card_position[1].configure(text=f"{pos.quantity:.6f} @ {pos.entry_price:.2f}" if pos else "Yok")
            self.card_pnl[1].configure(text=f"%{self.trader.risk.daily_pnl_pct * 100:.2f}")
        self.after(2000, self._refresh_status)

    def on_close(self) -> None:
        self.running = False
        self.destroy()


def main() -> None:
    app = BotApp()
    app.protocol("WM_DELETE_WINDOW", app.on_close)
    app.mainloop()


if __name__ == "__main__":
    main()
