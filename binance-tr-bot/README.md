# Binance TR Trading Bot

Binance TR (veya herhangi bir Binance API uyumlu borsa) üzerinde otomatik
alım-satım yapan, risk yönetimi ve kağıt üzerinde test (dry-run) modu
içeren profesyonel bir Python trading botu.

⚠️ **Binance TR API notu:** Binance TR, Binance.com ile **aynı API'yi
kullanmıyor** — kendine özgü bir formatı var:
- Emir/hesap uçları `https://www.binance.tr/open/v1/...` üzerinden, sembol
  alt çizgili (`BTC_TRY`)
- Piyasa verisi (mum/kline) `https://api.binance.me/api/v1/...` üzerinden,
  sembol alt çizgisiz (`BTCTRY`)
- Tüm yanıtlar `{"code":0,"msg":"success","data":...}` ile sarmalanmış

`bot/exchange.py` bu gerçek API'ye göre yazıldı (resmi dokümantasyon:
https://www.binance.tr/apidocs). Sembol dönüşümleri (`BTC_TRY` ↔
`BTCTRY`) otomatik yapılıyor, siz sadece `.env`'de `SYMBOL=BTC_TRY` gibi
alt çizgili formatı kullanın.

⚠️ **Uyarı:** Kripto para ticareti yüksek risk içerir. Bu bot bir yatırım
tavsiyesi değildir. Gerçek parayla (`DRY_RUN=false`) çalıştırmadan önce
mutlaka backtest yapın, küçük miktarlarla test edin ve kaybetmeyi göze
alabileceğinizden fazlasını riske atmayın.

## Özellikler

- **Strateji**: EMA (hızlı/yavaş) kesişimi + RSI filtresi ile alım/satım sinyali
- **Risk yönetimi**: stop-loss, take-profit, trailing stop ve günlük zarar
  limitine ulaşınca otomatik duran "kill-switch"
- **Dry-run (kağıt üzerinde işlem) modu**: gerçek emir göndermeden stratejiyi
  canlı piyasa verisiyle test edebilirsiniz
- **Durum kalıcılığı**: bot yeniden başlatılsa bile açık pozisyon ve günlük
  zarar sayaçları `state.json` dosyasından geri yüklenir
- **Backtest scripti**: geçmiş mum verileriyle stratejiyi hızlıca test edin
- **Telegram bildirimleri** (opsiyonel): her alım/satımda mesaj gönderir
- **Kapsamlı loglama** ve otomatik yeniden deneme mantığı

## 🖥️ Masaüstü Uygulaması (GUI) — Tek Tuşla Başlatma

Botu terminal yerine görsel bir kontrol panelinden çalıştırmak isterseniz:

### A) Kaynaktan çalıştırma (en hızlı yol)

- **Windows**: `run_gui.bat` dosyasına çift tıklayın.
- **Linux/macOS**: `./run_gui.sh` çalıştırın.

Bağımlılıkları otomatik kurar, `.env` yoksa oluşturur ve pencereyi açar.

### B) Gerçek bir `.exe` oluşturma (Windows)

`.exe` yalnızca Windows üzerinde derlenebilir (Linux'tan çapraz derleme
güvenilir değildir), bu yüzden aşağıdaki adımı **kendi Windows
bilgisayarınızda** yapmanız gerekir:

1. [Python 3.10+](https://www.python.org/downloads/) kurun ("Add python.exe
   to PATH" kutusunu işaretleyin).
2. Bu klasörü (`binance-tr-bot`) Windows bilgisayarınıza kopyalayın.
3. `build_windows_exe.bat` dosyasına **çift tıklayın**.
4. Birkaç dakika sonra `dist\BinanceTRBot.exe` oluşur.
5. Bundan sonra botu açmak için sadece bu `.exe` dosyasına çift tıklamanız
   yeterli — kurulum, Python vs. gerekmez.

> `.exe`'yi çalıştırdığınız klasörde bir `.env` dosyası bulunmalı (ayarlar
> oradan okunur). GUI içinden "Ayarları Kaydet" butonuyla da düzenleyip
> kaydedebilirsiniz.

### GUI'de neler var?

- Sembol, periyot, emir miktarı, stop-loss/take-profit/günlük zarar limiti
  gibi ayarları formdan düzenleyip **Ayarları Kaydet** ile `.env`'e yazma
  - Dry-Run / Canlı mod anahtarı (canlı moda geçerken onay istenir)
- **BAŞLAT / DURDUR** butonlarıyla tek tıkla kontrol
- Açık pozisyon, son fiyat ve günlük kâr/zarar kartları
- Canlı log akışı (hata/uyarı satırları renkli gösterilir)

## Kurulum (komut satırından)

```bash
cd binance-tr-bot
pip install -r requirements.txt
cp .env.example .env
# .env dosyasını kendi API anahtarlarınız ve tercihlerinizle düzenleyin
```

## Yapılandırma

Tüm ayarlar `.env` dosyasından okunur (bkz. `.env.example`):

| Değişken | Açıklama |
|---|---|
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | API kimlik bilgileri (sadece `DRY_RUN=false` iken gerekli) |
| `BINANCE_BASE_URL` | Borsanın REST API adresi |
| `SYMBOL` | İşlem çifti, örn. `BTCTRY` |
| `INTERVAL` | Mum periyodu: `1m,5m,15m,1h,4h,1d...` |
| `FAST_MA` / `SLOW_MA` | EMA periyotları |
| `RSI_PERIOD`, `RSI_OVERBOUGHT`, `RSI_OVERSOLD` | RSI filtre ayarları |
| `QUOTE_ORDER_SIZE` | Her alımda harcanacak kotasyon para miktarı (örn. TRY) |
| `STOP_LOSS_PCT`, `TAKE_PROFIT_PCT`, `TRAILING_STOP_PCT` | Pozisyon risk yönetimi |
| `MAX_DAILY_LOSS_PCT` | Günlük zarar limiti aşılınca bot işlem yapmayı durdurur |
| `DRY_RUN` | `true` ise gerçek emir gönderilmez (varsayılan ve önerilen başlangıç) |
| `POLL_SECONDS` | Her döngü arası bekleme süresi |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Opsiyonel bildirimler |

## Çalıştırma

```bash
# Önce backtest ile stratejiyi geçmiş veriyle test edin
python backtest.py --symbol BTCTRY --interval 15m --limit 1000

# Ardından dry-run modunda canlı piyasada (gerçek emir göndermeden) izleyin
python main.py

# Stratejiden memnun kalınca .env içinde DRY_RUN=false yapıp
# gerçek API anahtarlarınızla çalıştırın (küçük miktarla başlayın!)
```

## Coinler Arası Karşılaştırma (hangi coin geçmişte daha iyi çalışmış?)

```bash
python compare_symbols.py --quote TRY --interval 15m --limit 1000
```

Borsadaki tüm TRY paritelerinde (veya `--symbols BTC_TRY,ETH_TRY,SOL_TRY`
ile verdiğiniz listede) botun stratejisini geçmiş veriyle çalıştırıp
getiriye göre sıralar. ⚠️ **Geçmişte iyi sonuç vermiş olması gelecekte de
aynı olacağı anlamına gelmez** — bu bir yatırım tavsiyesi değil, sadece
stratejinin farklı coinlerdeki geçmiş davranışını karşılaştırma aracıdır.

## Testler

```bash
pip install pytest
pytest tests/ -v
```

## Mimari

```
binance-tr-bot/
├── main.py            # giriş noktası (komut satırı), ana döngüyü başlatır
├── gui.py              # masaüstü kontrol paneli (Tkinter)
├── build_windows_exe.bat  # Windows'ta .exe olusturucu (PyInstaller)
├── run_gui.bat / run_gui.sh  # tek tikla/tek komutla GUI baslatici
├── backtest.py         # geçmiş veri üzerinde strateji testi
├── bot/
│   ├── config.py       # .env tabanlı yapılandırma
│   ├── exchange.py     # Binance API uyumlu imzalı REST istemcisi
│   ├── indicators.py   # SMA/EMA/RSI hesaplamaları
│   ├── strategy.py     # alım/satım sinyali üretimi
│   ├── risk.py         # stop-loss/take-profit/trailing/kill-switch
│   ├── state.py        # JSON durum kalıcılığı (atomik yazım)
│   └── notifier.py     # Telegram bildirimleri
└── tests/
    └── test_strategy.py
```

## Önemli Notlar

- Binance TR'nin API adresini ve sembol formatlarını kendi hesabınızdan
  doğrulayın; `BINANCE_BASE_URL` bu yüzden yapılandırılabilir bırakıldı.
- API anahtarlarınıza yalnızca **spot trading** izni verin, **para çekme
  izni vermeyin**.
- `.env` dosyanızı asla commit etmeyin (`.gitignore` içinde zaten hariç
  tutulmuştur).
- Strateji basit ve okunabilir tutulmuştur (`bot/strategy.py`); daha
  gelişmiş bir modelle kolayca değiştirilebilir.
