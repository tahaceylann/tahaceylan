# 💘 Eşleşme — Türkiye'de sevilen özelliklerle tanışma uygulaması (demo)

## Çalıştırma
```bash
cd eslesme/server
npm install
npm start          # http://localhost:3000  (PORT ve DB_PATH ortam değişkenleriyle değişir)
npm test           # hesap, eşleşme, gerçek zamanlı sohbet ve güvenlik testleri
```
Gereksinim: Node.js 22.13+ (yerleşik `node:sqlite` kullanılır). Veriler `server/veri.db` dosyasında tutulur.
Demo profiller sunucuda bot hesaplar olarak yüklenir; gerçek kullanıcılar da birbirini görüp eşleşir.

## Sunucu mimarisi
- **Hesaplar:** e-posta + şifre (scrypt ile hashlenir), 30 günlük rastgele oturum jetonu (veritabanında yalnızca SHA-256'sı), giriş/kayıt için dakikada 10 deneme sınırı, 18+ onayı.
- **REST API** (`/api/*`): kayıt, giriş, çıkış, durum, profil, beğeni (günde 3 süper), geri al, engelle, şikayet, mesaj, okundu, gizli mod, hesap silme.
- **WebSocket** (`/ws`, ilk mesajla jeton doğrulama): anlık mesaj, "yazıyor…", çevrimiçi durumu, "seni beğendi" ve "eşleştiniz" bildirimleri; bağlantı kopunca otomatik yeniden bağlanıp durumu yeniler.
- **Gizlilik:** doğum tarihi, e-posta ve cinsiyet tercihi diğer kullanıcılara gönderilmez; yalnızca beyaz listedeki statik dosyalar servis edilir; CSP ve `nosniff` başlıkları vardır.

## Özellikler
- **Kaydırmalı kartlar** (sürükle ya da buton): Beğen / Geç / ⭐ Süper beğeni (günde 3) / Geri al
- **Burç uyumu** (element bazlı yorum) + ortak ilgi + ilişki hedefi + şehir → **% uyum skoru**
- **Günün eşleşmesi**, **Seni beğenenler**, "Eşleştiniz!" ekranı
- **Sohbet**: buz kırıcı öneriler, "yazıyor…" göstergesi, okundu işareti, demo botlar yanıt verir
- **Türkiye'ye özel**: 81 il listesi, "Ciddi ilişki / Evlilik odaklı / Sohbet-arkadaşlık" hedefleri, sigara-alkol, boy, meslek
- **Filtreler**: yaş aralığı, aynı şehir, ilişki hedefi
- **Güvenlik**: 18+ doğum tarihi kontrolü, engelle, şikayet et, güvenlik ipuçları
- Gizli mod, koyu tema, profil fotoğrafı yükleme, PWA manifesti

## Gerçek ürüne geçerken eksikler
SMS/e-posta doğrulama ve şifre sıfırlama, gerçek selfie doğrulama (rozet şimdilik yalnızca demo botlarda), HTTPS (ters vekil arkasında çalıştırın), moderasyon paneli, KVKK aydınlatma metni, SQLite yerine yönetilen veritabanı ve ödeme (Premium) altyapısı.
