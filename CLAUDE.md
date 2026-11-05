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
