# Günlük Video Otomasyonu (ElevenLabs)

Her gün Claude'a yazdığında çalışan, **senaryo → ElevenLabs seslendirme → dikey
(1080×1920) MP4** üreten küçük bir hat. Zamanlayıcı yok: tetikleyici sensin.

## Günlük akış

1. Claude'a yaz, ör. **"Bugünün videosu: kahvenin tarihi"** (konu vermezsen
   Claude bir konu önerir).
2. Claude senaryoyu yazar → `video-otomasyon/gunler/YYYY-MM-DD.json`
3. Claude çalıştırır:
   ```bash
   python3 video-otomasyon/olustur.py video-otomasyon/gunler/YYYY-MM-DD.json
   ```
4. Çıktılar: `video-otomasyon/cikti/YYYY-MM-DD.mp4` + `.srt` altyazı + paylaşım
   metni. Claude videoyu sana dosya olarak gönderir; senaryo repoya commit'lenir
   (videolar büyük olduğu için commit'lenmez).

ElevenLabs'e gitmeden görüntüyü denemek için: `--onizleme` (sessiz, süre tahmini).

## Kurulum (tek seferlik)

- `ELEVENLABS_API_KEY` ortam değişkeni (Claude bulut ortamında: ortam ayarları →
  Edit → Network secrets / environment variables).
- Ağ erişimi: `api.elevenlabs.io` alan adına izin verilmeli.
- İsteğe bağlı `ELEVENLABS_VOICE_ID` (yoksa hazır "Adam" sesi kullanılır).
- Python 3.9+ ve ffmpeg. Başka bağımlılık yok.

## Senaryo biçimi

```json
{
  "baslik": "Kısa kanal/seri adı (üstte görünür)",
  "ses": { "voice_id": "opsiyonel", "model_id": "eleven_multilingual_v2", "dil": "tr",
           "stability": 0.45, "similarity_boost": 0.8, "style": 0.25 },
  "sahneler": [
    { "ekran": "Ekrandaki büyük yazı", "anlatim": "Seslendirilecek cümleler." }
  ],
  "aciklama": "Paylaşım metni + hashtag'ler"
}
```

- Her sahnenin süresi, o sahnenin ses uzunluğuna göre otomatik ayarlanır.
- Aynı metin + ses ayarı tekrar üretilmez (`.onbellek/`), yani düzeltme
  yaparken sadece değişen sahneler için ElevenLabs kredisi harcanır.
