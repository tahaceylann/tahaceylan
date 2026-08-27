# Fenomen Ol! – İçerik İmparatorluğu 🔥

iPhone (ve her modern tarayıcı) için kapsamlı bir **tycoon / idle** oyunu.
Telefonda çektiğin ilk vlogdan küresel bir medya imparatorluğuna kadar 14
farklı içerik platformu işletiyor, menajer tutup otomasyona geçiyor,
viral olup kalıcı bonuslar kazanıyor ve başarımları tamamlıyorsun.

Konu ve görsel dil, güncel **içerik üreticisi / influencer ekonomisi**
trendinden ilham alıyor (Tuber Simulator, Vlogger Go Viral gibi türün en
popüler oyunlarının damarında) — canlı pembe→mor gradyanlı, sosyal medya
hissiyatlı bir arayüzle.

Tamamen **vanilla HTML/CSS/JS** ile yazıldı — build aracı, framework veya
harici bağımlılık yok. Bir PWA (Progressive Web App) olarak paketlendi,
yani iPhone'da Safari'den açıp **Paylaş → Ana Ekrana Ekle** ile gerçek bir
uygulama gibi kurulabilir; internetsiz de çalışır.

## Özellikler

- **14 içerik platformu**: Telefon Vlogları → Kısa Video Kanalı →
  Instagram Sayfası → Canlı Yayın Kanalı → YouTube Kanalı → Podcast
  Stüdyosu → Kendi Markan (Merch) → İçerik Ajansı (MCN) → Reklam Ajansı →
  Prodüksiyon Stüdyosu → Dijital TV Kanalı → Sosyal Medya Uygulaması →
  Yapay Zeka İçerik Stüdyosu → Küresel Medya İmparatorluğu. Her biri
  öncekinin en az 1 adedi alınınca kilidini açıyor.
- **1x / 10x / 100x / Maks** toplu satın alma.
- **Menajerler**: bir kanala menajer atarsan elle dokunmana gerek kalmadan
  sürekli üretim yapar; atamazsan üretim tamamlandığında dokunup tahsil
  etmen gerekir (klasik idle-tycoon mekaniği).
- **x2 viral an yükseltmeleri** (10/25/50/100/200/300/500/750/1000 adet
  eşiklerinde).
- **Prestij ("Yeniden Viral Ol!")**: her şeyi sıfırla, kalıcı **Etki
  Puanı** kazan → her puan tüm gelire kalıcı %2 ekler.
- **6 kalıcı avantaj**: Etki Puanı harcayarak gelir, kurulum maliyeti,
  üretim hızı, menajer indirimi, trend şansı ve offline kazanç
  süresi/verimini kalıcı olarak artır.
- **20 başarım**, her biri tamamlandığında kalıcı %1 gelir bonusu katar.
- **Rastgele trend anı**: ekranda beliren 🔥'i yakala, ya anlık nakit ya
  da 60 saniyelik 2x gelir kazan.
- **Mağaza sekmesi** — hepsi normal oyun içi nakit (₺) ile satın alınır:
  - 📈 **Sponsorlu İçerik Patlaması**: tekrar tekrar alınabilen, 1 saatliğine
    geliri 2 katına çıkaran bir boost. Fiyatı o anki otomatik gelire göre
    ölçeklenir, üst üste alınırsa süresi birikir.
  - 🍀 **Trend Radarı**: 5 kademeli, bonus trend anının ekranda ne sıklıkla
    belireceğini artıran kalıcı bir yükseltme.
  - ⚡ **Anında Yayınla**: menajersiz kanallarından o an hazır (üretimi
    tamamlanmış) olanların tümünü tek dokunuşla toplar.
  - ✅ **Hesap rozetleri**: kalıcı, kozmetik unvanlar (Çaylak İçerik
    Üretici → Doğrulanmış Hesap → Viral Fenomen → Efsane Yaratıcı), üst
    bilgi çubuğunda gösterilir.
  - 🎨 **Profil temaları**: 5 farklı kalıcı renk teması (Klasik, Altın Çağ,
    Neon Gece, Okyanus, Ateş) — dilediğin an aralarında geçiş yapabilirsin.
- **Zengin animasyonlar**: konfeti/parçacık patlamaları (başarım, prestij,
  viral yükseltme, mağaza satın alımları), büyük rakamlarda "sayma" efekti
  (offline kazanç ve prestij modalları), kasa nabız efekti, roket fırlatma
  animasyonu — hepsi `prefers-reduced-motion` tercihine ve Ayarlar'daki
  animasyon anahtarına saygılı.
- **Offline kazanç**: uygulamayı kapatıp geri döndüğünde, menajerli
  kanalların sende yokken kazandırdığı parayı bir açılış ekranıyla
  gösterir ve hesaba yatırır.
- **Kayıt**: `localStorage` ile otomatik kayıt (5 saniyede bir + sekme
  kapanışında). Ayarlar sekmesinden yedek dışa/içe aktarma ve sıfırlama.
- **Ses & animasyon**: WebAudio ile üretilen efektler (harici ses dosyası
  yok), açılıp kapatılabilir.
- **iOS'a özel arayüz**: alt sekme çubuğu, çentik/güvenli alan desteği,
  açık/koyu tema, "Ana Ekrana Ekle" önerisi banner'ı, canlı pembe→mor
  gradyanlı sosyal medya estetiği.

## Dosya yapısı

```
index.html        Uygulama iskeleti (sekmeler, üst bar, modallar)
style.css         Tüm görünüm (iOS tarzı, açık/koyu tema)
app.js            Tüm oyun mantığı: veri, durum, kayıt, oyun döngüsü, arayüz
manifest.json     PWA manifesti (isim, ikonlar, tema rengi)
sw.js             Service worker (offline çalışma için önbellekleme)
icons/            Uygulama ikonları (512/192/180/32/16 px, script ile üretildi)
scripts/gen_icons.py  İkonları üreten Python betiği (yalnızca stdlib kullanır)
```

## Yerelde çalıştırma

Herhangi bir statik dosya sunucusu yeterli, örnek:

```bash
python3 -m http.server 8080
# sonra tarayıcıda http://localhost:8080 aç
```

iPhone'da denemek için: bilgisayar ve telefon aynı Wi-Fi'de olsun,
`http://<bilgisayarının-IP-adresi>:8080` adresini Safari'de aç. Gerçek bir
"Ana Ekrana Ekle" + service worker deneyimi için siteyi HTTPS ile (ör.
GitHub Pages, Netlify, Vercel) yayınlaman gerekir — service worker'lar
`http://localhost` dışında yalnızca HTTPS üzerinde çalışır.

## GitHub Pages ile yayınlama (opsiyonel)

1. Bu depoyu GitHub'a it.
2. Repo ayarlarından **Settings → Pages** → Source: `main` dalı, `/ (root)`.
3. Birkaç dakika içinde `https://<kullanıcı-adın>.github.io/<repo-adı>/`
   adresinden erişilebilir olur; bu adresi iPhone Safari'de açıp ana ekrana
   ekleyebilirsin.

## Dengelemeyi ayarlamak

Tüm oyun ekonomisi `app.js` dosyasının en üstündeki **"AYARLANABİLİR OYUN
VERİLERİ"** bölümünde tek yerde toplanmıştır: `BUSINESSES`, `PERKS`,
`ACHIEVEMENTS`, `MILESTONE_THRESHOLDS`, `GROWTH`, `PRESTIGE_DIVISOR`. Yeni
bir içerik platformu eklemek için `BUSINESSES` dizisine yeni bir satır
eklemen yeterli — kilit açma sırası dizideki konuma göre otomatik işler.

## Kayıt güvenliği — ilerleme asla sıfırlanmaz

`app.js`'teki `SAVE_KEY` ve mevcut business/perk/rozet/tema id'leri kalıcı
bir sözleşmedir: bunlar hiçbir güncellemede değiştirilmez. Yeni özellikler
her zaman `freshState()`'e **eklenerek** tanıtılır; `loadState()` eski bir
kayıtta bulunmayan alanları otomatik olarak güvenli varsayılanla doldurur,
mevcut hiçbir veriyi silmez. Bu, oyunu güncellersen bile (yeni işletme,
başarım, mağaza öğesi eklense dahi) oyuncunun nakit/kanal/prestij/başarım
ilerlemesinin korunacağı anlamına gelir. Tek istisna, Ayarlar sekmesindeki
**"Oyunu Sıfırla"** butonudur — bu tamamen kullanıcının kendi tercihiyle,
iki onay adımından geçerek tetiklenir.

## Gizlilik

Oyun tamamen tarayıcıda çalışır. Hiçbir veri bir sunucuya gönderilmez;
ilerleme yalnızca cihazının `localStorage`'ında tutulur.
