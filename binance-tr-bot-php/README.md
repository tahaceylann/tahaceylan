# Binance TR Trading Bot — PHP Sürümü (Paylaşımlı Hosting için)

Bu, botun [Python sürümüyle](../binance-tr-bot) aynı stratejiyi (EMA
kesişimi + RSI filtresi) ve risk yönetimini (stop-loss/take-profit/
trailing-stop/günlük zarar limiti) kullanan **PHP + Cron Job**
sürümüdür. VPS gerektirmez — Hostinger'ın normal (paylaşımlı) web
hosting paketinde çalışır.

## Nasıl çalışır?

- **`run.php`**: Hostinger'ın Cron Job özelliğiyle periyodik olarak
  (genelde en sık 1 dakikada bir) çalıştırılır. Her çalıştığında
  piyasayı kontrol eder, gerekirse alım/satım yapar, sonra kapanır.
  Sürekli açık kalan bir program **değildir** (paylaşımlı hostingde
  buna izin verilmez).
- **`index.php`**: Tarayıcıdan girip ayarları değiştirdiğiniz,
  botu başlatıp durdurduğunuz, logları izlediğiniz web paneli.
- **`data/`** klasörü: ayarlar (`config.json`), pozisyon/durum
  (`state.json`) ve loglar (`log.txt`) burada saklanır. `.htaccess`
  ile dışarıdan erişim engellenmiştir.

⚠️ Mum periyodu 15 dakika olduğu için 1 dakikalık kontrol, saniyelik
hassasiyetle aynı sonucu verir — sinyal zaten mum kapanışına göre
oluşur.

## Hostinger'a Kurulum

### 1) Dosyaları yükleyin

hPanel → **Dosyalar → Dosya Yöneticisi**'nden `public_html` altında bir
klasör açın (örn. `bot`) ve bu klasördeki tüm dosyaları oraya yükleyin
(ZIP olarak yükleyip "Extract" ile açabilirsiniz).

Alternatif: hPanel'de Git entegrasyonu varsa, bu repoyu doğrudan
bağlayabilirsiniz (branch: `claude/binance-tr-trading-bot-qtshtz`,
klasör: `binance-tr-bot-php`).

### 2) `data/` klasörüne yazma izni verin

Dosya Yöneticisi'nde `data` klasörüne sağ tık → **İzinler/Permissions**
→ `755` (veya yazma sorunu olursa `775`) yapın.

### 3) Web panelini açın

Tarayıcıdan `https://alanadiniz.com/bot/` (veya yüklediğiniz klasör her
neyse) adresine gidin. İlk açılışta **kurulum ekranı** çıkacak, bir
panel şifresi belirleyin.

### 4) Ayarları girin

Panelde: İşlem çifti (`BTC_TRY`), emir miktarı, stop-loss/take-profit,
API Key/Secret, Telegram bilgileri — hepsini girip **Ayarları Kaydet**.
**Dry-Run işaretli kalsın** (ilk testler için).

### 5) Cron Job'u kurun

hPanel → **Gelişmiş → Cron Jobs** → yeni cron job ekleyin:
- **Sıklık**: Her dakika (`* * * * *`) — izin veriliyorsa
- **Komut**:
  ```
  php /home/KULLANICI_ADI/public_html/bot/run.php
  ```
  (Gerçek yolu Dosya Yöneticisi'nde `run.php`'ye sağ tıklayıp
  "Tam yol/Full path"tan görebilirsiniz, ya da panelin alt kısmında
  gösterilen tam yolu kullanın.)

Eğer hPanel'de sadece "URL çağır" seçeneği varsa, panelin alt kısmında
gösterilen `run.php?secret=...` adresini kullanın.

### 6) Test edin

Panelde **▶ BAŞLAT**'a basın (Dry-Run açıkken risk yok). Bir-iki dakika
bekleyip sayfayı yenileyin, "Canlı Loglar" bölümünde satırlar akmaya
başlamalı.

### 7) Canlıya geçiş

Dry-Run'ı kapatıp gerçek API anahtarınızla test ettikten sonra
(küçük bir `quote_order_size` ile başlayın) gerçek işlemlere
geçebilirsiniz.

## Güvenlik notları

- Panel şifrenizi güçlü seçin — bu sayfa internete açık
- API anahtarınızda **"Çekme İşlemleri"** kapalı kalsın
- `data/` klasörüne doğrudan tarayıcıdan erişilemez (`.htaccess` ile
  engellendi) — yine de bu klasörü Dosya Yöneticisi'nden kimseyle
  paylaşmayın
- `run.php?secret=...` adresindeki `secret` değerini kimseyle paylaşmayın
  (config.json içinde `cron_secret` alanında saklanır)
