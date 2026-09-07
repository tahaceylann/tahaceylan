@echo off
REM =========================================================================
REM  Binance TR Trading Bot - Windows .exe olusturucu
REM
REM  Bu dosyayi Windows bilgisayarinizda, binance-tr-bot klasoru icinden
REM  cift tiklayarak calistirin. Python 3.10+ kurulu olmali
REM  (https://www.python.org/downloads/ - kurulumda "Add to PATH" isaretleyin).
REM
REM  Islem bitince dist\BinanceTRBot.exe dosyasi olusur; onu cift tiklayarak
REM  botu her seferinde tek tusla acabilirsiniz.
REM =========================================================================

echo [1/4] Bagimliliklar kuruluyor...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
pip install pyinstaller

echo.
echo [2/4] .env dosyasi hazirlaniyor...
if not exist ".env" (
    copy .env.example .env >nul
    echo    .env.example kopyalandi. Calistirmadan once .env icini duzenleyin.
)

echo.
echo [3/4] .exe paketleniyor (birkaç dakika surebilir)...
pyinstaller --noconfirm --onefile --windowed ^
    --name "BinanceTRBot" ^
    --add-data ".env.example;." ^
    gui.py

echo.
echo [4/4] Tamamlandi!
echo    Calistirilabilir dosya: dist\BinanceTRBot.exe
echo    Bu dosyayi istediginiz yere kopyalayip cift tiklayarak baslatabilirsiniz.
echo    (Ilk calistirmada yaninda bir .env dosyasi olmasi gerekir.)
pause
