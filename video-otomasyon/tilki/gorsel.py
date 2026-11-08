#!/usr/bin/env python3
"""Görsel bul, indir, kaynağıyla kaydet.

  python3 gorsel.py ara "GTA 6 Grotti Cheetah screenshot" [--adet 10]   # Google Görseller (Serper.dev)
  python3 gorsel.py steam "NieR:Automata" | 524220                      # Steam mağazasının resmî ekran görüntüleri
  python3 gorsel.py indir <bolum> <anahtar> <görsel_url> --sayfa <kaynak_sayfa> \
        --sahip "Rockstar Games" --lisans "Resmî basın görseli – editoryal kullanım" \
        --aciklama "Grotti Cheetah, resmî ekran görüntüsü" [--resmi]
  python3 gorsel.py liste <bolum>

Kayıtlar <bolum>/kaynaklar.json'a yazılır; uret.py ve YouTube açıklaması buradan beslenir.
Anahtarlar: SERPER_API_KEY ortam değişkeni veya ortamın network secret'ı (google.serper.dev, X-API-KEY).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from PIL import Image

UA = "Mozilla/5.0 (X11; Linux x86_64) TilkiHaber/1.0"


def hata(m: str) -> None:
    print(f"HATA: {m}", file=sys.stderr)
    sys.exit(1)


def getir(url: str, veri: bytes | None = None, basliklar: dict | None = None, zaman: int = 60) -> bytes:
    istek = urllib.request.Request(url, data=veri, headers={"User-Agent": UA, **(basliklar or {})},
                                   method="POST" if veri else "GET")
    try:
        with urllib.request.urlopen(istek, timeout=zaman) as y:
            return y.read()
    except urllib.error.HTTPError as e:
        hata(f"{url} → HTTP {e.code}: {e.read()[:300]!r}")
    except urllib.error.URLError as e:
        sebep = str(e.reason)
        if "403" in sebep or "Tunnel" in sebep:
            host = urllib.parse.urlparse(url).hostname
            hata(f"{host} ortamın ağ izinlerinde yok (proxy 403). Bu host'u ortamın Allowed domains listesine "
                 "ekleyin ya da Claude'dan eklemesini isteyin.")
        hata(f"{url} → {sebep}")
    return b""


def ara(sorgu: str, adet: int) -> None:
    anahtar = os.environ.get("SERPER_API_KEY") or "proxy-tarafindan-eklenir"
    yanit = getir("https://google.serper.dev/images",
                  json.dumps({"q": sorgu, "gl": "tr", "hl": "tr", "num": adet}).encode(),
                  {"X-API-KEY": anahtar, "Content-Type": "application/json"})
    sonuc = json.loads(yanit).get("images", [])[:adet]
    if not sonuc:
        print("Sonuç yok.")
    for i, g in enumerate(sonuc, 1):
        print(f"{i:2}. {g.get('title', '')[:90]}\n    görsel : {g.get('imageUrl')}\n"
              f"    sayfa  : {g.get('link')}  ({g.get('domain', g.get('source', ''))})\n"
              f"    boyut  : {g.get('imageWidth', '?')}x{g.get('imageHeight', '?')}")


def steam(oyun: str) -> None:
    if not oyun.isdigit():
        q = urllib.parse.quote(oyun)
        bulunan = json.loads(getir(f"https://store.steampowered.com/api/storesearch/?term={q}&l=turkish&cc=TR"))
        if not bulunan.get("items"):
            hata("Steam'de bulunamadı")
        for it in bulunan["items"][:5]:
            print(f"  appid {it['id']}: {it['name']}")
        oyun = str(bulunan["items"][0]["id"])
    veri = json.loads(getir(f"https://store.steampowered.com/api/appdetails?appids={oyun}&l=turkish"))[oyun]
    if not veri.get("success"):
        hata("appdetails başarısız")
    d = veri["data"]
    print(f"\n{d['name']} — yayıncı: {', '.join(d.get('publishers', []))} · geliştirici: {', '.join(d.get('developers', []))}")
    print(f"Mağaza sayfası: https://store.steampowered.com/app/{oyun}/")
    print(f"Kapak: {d.get('header_image')}")
    for i, s in enumerate(d.get("screenshots", []), 1):
        print(f"{i:2}. {s['path_full']}")


def indir(bolum: Path, anahtar: str, url: str, sayfa: str, sahip: str, lisans: str, aciklama: str,
          resmi: bool) -> None:
    baytlar = getir(url, zaman=120)
    try:
        im = Image.open(io.BytesIO(baytlar))
        im.load()
    except Exception as e:  # noqa: BLE001
        hata(f"indirilen dosya görsel değil: {e}")
    klasor = bolum / "gorseller"
    klasor.mkdir(parents=True, exist_ok=True)
    hedef = klasor / f"{anahtar}.jpg"
    rgb = im.convert("RGB")
    rgb.save(hedef, "JPEG", quality=94)
    kayit_yolu = bolum / "kaynaklar.json"
    kayitlar = json.loads(kayit_yolu.read_text(encoding="utf-8")) if kayit_yolu.exists() else {}
    kayitlar[anahtar] = {
        "dosya": f"gorseller/{hedef.name}", "url": url, "sayfa": sayfa, "sahip": sahip, "lisans": lisans,
        "aciklama": aciklama, "resmi": resmi, "genislik": rgb.width, "yukseklik": rgb.height,
        "sha256": hashlib.sha256(baytlar).hexdigest(), "indirme": datetime.now().isoformat(timespec="seconds"),
    }
    kayit_yolu.write_text(json.dumps(kayitlar, ensure_ascii=False, indent=2), encoding="utf-8")
    uyari = "  ⚠ 1000 px'ten dar, dikey kartta bulanık görünebilir" if rgb.width < 1000 else ""
    print(f"Kaydedildi: {hedef} ({rgb.width}x{rgb.height}){uyari}")


def liste(bolum: Path) -> None:
    yol = bolum / "kaynaklar.json"
    if not yol.exists():
        hata("kaynaklar.json yok")
    for a, m in json.loads(yol.read_text(encoding="utf-8")).items():
        eksik = [k for k in ("sayfa", "sahip", "lisans") if not m.get(k)]
        print(f"- {a}: {m.get('genislik')}x{m.get('yukseklik')} · © {m.get('sahip')} · {m.get('sayfa')}"
              + (f"  ⚠ eksik: {', '.join(eksik)}" if eksik else ""))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    alt = ap.add_subparsers(dest="komut", required=True)
    a = alt.add_parser("ara"); a.add_argument("sorgu"); a.add_argument("--adet", type=int, default=10)
    s = alt.add_parser("steam"); s.add_argument("oyun")
    i = alt.add_parser("indir")
    i.add_argument("bolum", type=Path); i.add_argument("anahtar"); i.add_argument("url")
    i.add_argument("--sayfa", required=True); i.add_argument("--sahip", required=True)
    i.add_argument("--lisans", required=True); i.add_argument("--aciklama", default="")
    i.add_argument("--resmi", action="store_true")
    li = alt.add_parser("liste"); li.add_argument("bolum", type=Path)
    arg = ap.parse_args()
    if arg.komut == "ara":
        ara(arg.sorgu, arg.adet)
    elif arg.komut == "steam":
        steam(arg.oyun)
    elif arg.komut == "indir":
        indir(arg.bolum, arg.anahtar, arg.url, arg.sayfa, arg.sahip, arg.lisans, arg.aciklama, arg.resmi)
    else:
        liste(arg.bolum)


if __name__ == "__main__":
    main()
