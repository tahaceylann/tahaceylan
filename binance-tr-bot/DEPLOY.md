# Sunucuya Kurulum (PC Kapalıyken de Çalışsın)

Bot, bir Linux sunucusunda (VPS) `main.py` ile GUI olmadan, arka planda
sürekli çalışabilir. Bilgisayarınızı kapatsanız bile sunucu 7/24 açık
kaldığı sürece bot çalışmaya devam eder. Durumu **Telegram bildirimleri**
üzerinden takip edersiniz (GUI penceresi yerine).

## 1) Bir VPS (sanal sunucu) kiralayın

Ucuz ve yeterli seçenekler (aylık ~$4-6):
- [Hetzner Cloud](https://www.hetzner.com/cloud/) (CX22 gibi en ucuz paket yeterli)
- [DigitalOcean](https://www.digitalocean.com/) (Basic Droplet)
- [Contabo](https://contabo.com/)

Kurulumda **Ubuntu 22.04 / 24.04** seçin. Sunucu oluşunca size bir IP
adresi ve root şifresi/SSH anahtarı verilir.

## 2) Sunucuya bağlanın

Windows'ta PowerShell veya PuTTY ile:
```
ssh root@SUNUCU_IP_ADRESI
```

## 3) Gerekli paketleri kurun

```bash
apt update && apt install -y python3 python3-venv python3-pip git
```

## 4) Botu sunucuya indirin

```bash
mkdir -p /opt/binance-tr-bot
cd /opt/binance-tr-bot
git clone --branch claude/binance-tr-trading-bot-qtshtz \
  https://github.com/tahaceylann/tahaceylan.git tmp
mv tmp/binance-tr-bot/* .
mv tmp/binance-tr-bot/.[!.]* . 2>/dev/null || true
rm -rf tmp
```

## 5) Sanal ortam kurup bağımlılıkları yükleyin

```bash
cd /opt/binance-tr-bot
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

## 6) Ayarları girin

```bash
cp .env.example .env
nano .env
```

`.env` içinde en azından **`WEB_PASSWORD`**'u güçlü bir şifreyle doldurun
(web panelinizi internetten herkesin görmesini istemezsiniz). Diğer
ayarları (sembol, risk, Telegram) web panelinden de girebilirsiniz,
şimdi boş bırakabilirsiniz. Kaydetmek için `Ctrl+O`, `Enter`, çıkmak için
`Ctrl+X`.

## 7) Elle bir kez çalıştırıp test edin

```bash
./venv/bin/python web_app.py
```

"Running on http://0.0.0.0:8000" gibi bir satır görmelisiniz. Tarayıcınızda
`http://SUNUCU_IP:8000` adresine gidin — şifre ekranı ve ardından dashboard
açılmalı (aşağıdaki 7b adımıyla portu açmanız gerekebilir). Sorun yoksa
`Ctrl+C` ile durdurun.

### 7b) Güvenlik duvarında 8000 portunu açın

```bash
ufw allow 8000/tcp
```

(Firewall kullanmıyorsanız veya bulut sağlayıcınızın kendi panelinde ayrı
bir "Security Group/Firewall" ayarı varsa oradan da 8000 portunu açmanız
gerekebilir.)

## 8) Kalıcı servis olarak kurun (sunucu yeniden başlasa bile otomatik açılsın)

```bash
cp deploy/binance-bot.service /etc/systemd/system/binance-bot.service
systemctl daemon-reload
systemctl enable binance-bot
systemctl start binance-bot
```

Durumu kontrol edin:
```bash
systemctl status binance-bot
```

Canlı logları izleyin:
```bash
journalctl -u binance-bot -f
```

Durdurmak/yeniden başlatmak:
```bash
systemctl stop binance-bot
systemctl restart binance-bot
```

## 9) Güncelleme yapmak isterseniz

```bash
systemctl stop binance-bot
cd /opt/binance-tr-bot
git pull   # veya yeni dosyalari elle kopyalayin
./venv/bin/pip install -r requirements.txt
systemctl start binance-bot
```

## Güvenlik notları

- Sunucuya SSH ile bağlanırken şifre yerine **SSH anahtarı** kullanın
- `.env` dosyasının izinlerini kısıtlayın: `chmod 600 .env`
- API anahtarınızda **"Çekme İşlemleri"** kapalı kalsın
- Mümkünse API anahtarını sadece sunucunuzun IP'sine kısıtlayın (Binance TR
  panelinde "İzin verilen IP adresleri")
- Sunucuyu düzenli güncelleyin: `apt update && apt upgrade -y`
