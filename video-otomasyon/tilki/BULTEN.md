# Günlük oyun haberleri bülteni — talimat

Zamanlanmış görev her sabah 08:48'de (Europe/Istanbul) yeni bir Claude oturumu açar ve bu dosyayı uygular;
araştırma bitince (≈ 09:00) telefona bildirim gider. Son mesajın ilk satırı bildirimde görünecek kısa özettir.
Kullanıcı "oyun haberleri", "bülteni hazırla" gibi bir şey yazdığında da aynı adımlar geçerlidir.

## 1. Tara (son 24 saat, Türkiye saati)

- Web aramasını `extended` modda, aynı turda birden çok sorguyla yap: genel ("video game news <tarih>"),
  yamalar ("patch notes <tarih>"), çıkış tarihi değişiklikleri ("delayed / release date <tarih>"),
  yeni duyurular ("announced / reveal <tarih>"), Türkçe ("oyun haberleri <tarih>").
- Türkiye'de çok oynanan oyunlara ayrıca bak: GTA (VI ve Online), Valorant, Counter-Strike 2, League of Legends,
  PUBG / PUBG Mobile, Fortnite, Minecraft, EA SPORTS FC, Call of Duty, Battlefield, Roblox, Genshin Impact /
  HoYoverse oyunları, Steam'in en çok oynananları; platform tarafında PlayStation, Xbox, Nintendo, Steam.
- Resmî kaynakları `allowed_domains` ile ayrıca ara: geliştirici blogları, resmî yama notları, Steam duyuruları,
  PlayStation Blog, Xbox Wire, Nintendo, Rockstar Newswire, Riot, EA, Activision/Call of Duty.
- Ağ izni varsa kaynak sayfayı açıp tarih ve ayrıntıyı doğrula (web-fetch). İzin yoksa yalnızca arama sonucunun
  tarihine ve en az iki bağımsız kaynağa güven; tek kaynaklı söylentiyi listeye alma.

## 2. Seç ve sırala

- Öncelik: büyük yamalar ve sezon güncellemeleri > yeni oyun duyuruları > çıkış tarihi değişiklikleri/ertelemeler >
  oynanışı etkileyen gelişmeler (sunucu, fiyat, platform, hile önleme, kapanma) > sektör/finans haberleri.
- Türkiye'deki oyuncular için anlamı büyük olanı üste al (bölgesel fiyat, Türkçe dil desteği, TR sunucuları da öne çıkar).
- Aynı gelişmeyi bir kez yaz (farklı sitelerdeki aynı haberi birleştir). Söylenti/sızıntıyı ancak resmî bir
  açıklama varsa al.
- 5–10 madde. Beşten az doğrulanmış gelişme varsa bulduklarınla yetin. Hafta sonu gibi sakin günlerde 24 saati
  biraz aşan ama hâlâ süren bir gelişmeyi alırsan tarihini açıkça yaz ve bunu tek cümleyle belirt.

## 3. Biçim (mesaj ve dosya aynı)

```
**🦊 Fox Bülten · 8 Kasım 2026 bülteni**

1. **Kısa başlık**
   Oyuncu için ne anlama geldiğini anlatan en fazla iki cümle.
   Yayın: 7 Kasım 2026 · Kaynak: [Geliştirici duyurusu](https://…) (varsa ek: [Site](https://…))

…

Bugün tilki hangi haberi sunsun? Numarasını yazman yeterli. 🦊
```

- Dosya: `video-otomasyon/tilki/bultenler/YYYY-MM-DD.md`. Commit'le ve çalıştığın dala push et.
- Son satır tam olarak yukarıdaki soru olsun. **Kullanıcı numara yazmadan video üretimine başlama.**
- Numara gelince `video-otomasyon/tilki/README.md` → "Video üretimi" adımlarını uygula.
