# 🤖 Oto-Tıklayıcı — Fiziksel Otomatik Dokunma Cihazı

iPhone'da açık olan **herhangi bir oyunu/uygulamayı** senin yerine otomatik
olarak dokunan, ESP32 tabanlı küçük bir donanım. Telefonundan (Safari
üzerinden) açılan bir web paneliyle kontrol edilir: aralığı ayarla,
Başlat'a bas, servo kolu ekrana dokunmaya başlasın.

## Önce önemli bir gerçek: neden "uygulama" değil de donanım?

iOS, güvenlik/gizlilik nedeniyle bir uygulamanın başka bir uygulamaya
**dokunuş (tap) göndermesine izin vermez** — her uygulama kendi
"sandbox"ında izole çalışır. Bunun istisnası yok: App Store'da satılan,
"otomatik tıklama" yapan hiçbir uygulama başka bir uygulamanın içine
gerçekten dokunamaz (jailbreak olmadan). "Yapıyorum" diyen bir uygulama
görürsen ya işe yaramaz ya da güvenilmez bir kaynaktır.

Bu yüzden en güvenilir, jailbreak gerektirmeyen çözüm **fiziksel**: küçük
bir kol, telefonun ekranına gerçek bir parmak gibi dokunur. Telefon
açısından bu, senin parmağından hiçbir farkı olmayan gerçek bir
dokunuştur — dolayısıyla hangi uygulama/oyun açıksa onda çalışır.

> Jailbreak yapılmış bir cihazın varsa (AutoTouch/Auto Touch tarzı bir
> tweak ile tamamen yazılımsal, dokunuş kaydet/tekrar oynat şeklinde bir
> çözüm de mümkün) haber ver, o yönde de yardımcı olabilirim — jailbreak
> cihazın garantisini geçersiz kılar ve güvenlik risklerini artırır, bu
> yüzden varsayılan olarak donanım yolunu önerdim.

## Gerekli malzemeler (~150–300₺)

| Parça | Not |
|---|---|
| ESP32 geliştirme kartı (DevKit V1 vb.) | Wi-Fi'ı yerleşik, ~100-150₺ |
| 1x mikro servo motor (SG90 veya MG90S) | ~30-50₺ |
| İletken dokunma ucu | Bkz. aşağıdaki "Kapasitif uç" bölümü |
| Telefon standı / servo tutucu | 3D baskı, Lego ya da kartondan elle yapılabilir |
| Servo için ayrı 5V güç kaynağı (2x AA pil kutusu ya da powerbank) | Bkz. "Güç" notu aşağıda |
| Birkaç jumper kablo | — |

## Bağlantı

```
ESP32 GPIO13  ───────────────  Servo sinyal (turuncu/sarı kablo)
Servo 5V (kırmızı)  ─────────  Ayrı 5V güç kaynağı (+)
Servo GND (kahve/siyah) ─────  ESP32 GND  ─────  Güç kaynağı GND (ortak toprak!)
```

**Güç notu:** Servoyu ESP32'nin kendi 5V pininden BESLEME — servo
hareket ederken çektiği ani akım ESP32'yi resetleyebilir (brownout).
Ayrı bir 5V kaynağı kullan, sadece **GND'leri ortaklamayı unutma**.

## Kapasitif uç (ekranın dokunuşu algılaması için)

Kapasitif dokunmatik ekranlar plastik/kuru bir çubuğu "parmak" saymaz.
Servo kolunun ucuna şunlardan biri bağlanmalı:
- Ucuz bir **kapasitif dokunmatik ekran kalemi**nin ucunu keserek servo
  koluna bantlamak (en pratik yöntem), **veya**
- Alüminyum folyoya sarılmış küçük bir parça iletken (anti-statik) sünger.

Bu uçtan bir tel çekip **ESP32'nin GND'sine** bağla. (Devrenin toprağı,
kapasitif algılama için gereken "gövde" referansını sağlar — bu yüzden
GND ortak olmalı.)

## Firmware'i yükleme (Arduino IDE)

1. [Arduino IDE](https://www.arduino.cc/en/software) kur.
2. **Dosya → Tercihler** → *Ek Kart Yöneticisi URL'leri* kutusuna ekle:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. **Araçlar → Kart → Kart Yöneticisi** → `esp32` ara, kur.
4. **Araçlar → Kütüphane Yöneticisi** → `ESP32Servo` ara (Kevin Harrington),
   kur.
5. ESP32'yi USB ile bilgisayara bağla, **Araçlar → Kart**'tan kendi
   modelini seç (ör. "ESP32 Dev Module"), doğru **Port**'u seç.
6. `firmware/oto_tiklayici/oto_tiklayici.ino` dosyasını aç, **Yükle**'ye
   bas.
7. Seri Port Monitörü'nü aç (115200 baud) — "Kontrol paneli: http://…"
   satırını göreceksin (genelde `192.168.4.1`).

## Kalibrasyon (ilk kurulumda bir kere)

`oto_tiklayici.ino` içindeki `REST_ANGLE` (dinlenme açısı) ve
`TAP_ANGLE` (dokunma açısı) değerleri, senin servo/kol montajına özel —
kolun ekrana tam nerede indiğini ayarlaman gerekiyor:
1. Servoyu telefonun üstüne, kolun oyunun "topla/tıkla" butonuna denk
   geleceği şekilde sabitle.
2. `TAP_ANGLE`'ı deneyerek bul: kol ekrana **hafifçe** değmeli, sert
   bastırmamalı (ekranı çizmemesi/telefonu itmemesi için).
3. Değiştirdikten sonra dosyayı tekrar yükle.

## Kullanım

1. ESP32'yi güce tak (USB powerbank yeterli).
2. iPhone'da **Ayarlar → Wi-Fi**'dan `OtoTiklayici` ağına bağlan (şifre:
   `tiklatiklat` — istersen kodda değiştir).
3. Safari'de `http://192.168.4.1` adresini aç. İstersen **Paylaş → Ana
   Ekrana Ekle** ile kısayol oluştur.
4. Oyunu aç, telefonu servo kolunun altına yerleştir.
5. Kontrol panelinden aralığı/basma süresini ayarla, **Başlat**'a bas.

## Önemli notlar

- **Otomatik Kilit'i kapat**: Ayarlar → Ekran ve Parlaklık → Otomatik
  Kilit → **Hiçbir Zaman**. Yoksa ekran kararınca dokunuşlar boşa gider.
- **Güvenli Erişim (Yönlendirilmiş Erişim)** kullanmayı düşün (Ayarlar →
  Erişilebilirlik → Yönlendirilmiş Erişim): oyunu tek bir uygulamaya
  kilitler, yanlışlıkla ana ekrana dönüp servo boşa dokunmaz.
- Uzun süre çalıştıracaksan telefonu **şarjda** tut.
- Varsayılan **oto-kapanma 30 dakika** — unutup açık bırakmana karşı bir
  güvenlik. Kontrol panelinden değiştirebilir/kapatabilirsin.
- **Sorumluluk**: Birçok oyun kullanım şartlarında bot/otomasyon
  kullanımını yasaklar; bazı oyunlarda hesabın askıya alınabilir. Bu
  cihaz kişisel/tek oyunculu idle-tycoon tarzı oyunlarda pratik bir
  kolaylık olarak tasarlandı — rekabetçi/çok oyunculu bir oyunda başka
  oyuncuların aleyhine kullanma.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Servo hiç hareket etmiyor | Güç kaynağını ve GND ortaklığını kontrol et |
| Servo titriyor / ESP32 sürekli resetleniyor | Servoyu ESP32'nin 5V pininden değil ayrı kaynaktan besle |
| Ekran dokunuşu algılamıyor | Kapasitif uç + GND bağlantısını kontrol et, `TAP_ANGLE`'ı ayarla |
| Wi-Fi ağı görünmüyor | Seri Port Monitörü'nden hata var mı bak, ESP32'yi yeniden başlat |
| `192.168.4.1` açılmıyor | Telefonun `OtoTiklayici` ağına bağlı olduğundan (mobil veri değil) emin ol |

## Dosya yapısı

```
oto-tiklayici/
  README.md                                   Bu dosya
  firmware/
    oto_tiklayici/
      oto_tiklayici.ino   ESP32 firmware + gömülü web kontrol paneli
```
