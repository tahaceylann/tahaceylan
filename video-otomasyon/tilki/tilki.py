#!/usr/bin/env python3
"""Fox Bülten — gamer tilki sunuculu 2D dikey (1080x1920) haber videosu.

Kullanım:
    python3 tilki.py <senaryo.json> <ses.mp3> <cikti.mp4>

Senaryo (JSON):
{
  "manset": "Kısa başlık (panelin altında görünür)",
  "metin": "Seslendirilen metnin tamamı (altyazı için)",
  "gorseller": ["gorsel1.jpg", "gorsel2.png", ...]   # JSON dosyasına göre göreli yol olabilir; boş olabilir
}
Ses ElevenLabs bağlantısından üretilip indirilen mp3'tür. Ağız animasyonu
sesin şiddetine göre, altyazılar metnin uzunluğuna göre zamanlanır.
"""
from __future__ import annotations

import json
import math
import random
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
SS = 2  # tilki çizimi için süper örnekleme

TURUNCU = (255, 122, 26)
TURUNCU_K = (214, 88, 10)
KREM = (255, 240, 222)
KOYU = (28, 24, 38)
NEON = (0, 255, 170)
MOR = (140, 60, 255)


def font(boyut: int) -> ImageFont.FreeTypeFont:
    for yol in (
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(yol).exists():
            return ImageFont.truetype(yol, boyut)
    return ImageFont.load_default()


# ---------------------------------------------------------------- ses analizi
def ses_zarfi(mp3: Path) -> tuple[np.ndarray, float]:
    ham = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(mp3), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    a = np.frombuffer(ham, dtype=np.int16).astype(np.float32) / 32768
    sure = len(a) / 16000
    adim = 16000 // FPS
    n = int(math.ceil(len(a) / adim))
    rms = np.array([np.sqrt(np.mean(a[i * adim:(i + 1) * adim] ** 2) + 1e-9) for i in range(n)])
    rms = rms / (np.percentile(rms, 95) + 1e-6)
    rms = np.convolve(rms, np.ones(2) / 2, mode="same")
    return np.clip(rms, 0, 1), sure


# ---------------------------------------------------------------- tilki çizimi
def tilki_govde() -> Image.Image:
    """Gövde: kapüşonlu, göğüs, kollar (kafa hariç). 900x900 alan."""
    w, h = 900 * SS, 900 * SS
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = SS
    # kuyruk (arkada)
    d.ellipse([620 * s, 330 * s, 900 * s, 760 * s], fill=TURUNCU)
    d.ellipse([760 * s, 330 * s, 900 * s, 470 * s], fill=KREM)
    # hoodie gövde
    d.rounded_rectangle([170 * s, 260 * s, 730 * s, 900 * s], radius=200 * s, fill=KOYU)
    # yaka / göğüs kürkü
    d.polygon([(330 * s, 260 * s), (570 * s, 260 * s), (450 * s, 470 * s)], fill=KREM)
    # hoodie neon şeritler + logo
    d.line([(330 * s, 270 * s), (430 * s, 520 * s)], fill=TURUNCU, width=14 * s)
    d.line([(570 * s, 270 * s), (470 * s, 520 * s)], fill=TURUNCU, width=14 * s)
    d.rounded_rectangle([385 * s, 560 * s, 515 * s, 640 * s], radius=20 * s, outline=NEON, width=8 * s)
    d.polygon([(420 * s, 620 * s), (450 * s, 575 * s), (480 * s, 620 * s)], fill=NEON)
    # kollar (masaya uzanan)
    d.rounded_rectangle([90 * s, 380 * s, 250 * s, 820 * s], radius=80 * s, fill=KOYU)
    d.rounded_rectangle([650 * s, 380 * s, 810 * s, 820 * s], radius=80 * s, fill=KOYU)
    # pençeler
    d.ellipse([100 * s, 760 * s, 240 * s, 870 * s], fill=TURUNCU)
    d.ellipse([660 * s, 760 * s, 800 * s, 870 * s], fill=TURUNCU)
    return im.resize((900, 900), Image.LANCZOS)


def tilki_kafa(agiz: float, goz: float) -> Image.Image:
    """agiz: 0..1 açıklık, goz: 1 açık .. 0 kapalı. 700x700 alan."""
    w = h = 700 * SS
    s = SS
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # kulaklar
    for kx in (1, -1):
        cx = 350 + kx * 165
        d.polygon([((cx - 95) * s, 250 * s), ((cx + 95) * s, 250 * s), ((cx + kx * 40) * s, 20 * s)], fill=TURUNCU)
        d.polygon([((cx - 55) * s, 240 * s), ((cx + 55) * s, 240 * s), ((cx + kx * 32) * s, 80 * s)], fill=KREM)
        d.polygon([((cx + kx * 18) * s, 75 * s), ((cx + kx * 62) * s, 75 * s), ((cx + kx * 40) * s, 20 * s)], fill=KOYU)
    # baş
    d.ellipse([110 * s, 150 * s, 590 * s, 560 * s], fill=TURUNCU)
    # yanak tüyleri
    d.polygon([(110 * s, 380 * s), (40 * s, 470 * s), (190 * s, 520 * s)], fill=TURUNCU)
    d.polygon([(590 * s, 380 * s), (660 * s, 470 * s), (510 * s, 520 * s)], fill=TURUNCU)
    # beyaz ağız-burun bölgesi
    d.polygon([(150 * s, 420 * s), (350 * s, 330 * s), (550 * s, 420 * s), (470 * s, 600 * s), (350 * s, 640 * s), (230 * s, 600 * s)], fill=KREM)
    # gözler
    for gx in (255, 445):
        acik = max(0.08, goz)
        yy = 95 * acik
        d.ellipse([(gx - 48) * s, (330 - yy / 2) * s, (gx + 48) * s, (330 + yy / 2) * s], fill=(255, 255, 255))
        if goz > 0.25:
            d.ellipse([(gx - 30) * s, (330 - yy / 2.6) * s, (gx + 30) * s, (330 + yy / 2.6) * s], fill=(30, 200, 120))
            d.ellipse([(gx - 15) * s, (330 - yy / 4.5) * s, (gx + 15) * s, (330 + yy / 4.5) * s], fill=(15, 15, 20))
            d.ellipse([(gx + 4) * s, (316) * s, (gx + 18) * s, 330 * s], fill=(255, 255, 255))
        # kaşlar (kendinden emin)
        yon = 1 if gx < 350 else -1
        d.line([((gx - 50) * s, (262 - yon * 6) * s), ((gx + 50) * s, (262 + yon * 6) * s)], fill=TURUNCU_K, width=16 * s)
    # burun
    d.ellipse([318 * s, 440 * s, 382 * s, 485 * s], fill=KOYU)
    d.ellipse([335 * s, 447 * s, 352 * s, 458 * s], fill=(110, 100, 120))
    # ağız
    ah = 10 + 95 * agiz
    if agiz < 0.06:
        d.arc([300 * s, 480 * s, 350 * s, 525 * s], 10, 170, fill=KOYU, width=8 * s)
        d.arc([350 * s, 480 * s, 400 * s, 525 * s], 10, 170, fill=KOYU, width=8 * s)
    else:
        d.rounded_rectangle([300 * s, 505 * s, 400 * s, (505 + ah) * s], radius=int(min(45, ah / 2) * s), fill=(70, 20, 30))
        if ah > 40:
            d.ellipse([318 * s, (505 + ah * 0.55) * s, 382 * s, (505 + ah + 10) * s], fill=(255, 110, 130))
        d.rectangle([318 * s, 505 * s, 340 * s, 520 * s], fill=(255, 255, 255))
        d.rectangle([360 * s, 505 * s, 382 * s, 520 * s], fill=(255, 255, 255))
    # kulaklık (headset)
    d.arc([95 * s, 90 * s, 605 * s, 520 * s], 190, 350, fill=(40, 40, 50), width=34 * s)
    for kx in (95, 605):
        d.rounded_rectangle([(kx - 45) * s, 270 * s, (kx + 45) * s, 420 * s], radius=34 * s, fill=(40, 40, 50))
        d.rounded_rectangle([(kx - 30) * s, 300 * s, (kx + 30) * s, 390 * s], radius=22 * s, outline=NEON, width=8 * s)
    # mikrofon kolu
    d.line([(100 * s, 400 * s), (150 * s, 560 * s), (270 * s, 590 * s)], fill=(40, 40, 50), width=16 * s, joint="curve")
    d.ellipse([255 * s, 565 * s, 305 * s, 615 * s], fill=(40, 40, 50))
    d.ellipse([268 * s, 578 * s, 292 * s, 602 * s], fill=NEON)
    return im.resize((700, 700), Image.LANCZOS)


# ---------------------------------------------------------------- sahne
def arka_plan() -> Image.Image:
    y = np.linspace(0, 1, H)[:, None]
    ust = np.array([18, 10, 40]); alt = np.array([60, 10, 70])
    g = (ust * (1 - y) + alt * y).astype(np.uint8)
    im = Image.fromarray(np.repeat(g[:, None, :], W, axis=1).reshape(H, W, 3))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 90):  # neon ızgara (alt kısım)
        d.line([(x, 960), (W / 2 + (x - W / 2) * 2.2, H)], fill=(80, 40, 140), width=2)
    for i, yy in enumerate([960, 1010, 1080, 1180, 1320, 1520]):
        d.line([(0, yy), (W, yy)], fill=(80, 40, 140), width=2)
    return im


def gorsel_yukle(yol: Path, w: int, h: int) -> Image.Image:
    im = Image.open(yol).convert("RGB")
    oran = max(w * 1.15 / im.width, h * 1.15 / im.height)
    return im.resize((int(im.width * oran) + 1, int(im.height * oran) + 1), Image.LANCZOS)


def baslik_karti(w: int, h: int, metin: str) -> Image.Image:
    im = Image.new("RGB", (int(w * 1.15), int(h * 1.15)), (30, 15, 60))
    d = ImageDraw.Draw(im)
    for i in range(0, im.width + im.height, 60):
        d.line([(i, 0), (i - im.height, im.height)], fill=(45, 25, 85), width=20)
    f = font(78)
    satirlar = sar(metin, f, w - 120)
    y0 = im.height / 2 - len(satirlar) * 50
    for i, s in enumerate(satirlar):
        d.text((im.width / 2, y0 + i * 100), s, font=f, fill=(255, 255, 255), anchor="mm")
    return im


def sar(metin: str, f, maks: int) -> list[str]:
    kelimeler, satirlar, s = metin.split(), [], ""
    for k in kelimeler:
        t = (s + " " + k).strip()
        if f.getlength(t) <= maks:
            s = t
        else:
            if s:
                satirlar.append(s)
            s = k
    if s:
        satirlar.append(s)
    return satirlar


def altyazi_parcalari(metin: str, sure: float) -> list[tuple[float, float, str]]:
    kelimeler = metin.split()
    parcalar, buf = [], []
    for k in kelimeler:
        buf.append(k)
        if len(buf) >= 4 or k[-1:] in ".!?,":
            parcalar.append(" ".join(buf)); buf = []
    if buf:
        parcalar.append(" ".join(buf))
    toplam = sum(len(p) + 6 for p in parcalar)
    t, sonuc = 0.15, []
    kullan = sure - 0.3
    for p in parcalar:
        d = kullan * (len(p) + 6) / toplam
        sonuc.append((t, t + d, p)); t += d
    return sonuc


def main() -> None:
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(1)
    senaryo_yolu, mp3, cikti = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    sen = json.loads(senaryo_yolu.read_text(encoding="utf-8"))
    zarf, sure = ses_zarfi(mp3)
    son_ek = 2.2  # abone ol kapanışı için ek süre
    toplam = sure + son_ek
    n = int(toplam * FPS)

    bg = arka_plan()
    govde = tilki_govde()
    kafa_onbellek: dict[tuple[int, int], Image.Image] = {}

    PX, PY, PW, PH = 70, 215, 940, 640  # haber paneli
    gorseller = []
    for g in sen.get("gorseller", []):
        p = Path(g) if Path(g).is_absolute() else senaryo_yolu.parent / g
        if p.exists():
            gorseller.append(gorsel_yukle(p, PW, PH))
    if not gorseller:
        gorseller = [baslik_karti(PW, PH, sen.get("manset", "Fox Bülten"))]
    maske = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, PW, PH], radius=36, fill=255)

    altyazi = altyazi_parcalari(sen.get("metin", ""), sure)
    f_logo, f_manset, f_alt, f_ticker = font(64), font(46), font(62), font(34)
    manset_satir = sar(sen.get("manset", ""), f_manset, PW - 60)[:2]
    ticker = "  •  ".join(["SON DAKİKA", "FOX BÜLTEN", sen.get("manset", "")]) + "  •  "

    rnd = random.Random(7)
    kirp_zamanlari = sorted(rnd.uniform(0.5, toplam) for _ in range(int(toplam / 3)))

    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-i", str(mp3), "-filter_complex", f"[1:a]apad=pad_dur={son_ek}[a]", "-map", "0:v", "-map", "[a]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
         "-t", f"{toplam:.2f}", "-movflags", "+faststart", str(cikti)],
        stdin=subprocess.PIPE,
    )

    for i in range(n):
        t = i / FPS
        fr = bg.copy()
        d = ImageDraw.Draw(fr)

        # üst logo şeridi
        d.rectangle([0, 0, W, 170], fill=(15, 8, 30))
        d.text((70, 92), "FOX", font=f_logo, fill=TURUNCU, anchor="lm")
        d.text((70 + f_logo.getlength("FOX "), 92), "BÜLTEN", font=f_logo, fill=(255, 255, 255), anchor="lm")
        if int(t * 2) % 2 == 0:
            d.ellipse([W - 230, 78, W - 202, 106], fill=(255, 50, 70))
        d.text((W - 190, 92), "CANLI", font=f_ticker, fill=(255, 255, 255), anchor="lm")

        # haber paneli: görseller sırayla, Ken Burns
        idx = min(int(t / max(sure, 0.1) * len(gorseller)), len(gorseller) - 1)
        g = gorseller[idx]
        yerel = (t * len(gorseller) / max(sure, 0.1)) % 1 if t < sure else 1
        z = 1.0 + 0.12 * yerel
        cw, ch = int(PW * 1.15 / z), int(PH * 1.15 / z)
        ox = int((g.width - cw) * (0.3 + 0.4 * yerel)); oy = int((g.height - ch) / 2)
        kare = g.crop((ox, oy, ox + cw, oy + ch)).resize((PW, PH), Image.BILINEAR)
        d.rounded_rectangle([PX - 8, PY - 8, PX + PW + 8, PY + PH + 8], radius=44, fill=NEON if idx % 2 == 0 else TURUNCU)
        fr.paste(kare, (PX, PY), maske)
        # manşet bandı
        if manset_satir:
            bh = 30 + 58 * len(manset_satir)
            d.rounded_rectangle([PX + 20, PY + PH - bh - 20, PX + PW - 20, PY + PH - 20], radius=24, fill=(15, 8, 30))
            for j, s in enumerate(manset_satir):
                d.text((PX + 50, PY + PH - bh + 2 + j * 58), s, font=f_manset, fill=(255, 255, 255))

        # kayan yazı
        d.rectangle([0, 880, W, 936], fill=TURUNCU)
        tw = f_ticker.getlength(ticker)
        x0 = -((t * 220) % tw)
        while x0 < W:
            d.text((x0, 908), ticker, font=f_ticker, fill=(15, 8, 30), anchor="lm"); x0 += tw

        # tilki
        ses = zarf[i] if i < len(zarf) else 0.0
        agiz = 0 if ses < 0.12 else min(1, (ses - 0.12) * 1.5)
        agiz_k = int(round(agiz * 4))
        goz = 1.0
        for kz in kirp_zamanlari:
            if 0 <= t - kz < 0.16:
                goz = abs((t - kz) / 0.08 - 1)
        goz_k = int(round(goz * 2))
        anahtar = (agiz_k, goz_k)
        if anahtar not in kafa_onbellek:
            kafa_onbellek[anahtar] = tilki_kafa(agiz_k / 4, goz_k / 2)
        kafa = kafa_onbellek[anahtar]
        sallanma = math.sin(t * 2.2) * 6 + ses * 10
        aci = math.sin(t * 1.3) * 3 + (ses - 0.4) * 4
        kafa_r = kafa.rotate(aci, resample=Image.BICUBIC, center=(350, 560))
        gx, gy = 90, 1270 + int(math.sin(t * 2.2 + 0.6) * 4)
        fr.paste(govde, (gx, gy), govde)
        fr.paste(kafa_r, (gx + 100, gy - 330 + int(sallanma)), kafa_r)

        # masa
        d.rounded_rectangle([-20, 1690, W + 20, H + 40], radius=30, fill=(24, 18, 40))
        d.rectangle([0, 1690, W, 1702], fill=NEON)

        # altyazı
        for a, b, metin in altyazi:
            if a <= t < b:
                satirlar = sar(metin.upper(), f_alt, W - 140)
                for j, s in enumerate(satirlar):
                    yy = 1790 + j * 76 - (len(satirlar) - 1) * 38
                    d.text((W / 2, yy), s, font=f_alt, fill=(255, 230, 60), anchor="mm", stroke_width=8, stroke_fill=(10, 5, 20))
                break

        # kapanış: abone ol
        if t >= sure:
            k = min(1, (t - sure) / 0.35)
            bw, bh = int(620 * k), int(130 * k)
            if bw > 10:
                d.rounded_rectangle([W / 2 - bw / 2, 500 - bh / 2, W / 2 + bw / 2, 500 + bh / 2], radius=30, fill=(230, 20, 40))
                if k >= 1:
                    d.text((W / 2, 500), "ABONE OL", font=font(64), fill=(255, 255, 255), anchor="mm")
                    d.text((W / 2, 630), "Beğen • Yorum yap", font=f_manset, fill=(255, 255, 255), anchor="mm")

        ff.stdin.write(fr.tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg başarısız")
    print(f"OK {cikti} ({toplam:.1f} sn)")


if __name__ == "__main__":
    main()
