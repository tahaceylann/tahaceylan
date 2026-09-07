#!/usr/bin/env bash
# Binance TR Trading Bot - tek komutluk sunucu kurulumu.
#
# Kullanim (Hostinger VPS terminalinde, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/tahaceylann/tahaceylan/claude/binance-tr-trading-bot-qtshtz/binance-tr-bot/deploy/install.sh | bash
#
# Bu script:
#   1. Gerekli paketleri kurar (python3, venv, git)
#   2. Botu /opt/binance-tr-bot altina indirir
#   3. Sanal ortam kurup bagimliliklari yukler
#   4. .env dosyasini hazirlar (yoksa)
#   5. systemd servisi kurup web panelini otomatik baslatir
#
# Kurulumdan sonra: http://SUNUCU_IP:8000 adresinden panele girip
# API anahtarlarinizi ve diger ayarlari GIRMENIZ hala gerekiyor -
# bu script sizin adiniza borsa hesabi/API bilgisi girmez.

set -euo pipefail

REPO_URL="https://github.com/tahaceylann/tahaceylan.git"
BRANCH="claude/binance-tr-trading-bot-qtshtz"
INSTALL_DIR="/opt/binance-tr-bot"

echo "== [1/6] Sistem paketleri kontrol ediliyor =="
if command -v apt >/dev/null 2>&1; then
    apt update -y
    apt install -y python3 python3-venv python3-pip git
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3 python3-pip git
else
    echo "Desteklenmeyen paket yoneticisi. Lutfen python3/pip/git'i elle kurun." >&2
    exit 1
fi

echo "== [2/6] Bot indiriliyor -> $INSTALL_DIR =="
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "   Zaten kurulu, guncelleniyor..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    rm -rf "$INSTALL_DIR"
    tmp_dir=$(mktemp -d)
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$tmp_dir"
    mkdir -p "$INSTALL_DIR"
    cp -r "$tmp_dir/binance-tr-bot/." "$INSTALL_DIR/"
    rm -rf "$tmp_dir"
fi
cd "$INSTALL_DIR"

echo "== [3/6] Python sanal ortami kuruluyor =="
python3 -m venv venv
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -r requirements.txt -q

echo "== [4/6] .env dosyasi hazirlaniyor =="
if [ ! -f .env ]; then
    cp .env.example .env
    # Rastgele bir WEB_PASSWORD uret, kullanici degistirebilir
    RAND_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(12))")
    sed -i "s/^WEB_PASSWORD=.*/WEB_PASSWORD=${RAND_PASS}/" .env
    echo "   Web paneli sifreniz otomatik uretildi: ${RAND_PASS}"
    echo "   (Bu sifreyi not alin! .env dosyasinda WEB_PASSWORD altinda da duruyor.)"
else
    echo "   .env zaten var, dokunulmadi."
fi
chmod 600 .env

echo "== [5/6] systemd servisi kuruluyor =="
cp deploy/binance-bot.service /etc/systemd/system/binance-bot.service
sed -i "s#/opt/binance-tr-bot#${INSTALL_DIR}#g" /etc/systemd/system/binance-bot.service
systemctl daemon-reload
systemctl enable binance-bot
systemctl restart binance-bot

echo "== [6/6] Guvenlik duvarinda 8000 portu aciliyor (varsa ufw) =="
if command -v ufw >/dev/null 2>&1; then
    ufw allow 8000/tcp || true
fi

SERVER_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "======================================================"
echo " KURULUM TAMAMLANDI"
echo "======================================================"
echo " Panel adresi : http://${SERVER_IP}:8000"
if [ -n "${RAND_PASS:-}" ]; then
echo " Sifre        : ${RAND_PASS}"
fi
echo ""
echo " Servis durumu: systemctl status binance-bot"
echo " Canli loglar : journalctl -u binance-bot -f"
echo " Durdurma     : systemctl stop binance-bot"
echo "======================================================"
echo ""
echo "UYARI: Hostinger hPanel'inde ayrica VPS > Guvenlik > Firewall"
echo "bolumunden de 8000 portunu (TCP) acmaniz gerekebilir."
