#!/usr/bin/env python3
"""Günlük video otomasyonu: senaryo (JSON) -> ElevenLabs seslendirme -> dikey MP4.

Kullanım:
    python3 video-otomasyon/olustur.py video-otomasyon/gunler/2026-11-05.json
    python3 video-otomasyon/olustur.py <senaryo.json> --onizleme   # ElevenLabs'e gitmeden, sessiz önizleme

Gerekenler: Python 3.9+, ffmpeg (drawtext destekli). Harici Python paketi yok.
Ortam değişkenleri:
    ELEVENLABS_API_KEY   (zorunlu, --onizleme hariç)
    ELEVENLABS_VOICE_ID  (isteğe bağlı; senaryodaki "ses.voice_id" önceliklidir)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path

KOK = Path(__file__).resolve().parent
CIKTI = KOK / "cikti"
ONBELLEK = KOK / ".onbellek"

GENISLIK, YUKSEKLIK, FPS = 1080, 1920, 30
VARSAYILAN_SES = "pNInz6obpgDQGcFmaJgB"  # ElevenLabs hazır ses "Adam" (çok dilli modelle Türkçe okur)
VARSAYILAN_MODEL = "eleven_multilingual_v2"
SAHNE_SONU_BOSLUK = 0.35  # saniye; sahneler arası nefes payı

# YouTube Shorts: dikey 9:16, <= 60 sn (ideal 30-45). Arayüz alt ~%20'yi (başlık, kanal, butonlar)
# ve sağ kenarı kaplar; üst ~%10'da arama/kamera simgeleri var. Yazılar bu "güvenli alana" konur.
SHORTS_MAX_SURE = 60.0
SHORTS_IDEAL_SURE = 45.0
BASLIK_Y = 210            # üstteki seri adı (üst arayüzün altında)
EKRAN_Y_ORAN = 0.34       # büyük ekran yazısının merkezi
ALT_KUTU_Y_ORAN = 0.56    # anlatım kutusunun üstü
ALT_KUTU_H_ORAN = 0.24    # alt kutu yüksekliği -> bittiği yer %80 (alt %20 boş kalır)

FONT_KALIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_NORMAL = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Sahne başına dönen arka plan paletleri (iki renkli animasyonlu gradyan).
PALETLER = [
    ("0xff2d95", "0x7b2ff7"),
    ("0x7b2ff7", "0x00c2ff"),
    ("0xff7a18", "0xff2d95"),
    ("0x00c9a7", "0x7b2ff7"),
    ("0xffb800", "0xff4d4d"),
]


def hata(mesaj: str) -> None:
    print(f"HATA: {mesaj}", file=sys.stderr)
    sys.exit(1)


def calistir(komut: list[str]) -> None:
    sonuc = subprocess.run(komut, capture_output=True, text=True)
    if sonuc.returncode != 0:
        print(sonuc.stderr[-3000:], file=sys.stderr)
        hata(f"ffmpeg başarısız: {' '.join(komut[:4])} ...")


def sure_olc(dosya: Path) -> float:
    cikti = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(dosya)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(cikti)


# ---------------------------------------------------------------- ElevenLabs

def elevenlabs_tts(metin: str, ses: dict, hedef: Path) -> None:
    anahtar = os.environ.get("ELEVENLABS_API_KEY")
    if not anahtar:
        hata("ELEVENLABS_API_KEY ortam değişkeni tanımlı değil (ya da --onizleme kullan).")
    voice_id = ses.get("voice_id") or os.environ.get("ELEVENLABS_VOICE_ID") or VARSAYILAN_SES
    url = (f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
           "?output_format=mp3_44100_128")
    govde = {
        "text": metin,
        "model_id": ses.get("model_id", VARSAYILAN_MODEL),
        "voice_settings": {
            "stability": ses.get("stability", 0.45),
            "similarity_boost": ses.get("similarity_boost", 0.8),
            "style": ses.get("style", 0.2),
            "use_speaker_boost": True,
        },
    }
    if ses.get("dil"):
        govde["language_code"] = ses["dil"]
    istek = urllib.request.Request(
        url, data=json.dumps(govde).encode(), method="POST",
        headers={"xi-api-key": anahtar, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
    )
    for deneme in range(4):
        try:
            with urllib.request.urlopen(istek, timeout=120) as yanit:
                hedef.write_bytes(yanit.read())
            return
        except urllib.error.HTTPError as e:
            ayrinti = e.read().decode(errors="replace")[:500]
            if e.code in (429, 500, 502, 503) and deneme < 3:
                time.sleep(2 ** (deneme + 1))
                continue
            hata(f"ElevenLabs {e.code}: {ayrinti}")
        except urllib.error.URLError as e:
            if deneme < 3:
                time.sleep(2 ** (deneme + 1))
                continue
            hata(f"ElevenLabs'e ulaşılamadı: {e.reason}")


def seslendir(metin: str, ses: dict, onizleme: bool) -> Path:
    """Sahne sesini üretir; aynı metin+ses için önbellekten döner (kredi harcamaz)."""
    ONBELLEK.mkdir(exist_ok=True)
    anahtar = json.dumps({"m": metin, "s": ses, "o": onizleme}, sort_keys=True, ensure_ascii=False)
    ozet = hashlib.sha1(anahtar.encode()).hexdigest()[:16]
    if onizleme:
        hedef = ONBELLEK / f"{ozet}-sessiz.m4a"
        if not hedef.exists():
            # Türkçe anlatım için ~2.5 kelime/sn tahmini.
            sure = max(2.0, len(metin.split()) / 2.5)
            calistir(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                      "-t", f"{sure:.2f}", "-c:a", "aac", str(hedef)])
        return hedef
    hedef = ONBELLEK / f"{ozet}.mp3"
    if not hedef.exists():
        elevenlabs_tts(metin, ses, hedef)
    return hedef


# ---------------------------------------------------------------- Görsel

def satirla(metin: str, genislik: int) -> str:
    # DejaVu fontunda renkli emoji yok; kutucuk görünmesin diye BMP dışı karakterleri at.
    metin = "".join(ch for ch in metin if ord(ch) < 0x10000 and ch != "\ufe0f").strip()
    return "\n".join(textwrap.wrap(metin, width=genislik, break_long_words=False)) or " "


def sahne_render(no: int, sahne: dict, baslik: str, ses_dosyasi: Path,
                 calisma: Path, toplam: int) -> tuple[Path, float]:
    sure = sure_olc(ses_dosyasi) + SAHNE_SONU_BOSLUK
    c0, c1 = PALETLER[(no - 1) % len(PALETLER)]

    ekran_txt = calisma / f"ekran{no}.txt"
    alt_txt = calisma / f"alt{no}.txt"
    ust_txt = calisma / f"ust{no}.txt"
    ekran_txt.write_text(satirla(sahne.get("ekran", ""), 14), encoding="utf-8")
    alt = satirla(sahne["anlatim"], 30)
    alt_font = 52
    if alt.count("\n") >= 4:  # uzun anlatım kutudan taşmasın
        alt, alt_font = satirla(sahne["anlatim"], 38), 42
    alt_txt.write_text(alt, encoding="utf-8")
    ust_txt.write_text(f"{baslik}  ·  {no}/{toplam}", encoding="utf-8")

    # Büyük ekran yazısı yumuşakça belirip hafifçe yukarı kayar.
    giris = r"min(1\,t/0.4)"
    filtre = ",".join([
        f"drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill",
        f"drawtext=fontfile={FONT_NORMAL}:textfile={ust_txt}:fontsize=40:fontcolor=white@0.85:"
        f"x=(w-text_w)/2:y={BASLIK_Y}",
        f"drawtext=fontfile={FONT_KALIN}:textfile={ekran_txt}:fontsize={124 if no == 1 else 104}:fontcolor=white:"
        f"line_spacing=18:shadowcolor=black@0.45:shadowx=4:shadowy=6:"
        f"x=(w-text_w)/2:y=(h*{EKRAN_Y_ORAN}-text_h/2)+40*(1-{giris}):alpha={giris}",
        f"drawbox=x=60:y=ih*{ALT_KUTU_Y_ORAN}:w=iw-120:h=ih*{ALT_KUTU_H_ORAN}:color=black@0.35:t=fill",
        f"drawtext=fontfile={FONT_NORMAL}:textfile={alt_txt}:fontsize={alt_font}:fontcolor=white:"
        f"line_spacing=14:x=(w-text_w)/2:y=h*{ALT_KUTU_Y_ORAN + ALT_KUTU_H_ORAN / 2}-text_h/2",
        # İlerleme çubuğu
        f"drawbox=x=0:y=ih-14:w=iw*{(no - 1) / toplam:.4f}+iw*{1 / toplam:.4f}*t/{sure:.3f}:h=14:"
        f"color=white@0.9:t=fill",
        "format=yuv420p",
    ])
    hedef = calisma / f"sahne{no:02d}.mp4"
    calistir([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"gradients=s={GENISLIK}x{YUKSEKLIK}:r={FPS}:c0={c0}:c1={c1}:speed=0.015:d={sure:.3f}",
        "-i", str(ses_dosyasi),
        "-filter_complex", f"[0:v]{filtre}[v];[1:a]aresample=44100,apad[a]",
        "-map", "[v]", "-map", "[a]", "-t", f"{sure:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
        str(hedef),
    ])
    return hedef, sure


def srt_zaman(s: float) -> str:
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


# ---------------------------------------------------------------- Shorts metadatası

def shorts_metadata(veri: dict, baslik: str) -> dict:
    """YouTube yükleme alanları: başlık (<=100), açıklama (#Shorts içerir), etiketler."""
    aciklama = (veri.get("aciklama") or "").strip()
    etiketler = [t for t in aciklama.split() if t.startswith("#")]
    if not any(t.lower() == "#shorts" for t in etiketler):
        etiketler.append("#Shorts")
        aciklama = (aciklama + " #Shorts").strip()
    ilk = veri["sahneler"][0].get("ekran") or baslik
    yt_baslik = "".join(ch for ch in ilk if ord(ch) < 0x10000 and ch != "\ufe0f").strip()
    yt_baslik = f"{yt_baslik} | {baslik}" if baslik and baslik not in yt_baslik else yt_baslik
    if len(yt_baslik) > 92:
        yt_baslik = yt_baslik[:91].rstrip() + "…"
    yt_baslik += " #Shorts"
    return {"baslik": yt_baslik, "aciklama": aciklama,
            "etiketler": [t.lstrip("#") for t in etiketler], "kategori": "Entertainment",
            "gorunurluk": "private"}


# ---------------------------------------------------------------- Ana akış

def main() -> None:
    ap = argparse.ArgumentParser(description="ElevenLabs ile günlük video üret.")
    ap.add_argument("senaryo", type=Path, help="Günün senaryo JSON dosyası")
    ap.add_argument("--onizleme", action="store_true",
                    help="ElevenLabs çağırmadan sessiz önizleme videosu üret")
    arg = ap.parse_args()

    if not shutil.which("ffmpeg"):
        hata("ffmpeg bulunamadı.")
    veri = json.loads(arg.senaryo.read_text(encoding="utf-8"))
    sahneler = veri.get("sahneler") or hata("Senaryoda 'sahneler' yok.")
    baslik = veri.get("baslik", arg.senaryo.stem)
    ses = veri.get("ses", {})

    ad = arg.senaryo.stem + ("-onizleme" if arg.onizleme else "")
    calisma = CIKTI / f".{ad}-parcalar"
    if calisma.exists():
        shutil.rmtree(calisma)
    calisma.mkdir(parents=True)

    parcalar, srt, an = [], [], 0.0
    for i, sahne in enumerate(sahneler, 1):
        print(f"[{i}/{len(sahneler)}] {'sessiz önizleme' if arg.onizleme else 'ElevenLabs'} sesi...")
        ses_dosyasi = seslendir(sahne["anlatim"], ses, arg.onizleme)
        print(f"[{i}/{len(sahneler)}] görüntü işleniyor...")
        parca, sure = sahne_render(i, sahne, baslik, ses_dosyasi, calisma, len(sahneler))
        parcalar.append(parca)
        srt.append(f"{i}\n{srt_zaman(an)} --> {srt_zaman(an + sure - SAHNE_SONU_BOSLUK)}\n"
                   f"{sahne['anlatim']}\n")
        an += sure

    liste = calisma / "liste.txt"
    liste.write_text("".join(f"file '{p.name}'\n" for p in parcalar), encoding="utf-8")
    video = CIKTI / f"{ad}.mp4"
    calistir(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(liste),
              "-c", "copy", "-movflags", "+faststart", str(video)])
    (CIKTI / f"{ad}.srt").write_text("\n".join(srt), encoding="utf-8")
    shutil.rmtree(calisma)

    meta = shorts_metadata(veri, baslik)
    (CIKTI / f"{ad}.shorts.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nHazır: {video}  ({an:.1f} sn, {len(sahneler)} sahne)")
    if an > SHORTS_MAX_SURE:
        print(f"UYARI: {an:.1f} sn > {SHORTS_MAX_SURE:.0f} sn; YouTube bunu Shorts saymayabilir. "
              "Senaryoyu kısalt.", file=sys.stderr)
    elif an > SHORTS_IDEAL_SURE:
        print(f"Not: {an:.1f} sn Shorts için uygun ama {SHORTS_IDEAL_SURE:.0f} sn altı daha iyi tutulur.")
    print(f"Shorts metadatası: {CIKTI / (ad + '.shorts.json')}")
    print(f"Altyazı: {CIKTI / (ad + '.srt')}")
    print(f"\nBaşlık: {meta['baslik']}\nPaylaşım metni:\n{meta['aciklama']}")


if __name__ == "__main__":
    main()
