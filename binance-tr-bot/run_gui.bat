@echo off
REM Tek tikla GUI'yi calistir (kaynaktan, .exe olmadan).
REM Ilk kullanimda "build_windows_exe.bat" ile .exe olusturmanizi oneririz.
cd /d "%~dp0"
if not exist ".env" copy .env.example .env >nul
python -m pip install -q -r requirements.txt
python gui.py
pause
