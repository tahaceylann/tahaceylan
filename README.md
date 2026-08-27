# Patron Ol! – İş İmparatorluğu Tycoon 🏙️

iPhone (ve her modern tarayıcı) için kapsamlı bir **tycoon / idle** oyunu.
Küçük bir simit arabasıyla başlayıp Uzay Şirketi'ne kadar 14 farklı işletme
işletiyor, yönetici tutup otomasyona geçiyor, prestij yaparak kalıcı
bonuslar kazanıyor ve başarımları tamamlıyorsun.

Tamamen **vanilla HTML/CSS/JS** ile yazıldı — build aracı, framework veya
harici bağımlılık yok. Bir PWA (Progressive Web App) olarak paketlendi,
yani iPhone'da Safari'den açıp **Paylaş → Ana Ekrana Ekle** ile gerçek bir
uygulama gibi kurulabilir; internetsiz de çalışır.

## Özellikler

- **14 işletme**: Simit Arabası → Kahveci → Fırın → Restoran → Kuaför
  Zinciri → Market Zinciri → Otel → İnşaat Firması → AVM → Fabrika → Banka
  → Teknoloji Şirketi → Gökdelen İmparatorluğu → Uzay Şirketi. Her biri
  öncekinin en az 1 adedi alınınca kilidini açıyor.
- **1x / 10x / 100x / Maks** toplu satın alma.
- **Yöneticiler**: bir işletmeye yönetici atarsan elle dokunmana gerek
  kalmadan sürekli üretim yapar; atamazsan üretim tamamlandığında dokunup
  tahsil etmen gerekir (klasik idle-tycoon mekaniği).
- **x2 kilometre taşı yükseltmeleri** (10/25/50/100/200/300/500/750/1000
  adet eşiklerinde).
- **Prestij ("Yeniden Yapılanma")**: her şeyi sıfırla, kalıcı
  **İmparatorluk Puanı** kazan → her puan tüm gelire kalıcı %2 ekler.
- **6 kalıcı yatırım (perk)**: İmparatorluk Puanı harcayarak gelir,
  maliyet indirimi, üretim hızı, yönetici indirimi, bonus şansı ve offline
  kazanç süresi/verimini kalıcı olarak artır.
- **20 başarım**, her biri tamamlandığında kalıcı %1 gelir bonusu katar.
- **Rastgele bonus ödülü**: ekranda beliren 🎁'i yakala, ya anlık nakit ya
  da 60 saniyelik 2x gelir kazan.
- **Offline kazanç**: uygulamayı kapatıp geri döndüğünde, yöneticili
  işletmelerin sende yokken kazandırdığı parayı bir açılış ekranıyla
  gösterir ve hesaba yatırır.
- **Kayıt**: `localStorage` ile otomatik kayıt (5 saniyede bir + sekme
  kapanışında). Ayarlar sekmesinden yedek dışa/içe aktarma ve sıfırlama.
- **Ses & animasyon**: WebAudio ile üretilen efektler (harici ses dosyası
  yok), açılıp kapatılabilir.
- **iOS'a özel arayüz**: alt sekme çubuğu, çentik/güvenli alan desteği,
  açık/koyu tema, "Ana Ekrana Ekle" önerisi banner'ı.

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
bir işletme eklemek için `BUSINESSES` dizisine yeni bir satır eklemen
yeterli — kilit açma sırası dizideki konuma göre otomatik işler.

## Gizlilik

Oyun tamamen tarayıcıda çalışır. Hiçbir veri bir sunucuya gönderilmez;
ilerleme yalnızca cihazının `localStorage`'ında tutulur.
