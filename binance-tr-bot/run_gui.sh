#!/usr/bin/env bash
# Tek komutla GUI'yi calistir (Linux/macOS).
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
pip install -q -r requirements.txt
python3 gui.py
