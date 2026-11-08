# 🦊 Fox Bülten — günlük oyun haberi → YouTube Shorts

Her sabah oyun haberlerini tarayan, seçtiğin haberi TV haber kanalı temalı, 1080×1920 Türkçe bir Shorts
videosuna çeviren hat. Sunucu, haber masasında oturan insansı, erkeksi "gamer" bir spiker tilki: kızıl kürk, geniş çene ve yanak tüyleri,
kalın düz kaşlar, dar ve ağır kapaklı kehribar gözler, sivri saç (bir tutamı camgöbeği), kalın boyun, geniş omuzlar,
lacivert blazer altında e-spor forması, RGB'li mikrofonlu oyuncu kulaklığı, parmaksız eldivenler.
Sahnede alt bant (SON DAKİKA + manşet), kayan haber bandı, görüntü ekranı ve spiker penceresi, bilgi grafikleri ve
"SİZE SORUYORUZ" kapanışı var. YouTube'a yükleme kararı her zaman sende.

```
08:48 TSİ  zamanlanmış görev → yeni Claude oturumu → araştırma + bülten (5–10 haber) → ≈09:00 telefonuna bildirim
sen        "3" yazarsın
Claude     haberi doğrular → 3–4 görsel bulur/doğrular → senaryo → ElevenLabs sesi → animasyon → kontrol
           → MP4 + Shorts başlığı + YouTube açıklaması (kaynaklarla) gönderir
```

## Kurulum

| Ne | Durum | Ne yapmalı |
|---|---|---|
| Zamanlama | ✅ Her gün 08:48'de araştırma başlar, ≈ 09:00 bildirim (Europe/Istanbul) | Değiştirmek için Claude'a "bülten saatini 10:00 yap" yazman yeterli. |
| Video üretimi | ✅ Container'da hazır (ffmpeg + Chromium/Playwright + Python) | Ek hizmet gerekmez. |
| ElevenLabs sesi | ✅ Anahtar Default ortamına kaydedildi · ⚠ ücretli plan + STT izni bekleniyor | Aşağıdaki **A**. |
| Görseller | ✅ Her videoda kullanıcıdan bildirimle istenir | İsteğe bağlı otomatik arama için **C**. |
| Haber/görsel sitelerine erişim | ⚠ Ortamın ağı kısıtlı | Aşağıdaki **D**. |

**A. ElevenLabs API anahtarı (önerilen, tam otomatik ve kelime düzeyinde zaman damgalı).**
elevenlabs.io → Profile → API Keys → yeni anahtar (Text to Speech + Speech to Text izinli).
Claude'a "ElevenLabs anahtarını ekleyelim" yaz. Güvenli bir form açılır ve anahtar ortamın *network secrets*
kısmına `api.elevenlabs.io` / `xi-api-key` olarak kaydedilir. Anahtar sohbete yazılmaz.
Tilkinin sesi `ayarlar.json` içinde sabittir: **Hasan – Energetic, Expressive, Playful**
(`TA7RCSTD5b2z14h1TDTX`, `eleven_v4`, seed 1907). API ses kütüphanesi sesini kabul etmezse
ElevenLabs'te Voice Library → Hasan → "Add to my voices" yap.
- **Plan:** Ücretsiz plan API'de kütüphane seslerini (Hasan) kullandırmaz (402), ticari lisans vermez ve ayda
  ~10 videoluk kredi verir. En düşük ücretli plan (Starter) yeterlidir. Hazır sesler (ör. Liam) ücretsiz planda da çalışır.
- **Anahtar izinleri:** Text to Speech (zorunlu), Speech to Text (telaffuz kontrolü için), Voices Read (isteğe bağlı).

**B. ElevenLabs bağlayıcısı (hesabında bağlı).** Claude sesi bağlayıcıyla üretebilir, ama dosyayı montaja
almak için ortamın `elevenlabsusercontent.com` adresine erişebilmesi gerekir (bkz. D). Bu yolda zaman
damgası yoktur. Kelime zamanlaması ses dalgasından tahmin edilir (Türkçede her hecede bir ünlü olduğundan
oldukça iyi sonuç verir).

**C. Google Görseller (Serper.dev).** Google'ın kendi Custom Search JSON API'si yeni müşterilere kapalı ve
1 Ocak 2027'de kapanıyor. Bu yüzden Google Görseller sonuçlarını döndüren Serper kullanılır
(serper.dev, ücretsiz 2.500 sorgu). Anahtarı Claude'a "Serper anahtarını ekleyelim" diyerek
`google.serper.dev` / `X-API-KEY` olarak kaydet. Anahtar yoksa Claude yine resmî basın kitleri ve Steam
mağaza ekran görüntüleriyle çalışır, ama arama "Google Görseller" üzerinden yapılmamış olur.

**D. Ağ izni.** Bulut ortamı varsayılan olarak yalnızca paket depolarına çıkabilir. Görselin özgün sayfasını
açıp doğrulamak ve görseli indirmek için şu hostlara izin gerekir: ortam menüsü → **Edit → Network access →
Allowed domains** (adımlar: https://code.claude.com/docs/en/cloud-environments#network-access) ya da
Claude'a "ağ izinlerini ekle" yaz, onay kartı çıkar.
Önerilen başlangıç listesi: `elevenlabsusercontent.com`, `store.steampowered.com`, `api.steampowered.com`,
`shared.akamai.steamstatic.com`, `clan.akamai.steamstatic.com`, `www.rockstargames.com`,
`media-rockstargames-com.akamaized.net`, `blog.playstation.com`, `news.xbox.com`, `www.nintendo.com`,
`assets.nintendo.com`, `playvalorant.com`, `www.leagueoflegends.com`, `cmsassets.rgpub.io`,
`www.pathofexile.com`, `www.ea.com`, `www.callofduty.com`. Görseller her gün farklı sitelerden
gelebildiği için listede olmayan bir kaynak gerektiğinde Claude onay ister.

## Video üretimi (kullanıcı numara yazınca)

1. **Doğrula.** Seçilen haberi kaynağından (tercihen geliştirici duyurusu/resmî yama notu) aç; tarih, sürüm,
   sayı ve adları kontrol et. Bölüm klasörü: `bolumler/YYYY-MM-DD-kisa-ad/`.
2. **Görseller (3–4 adet), kullanıcıdan istenir.** Haberi doğruladıktan sonra hangi görsellerin gerektiğini çıkar
   (ör. genel görünüm, ayrıntının yakın planı, oyun içi kullanım). Her biri için öneri ve resmî kaynak ver: basın
   kiti, resmî site, Steam mağaza sayfası, Newswire galerisi. Sonra **PushNotification** ile kullanıcıya bildirim gönder,
   ör. "🦊 GTA VI videosu için 3 görsel gönder: kapak, araç yakın planı, harita". Aynı listeyi mesajda da yaz ve
   görseller gelene kadar bekle.
   Gelen her görseli Read ile **gözle kontrol et**: doğru oyun, sürüm ve platform mu? Eski bir yazı ("COMING 2025",
   "Xbox One" gibi) var mı? Resmî mi? Çözünürlüğü yeterli mi? Sorunluysa nedenini söyle; kırpılarak kurtarılıyorsa
   kırp, değilse yenisini iste ya da kullanıcı onaylarsa o sahneyi bilgi grafiğiyle anlat. Kullanılacakları
   kaydet: `python3 gorsel.py ekle <bolum> <anahtar> <dosya> --sahip "…" --sayfa "<özgün sayfa>" --lisans "…"
   --aciklama "…" [--kirp x0,y0,x1,y1] --resmi`. Vurgulanacak ayrıntının kutusunu (0–1 oranlarıyla) belirle.
   Serper anahtarı ortama eklenirse `python3 gorsel.py ara "…"` ile Google Görseller'den aday da önerebilirsin;
   ağ izni varsa `gorsel.py indir` doğrudan indirir.
3. **Senaryo** (`senaryo.json`, biçim aşağıda). Hedef 40–55 sn (seslendirilen metin ≈ 560–780 karakter;
   `--metin` tahmini gösterir), 5–7 sahne. İngilizce oyun/şirket adlarını **yazıldığı gibi** bırak; ses modeli
   (eleven_v4) onları doğru okur. Türkçe harflerle yeniden yazma ("Ekboks" yanlış okunuyordu).
   `telaffuz.json` yalnızca özel istekler içindir: **GTA → "Geta"**, GTA 6 → **"Geta Altı"** (büyük A ile tek ad gibi
   okunur; "Geta altı" arada 0,2 sn duruyordu), GB → gigabayt, PS5 → PlayStation 5. Bir adda bekleme duyulursa
   yazım varyantlarını zaman damgalı TTS ile deneyip en kısa boşluklu olanı seç.
   **Oyun adından hemen sonra ad tamlaması kurabilecek bir isim koyma.** "GTA 6 diskinde" bitişik okununca
   "6 diskte" gibi anlaşılıyordu. Ya cümleyi değiştir ("GTA 6, senden … disk alanı istiyor") ya da addan sonra
   virgül koy. Virgül 0,18 sn'lik kısa bir ayrım bırakır, noktalamasız boşluk 0,08 sn'ye kırpılır. İlk sahne
   ilk iki saniyede en çarpıcı somut ayrıntıyı söylesin. Her görsel, tilki tam o ayrıntıdan söz ederken açılsın
   (`tetik`). Son sahne `"duzen": "kapanis"`: habere özgü, kolay yanıtlanır tek soru. Yeni oyun/karakter adlarını
   `telaffuz` alanına ekle (ör. `"Lucia": "Luçiya"`).
4. **Süre tahmini ve metin:** `python3 uret.py <bolum>/senaryo.json --metin`.
5. **Ses.** API anahtarı varsa doğrudan 6. adım (sesler `ses/` altında önbelleğe alınır). Bağlayıcı yolunda her
   sahne için `ses/metinler.json`'daki metni `creative_generate_speech` ile (ses: Hasan, model `eleven_v4`)
   üret, `content_url`'i indir ve `python3 uret.py <bolum>/senaryo.json --ses-ekle <sahne> <dosya.mp3>` ile kaydet.
6. **Dinleme kontrolü (otomatik):** `uret.py` her sahne sesini ElevenLabs Speech-to-Text ile yazıya döker ve
   senaryodaki metinle kelime kelime karşılaştırır. "gigabayt diyor" → "gidiyor" gibi yutulan ya da birleşen
   kelimeler `rapor.json` uyarılarına "beklenen … / duyulan …" olarak düşer; o cümleyi değiştirip yalnızca o sahneyi
   yeniden üret. Anahtarda Speech to Text izni yoksa kontrol atlanır ve uyarı verilir.
   **Telaffuz kontrolü:** `python3 uret.py <bolum>/senaryo.json --telaffuz` (ElevenLabs Speech-to-Text). ✗ çıkan adı
   `telaffuz` sözlüğünde yeniden yaz ve yalnızca o sahneyi yeniden seslendir (dosyayı sil, 7. adım yeniden üretir).
   Bağlayıcı yolunda `creative_transcribe_audio` ile aynı kontrolü yap.
7. **Üret:** `python3 uret.py <bolum>/senaryo.json` → `cikti/tilki-<bolum>.mp4`, `.srt`, `youtube.txt`,
   `kontrol.jpg`, `rapor.json`.
8. **Kontrol et.** Çıktıdaki **ölçülen süre** 60 sn'yi geçerse betik 3 koduyla çıkar: metni kısalt, 5–7'yi tekrarla
   (değişmeyen sahnelerin sesi önbellekten gelir). `kontrol.jpg`'yi Read ile aç: görsel doğru anda mı, vurgulanan
   ayrıntı kadrajda mı, altyazı görselin üstüne biniyor mu? `rapor.json`'daki uyarıları gider.
9. **Kapak.** Üretimin sonunda `cikti/kapak-dikey.jpg` (1080×1920, Shorts kapağı) ve `cikti/kapak-yatay.jpg`
   (1280×720, kanal/arama) otomatik çıkar. Spiker yüksek çözünürlükte, şaşkın ifadeyle yazıyı işaret ederken çizilir;
   arka plan bölümün resmî görselidir. Yazılar senaryodaki `"kapak": {"buyuk", "orta", "alt", "gorsel", "ifade"}`
   alanından gelir (yoksa ilk `ekran` + manşet). Yalnızca kapağı yenilemek için: `uret.py <senaryo> --kapak`.
   Kapak yazısı videoda gerçekten söylenen, doğrulanmış bir bilgi olsun (tık tuzağı olmasın).
10. **Teslim.** MP4'ü ve iki kapağı SendUserFile ile gönder. Mesaja kısa Shorts başlığını ve `youtube.txt` içeriğini (haber kaynağı,
   görsellerin özgün sayfaları ve hak sahipleri) yaz. `senaryo.json` + `kaynaklar.json` dosyalarını commit'le
   (görsel, ses ve video dosyaları commit'lenmez). **YouTube'a yükleme yapma.**

Seslendirme ayarı (`ayarlar.json`): model `eleven_v4` (İngilizce kelimeleri en doğal okuyan model; kullanıcı
4 örnek arasından seçti), hız 1,2 (API üst sınırı), stability 0,5, style 0,25. `ses_kirpma` her sahnenin baş/son
sessizliğini kırpar, noktalamalı yerlerdeki duraklamaları en fazla 0,18 sn'ye, noktalamasız kelime aralarını
en fazla 0,08 sn'ye indirir (yalnızca zaman damgasına göre iki kelimenin arasına düşen sessizlikler kesilir). `tempo` her sahneyi ses perdesini
koruyarak saniyede ~6 heceye hızlandırır (en fazla ×1,3). Model tek başına saniyede 3–4,5 hecede kalıp kelimeleri
uzatıyordu. Hizalama ve dudak senkronu birlikte kaydırılır.

`--onizleme` yerel espeak-ng sesiyle taslak üretir (robotik ses, sağ üstte "ÖNİZLEME" etiketi). Yalnızca
animasyon ve zamanlamayı denemek içindir, yayına uygun değildir.

## Senaryo biçimi

```json
{
  "baslik": "GTA VI ön yükleme 10 Kasım",
  "oyun": "GTA VI",
  "tarih": "8 KASIM 2026",
  "manset": "GTA VI ön yükleme 10 Kasım'da",
  "kayan": ["Bültendeki diğer başlıklar", "…"],
  "haber": {"baslik": "…", "kaynak": "https://resmi-duyuru", "kaynak_adi": "Rockstar Newswire", "tarih": "7 Kasım 2026",
            "ek_kaynaklar": ["https://…"]},
  "telaffuz": {"Lucia": "Luçiya"},
  "sahneler": [
    {"metin": "GTA 6 için diskinde iki yüz on iki gigabayt yer aç!", "ekran": "212 GB!", "ifade": "saskin",
     "espri": {"tip": "emoji", "emoji": "💾", "metin": "212 GB?!"}},
    {"metin": "Rockstar ön yüklemeyi iki gün öne çekti…", "gorsel": "duyuru", "tetik": "ön yüklemeyi",
     "ekran": "10 Kasım", "etiket": "RESMİ DUYURU"},
    {"metin": "… Grotti Cheetah'a bakın …", "gorsel": "cheetah", "tetik": "Grotti", "odak": [0.6, 0.5],
     "vurgu": {"kutu": [0.55, 0.40, 0.30, 0.25], "tetik": "farlar", "yakinlik": 1.4, "yazi": "Gerçek araç!"}},
    {"metin": "PS5'te 10 Kasım gece yarısı…", "tetik": "PS5'te", "ekran": "Ön yükleme 10 Kasım'da",
     "grafik": {"tip": "liste", "etiket": "Ön yükleme", "baslik": "10 Kasım · Türkiye saatiyle",
                "satirlar": [["PS5", "10 Kasım · 00:00"], ["Xbox Series X|S", "10 Kasım · 03:00"]], "not": "Kaynak: …"}},
    {"metin": "Sen ilk gece mi indireceksin? Yorumlara yaz!", "duzen": "kapanis", "ifade": "heyecan", "espri": "soru"}
  ],
  "youtube": {"baslik": "GTA 6 kaç GB? 🦊 #shorts", "aciklama": "…", "etiketler": ["gta6", "oyunhaberleri", "shorts"]}
}
```

- `metin`: hem seslendirilir hem altyazı olur (1–2 kısa cümle). Sayıları ekranda rakamla göstermek istiyorsan
  `ekran`a rakam yaz, `metin`de okunuşunu yaz.
- `gorsel` + `tetik`: görsel, tetik kelimesi söylendiği anda açılır. Tilki köşe kamerasına geçer.
  `odak`: dikey kırpmada merkezde tutulacak nokta. `vurgu.kutu` [x, y, g, y] görselin 0–1 oranlarıyla verilir.
  Kutu yakınlaştırılır, çevresi karartılır ve sarı çerçeveyle işaretlenir. Kutu her zaman kadrajda kalır.
- `grafik`: fotoğraf yerine (ya da yanında) yayın tarzı bilgi grafiği. `tip: "liste"` satırları (ilk sütun altın
  renkli), `tip: "sayi"` büyük sayı (sayacı sayarak gelir) + `alt` + isteğe bağlı satırlar. `etiket`, `baslik`, `not`.
  Rakamları yalnızca doğrulanmış kaynaktan yaz; görselin yerine sahte bir fotoğraf koyma.
- `manset`: alt banttaki kalıcı başlık (kısa tut). `kayan`: alttaki kayan bantta dönen başlıklar (bültenin diğer
  maddeleri). `tarih`: üst köşedeki tarih. `ust_etiket`: varsayılan "SON DAKİKA".
- `ifade`: normal · heyecan · saskin · supheli · uzgun · gulme · dusunme · ciddi.
  `jest`: anlat (stüdyo sahnelerinde varsayılan) · basparmak · isaret · omuz · salla.
  `espri`: emoji (`emoji`, `metin`) · unlem · soru · ter · yildiz · kalp · konfeti · gozluk · patlama (`metin`).
  İsteğe bağlı `tetik` alır.
- `duzen`: studyo (varsayılan) · gorsel (gorsel verilince) · kapanis (son sahne, kameraya yakın plan + soru balonu).

## Ekran yerleşimi (1080×1920)

Kanal logosu + CANLI + tarih 48–132 · görüntü/grafik ekranı 150–930 · spiker penceresi ve künye 944–1166 ·
alt bant 1188–1316 · altyazı merkezi 1420 (x 80–900) · kayan bant 1522–1574. Hepsi Shorts'un sağdaki
düğmelerinden ve alttaki başlık alanından uzak tutulur.

## Dosyalar

- `uret.py`: seslendirme (ElevenLabs API, bağlayıcı dosyası veya önizleme), hizalama, ağız senkronu (Türkçe ünlü
  tabanlı visemler + ses genliği), altyazı, efekt sesleri, render, montaj (-14 LUFS), süre/kalite kontrolü.
- `render/tilki.js`: spiker tilki, haber stüdyosu, yayın grafikleri, görüntü ekranı + vurgu, bilgi grafikleri,
  espriler, altyazı. Kareler durumsuz çizilir,
  Chromium'da paralel render edilir (`render/kaydet.mjs`).
- `gorsel.py`: Google Görseller (Serper) araması, Steam resmî ekran görüntüleri, indirme ve kaynak kaydı.
- `ayarlar.json`: tilkinin sesi, süre hedefleri. `telaffuz.json`: tüm bölümlerde ortak telaffuz sözlüğü.
- `BULTEN.md`: günlük bülten talimatı. `bultenler/`: gönderilen bültenler. `bolumler/`: bölüm senaryoları.
