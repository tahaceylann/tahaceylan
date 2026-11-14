# Fox Bülten (tilki)

Gamer tilki sunuculu, 1080×1920 dikey oyun haberi videosu.

Akış (her sabah zamanlanmış görev başlatır):
1. Güncel oyun haberleri numaralı liste olarak sunulur, Taha bir numara seçer.
2. Senaryo yazılır, konuya uygun görseller Taha'dan istenir.
3. ElevenLabs bağlantısı kontrol edilir, Türkçe seslendirme üretilir (ses: Hasan, `TA7RCSTD5b2z14h1TDTX`, model `eleven_v4`), mp3 `content_url`'den indirilir.
4. `python3 tilki.py gunler/<tarih>.json <ses.mp3> cikti/<tarih>.mp4`

Senaryo:
```json
{ "manset": "Kısa başlık", "metin": "Seslendirilen metnin tamamı", "gorseller": ["gorsel1.jpg"] }
```
Gereken: Python 3, Pillow, numpy, ffmpeg. API anahtarı gerekmez (ses ElevenLabs bağlantısından gelir).
