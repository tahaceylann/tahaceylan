# Proje notları

## Günlük video otomasyonu (`video-otomasyon/`)

Kullanıcı "bugünün videosu", "günlük video", "videoyu çalıştır" gibi bir şey
yazdığında bu hattı çalıştır (zamanlayıcı yok, tetikleyici kullanıcının mesajı):

1. Konuyu kullanıcının mesajından al; yoksa önceki `gunler/*.json` konularıyla
   tekrar etmeyen bir konu seç.
2. Türkçe, 30–60 sn'lik, 4–7 sahneli bir senaryo yaz →
   `video-otomasyon/gunler/<bugünün tarihi>.json` (biçim: `video-otomasyon/README.md`).
   İlk sahne güçlü bir kanca olsun; `ekran` kısa (≤ 5 kelime), `anlatim` 1–2 cümle.
3. `python3 video-otomasyon/olustur.py video-otomasyon/gunler/<tarih>.json`
   (ElevenLabs anahtarı/ağ erişimi yoksa `--onizleme` ile üret ve bunu açıkça söyle).
4. MP4'ü SendUserFile ile kullanıcıya gönder, paylaşım metnini mesajda ver,
   senaryo JSON'unu commit'leyip push et.

## Tilki oyun haberleri Shorts (`video-otomasyon/tilki/`)

Oyun haberi veya tilki geçen isteklerde yukarıdaki genel video hattını değil, bu hattı kullan.

1. **Bülten:** Zamanlanmış görev her gün 08:41'de (Europe/Istanbul) yeni bir oturum açar. Kullanıcı
   "oyun haberleri" ya da "bülten" yazarsa da aynı işi yap: `video-otomasyon/tilki/BULTEN.md` talimatını uygula.
   Bülten 5–10 doğrulanmış haber içerir ve şu soruyla biter: "Bugün tilki hangi haberi sunsun? Numarasını yazman yeterli. 🦊"
2. **Seçim:** Bültenden sonra kullanıcı yalnızca bir numara yazarsa, o günün `video-otomasyon/tilki/bultenler/<tarih>.md`
   dosyasındaki maddeyle `video-otomasyon/tilki/README.md` → "Video üretimi" adımlarını uygula. Kullanıcı numara
   yazmadan video üretme.
3. Tilkinin sesi (`ayarlar.json`) ve görünüşü (`render/tilki.js`) bölümler arasında sabittir. Bölüme göre değiştirme.
4. Teslimde ölçülen süreyi kontrol et (sınır 60 sn), MP4'ü SendUserFile ile gönder, Shorts başlığını ve
   kaynaklı YouTube açıklamasını mesaja yaz. **YouTube'a yükleme yapma.** `senaryo.json` ve `kaynaklar.json`
   dosyalarını commit'le. Görsel, ses ve video dosyalarını commit'leme.
