# Trend Sticker — WhatsApp için Türkçe Sticker Uygulaması (iOS)

Bu klasör, kullanıcıların **WhatsApp**'ta kullanabileceği, "trend" Türkçe
sohbet ifadelerinden oluşan **iki sticker paketini** doğrudan WhatsApp'ın
sticker tepsisine ekleyen, bağımsız bir **iOS** uygulamasıdır.

> 43 sticker'ın tamamı bu proje için **özgün olarak üretildi** (Python/Pillow
> ile programatik olarak çizildi). İnternette dolaşan telifli meme/karakter
> görselleri kopyalanmadı — bunun yerine, popüler Türkçe sohbet kalıplarını
> ("Yok Artık", "Süpersin", "Tamamdır Kanka" vb.) renkli, okunaklı rozet
> tasarımlarına dönüştürdüm. İstersen kendi görsellerinle kolayca
> değiştirebilirsin (aşağıya bakın).

## Uygulama neler yapar?

- **Günlük Sözler** paketi: 22 statik (PNG) sticker — "Süpersin", "Yok Artık",
  "Aşkım", "Selam" gibi günlük tepki ifadeleri.
- **Hareketli Sticker'lar** paketi: 21 hafifçe zıplayan/animasyonlu (WebP)
  sticker — "Tamamdır Kanka", "Sana Geliyorum", "Sen Benim Kahramanımsın" gibi
  daha "trend"/enerjik ifadeler.
- Kullanıcı bir paketi açıp **"WhatsApp'a Ekle"** butonuna bastığında,
  uygulama sticker verisini `UIPasteboard` üzerinden WhatsApp'a aktarır ve
  `whatsapp://stickerPack` URL şemasıyla WhatsApp'ı açar; WhatsApp kullanıcıya
  paketi sticker tepsisine ekleme onayı sorar.
- Bu, WhatsApp'ın **resmi** entegrasyon yöntemidir (App Extension değil,
  pasteboard + URL scheme). Bkz. [WhatsApp/stickers](https://github.com/WhatsApp/stickers/tree/main/iOS)
  resmi örnek deposu — bu proje o örneğin üzerine kurulmuştur (BSD lisanslı,
  Meta Platforms, Inc.), UI metinleri Türkçeleştirilmiş, marka/isim
  değiştirilmiş ve tüm sticker içerikleri sıfırdan üretilmiştir.

## Neden native bir iOS uygulaması gerekiyor?

WhatsApp'a "gerçek" sticker paketi eklemek yalnızca native bir uygulama
(veya bir web sayfasının açtığı native bir uygulama) ile mümkündür — bir PWA
veya salt web sayfası bunu yapamaz, çünkü paylaşım `UIPasteboard` + özel URL
şeması üzerinden çalışır ve bu yalnızca kurulu bir iOS uygulamasından
tetiklenebilir.

## Gereksinimler (build almak için)

- **macOS + Xcode** (15 veya üzeri önerilir). Bu proje Linux/bulut ortamında
  **derlenemez/test edilemez** — Xcode ve iOS SDK gerektirir.
- Sticker'ları gerçek WhatsApp ile test etmek için **fiziksel bir iPhone**
  (Simulator'da WhatsApp kurulu olmadığı için gerçek entegrasyon test
  edilemez) ve cihazda kurulu WhatsApp uygulaması.
- Ücretsiz bir Apple Geliştirici hesabı (App Store'a yüklemeden, sadece
  kendi cihazınıza kurup denemek için yeterlidir).

> ⚠️ Projede `WebP.framework` adında eski tip (xcframework olmayan) bir
> statik framework bulunuyor (resmi WhatsApp örneğinden). Bu framework
> **gerçek cihaz (arm64)** ve **Intel Simulator (x86_64)** slice'larını
> içeriyor ama **Apple Silicon Simulator (arm64-sim)** slice'ı içermiyor.
> Bu yüzden M1/M2/M3 Mac'lerde **Simulator'da derlemeye çalışırsanız hata
> alabilirsiniz** — bunun yerine doğrudan gerçek bir iPhone'a bağlanıp orada
> çalıştırın (zaten WhatsApp testi için gerçek cihaz gerekiyor).

## Nasıl açılır ve çalıştırılır?

1. `WAStickersThirdParty.xcodeproj` dosyasını Xcode ile açın.
2. Sol panelden proje köküne (`WAStickersThirdParty`) tıklayın →
   **Signing & Capabilities**:
   - **Team** alanına kendi Apple ID / geliştirici hesabınızı seçin.
   - **Bundle Identifier** `com.tahaceylan.trendsticker` olarak ayarlı;
     isterseniz kendi benzersiz kimliğinizle değiştirin (WhatsApp örneğinin
     varsayılan `WA.WAStickersThirdParty` kimliğini **kullanmayın** — kod bunu
     bilerek reddediyor).
3. Üstte cihaz seçiciden **gerçek iPhone'unuzu** seçin (Simulator değil).
4. ▶️ **Run** ile uygulamayı cihazınıza kurun.
5. Uygulamayı açın → bir paketi seçin → **"WhatsApp'a Ekle"** butonuna basın
   → WhatsApp açılıp paketi tepsiye eklemenizi soracak.

## Kendi sticker'larınızı eklemek isterseniz

`WAStickersThirdParty/` klasöründeki PNG/WebP dosyalarını (aynı isimlerle
veya yeni isimlerle) kendi görsellerinizle değiştirin, ardından
`sticker_packs.wasticker` dosyasındaki `image_file`, `name`, `publisher`,
`emojis`, `accessibility_text` alanlarını güncelleyin. Kurallar:

- Statik sticker: **512×512 PNG**, en fazla **100 KB**.
- Animasyonlu sticker: **512×512 WebP**, en fazla **500 KB**, kare süresi
  en az 8ms, toplam animasyon süresi en fazla 10 saniye, **ilk kare** sticker'ın
  tam/bitmiş halini göstermeli (WhatsApp döngüyü ilk karede bitirir).
- Tepsi (tray) ikonu: **96×96 PNG**, en fazla 50 KB.
- Paket başına en az 3, en fazla 30 sticker.
- Bir paket ya tamamen statik ya da tamamen animasyonlu olmalı (karışık olamaz).

Detaylı kurallar ve App Store gönderim adımları için `sticker_packs.wasticker`
dosyasındaki alanlara ve WhatsApp'ın resmi dokümantasyonuna bakın:
<https://github.com/WhatsApp/stickers/blob/main/iOS/README.md>

## App Store'a göndermeden önce

Apple, bu örnek arayüzün **birebir aynısıyla** App Store'a gönderilen
uygulamaları reddediyor. Bu projede metinler Türkçeleştirildi ve marka
değiştirildi, ancak **App Store'a gerçekten göndermeden önce** kendi görsel
kimliğinizle (renkler, düzen, logo) arayüzü belirgin şekilde
özelleştirmeniz gerekir. Ayrıca App Store Connect'te uygulamanıza
`WAStickers` anahtar kelimesini eklemeniz önerilir — WhatsApp, sticker
uygulamalarını bu şekilde arayabiliyor.

## Yapı (dosya haritası)

```
whatsapp-sticker-app-ios/
├── WAStickersThirdParty.xcodeproj/     # Xcode proje dosyası
├── WebP.framework/                     # Animasyonlu WebP kodlama/çözme (resmi WhatsApp framework'ü)
└── WAStickersThirdParty/
    ├── *.swift                         # Uygulama mantığı (Türkçeleştirilmiş arayüz metinleri)
    ├── sticker_packs.wasticker         # 2 paketin meta verisi (isim, emoji, açıklama...)
    ├── 01_Cuppy_smile.png ... 22_Cuppy_bye.png     # "Günlük Sözler" paketi (statik)
    ├── 01_SendingLove.webp ... 21_YouAreMyHero.webp # "Hareketli Sticker'lar" paketi (animasyonlu)
    ├── tray_Cuppy.png / tray_TogetherAtHome.png    # Paket tepsi ikonları
    └── Assets.xcassets/                # Uygulama ikonu ve arayüz ikonları
```

## Lisans notu

Bu proje, WhatsApp'ın BSD lisanslı [stickers](https://github.com/WhatsApp/stickers)
örnek koduna (Copyright © Meta Platforms, Inc.) dayanır; `LICENSE` dosyası
korunmuştur. Sticker görselleri ve metinleri bu proje için özgün olarak
üretilmiştir.
