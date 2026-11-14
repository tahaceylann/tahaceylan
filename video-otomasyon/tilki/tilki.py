#!/usr/bin/env python3
"""Fox Bülten — gamer tilki sunuculu 2D dikey (1080x1920) haber videosu.

Kullanım:
    python3 tilki.py <senaryo.json> <ses.mp3> <cikti.mp4>

Senaryo (JSON):
{
  "manset": "Kısa başlık (panelin altında görünür)",
  "metin": "Seslendirilen metnin tamamı (altyazı için, [ses etiketleri] olmadan)",
  "gorseller": ["gorsel1.jpg", "gorsel2.png", ...]   # JSON dosyasına göre göreli yol olabilir; boş olabilir
}
Ses ElevenLabs bağlantısından üretilip indirilen mp3'tür. Ağız ve kaş animasyonu
sesin şiddetine göre, altyazılar metnin uzunluğuna göre zamanlanır.
"""
from __future__ import annotations

import json
import math
import random
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
SS = 2  # tilki çizimi için süper örnekleme

TURUNCU = (255, 122, 26)
TURUNCU_K = (214, 88, 10)
TURUNCU_A = (255, 160, 70)
KREM = (255, 240, 222)
KREM_K = (236, 214, 190)
KOYU = (28, 24, 38)
KOYU_A = (48, 42, 64)
PATI = (58, 36, 30)
NEON = (0, 255, 170)
MOR = (140, 60, 255)
PEMBE = (255, 70, 160)

# yerleşim
PX, PY, PW, PH = 70, 200, 940, 600     # haber paneli
TICKER_Y = 815                          # kayan yazı şeridi (56 px)
GX, GY = 90, 1180                       # tilki gövdesi sol üst
MASA_Y = 1690                           # masa üst kenarı
ALTYAZI_Y = 1845


def font(boyut: int) -> ImageFont.FreeTypeFont:
    for yol in (
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(yol).exists():
            return ImageFont.truetype(yol, boyut)
    return ImageFont.load_default()


# ---------------------------------------------------------------- ses analizi
def ses_zarfi(mp3: Path) -> tuple[np.ndarray, np.ndarray, float]:
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
    agiz = np.clip(np.convolve(rms, np.ones(2) / 2, mode="same"), 0, 1)
    # kaşlar için daha yavaş zarf (vurgulu yerlerde kalkar)
    yavas = np.convolve(rms, np.ones(12) / 12, mode="same")
    kas = np.clip((yavas - np.median(yavas)) * 2.2, 0, 1)
    return agiz, kas, sure


# ---------------------------------------------------------------- tilki çizimi
def P(*xy):
    """Koordinatları süper örnekleme ölçeğine çevirir."""
    return [v * SS for v in xy]


def tilki_govde() -> Image.Image:
    """Gövde: kuyruk, kapüşonlu, göğüs tüyü, kollar (kafa hariç). 900x900."""
    im = Image.new("RGBA", (900 * SS, 900 * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = SS
    # kuyruk (arkada, sağda)
    d.ellipse(P(600, 300, 900, 760), fill=TURUNCU)
    d.ellipse(P(640, 330, 880, 720), fill=TURUNCU_A)
    d.polygon(P(760, 300, 900, 330, 880, 470, 800, 440), fill=KREM)
    # kapüşon (boynun arkasında)
    d.ellipse(P(230, 200, 670, 360), fill=KOYU_A)
    # hoodie gövde
    d.rounded_rectangle(P(160, 260, 740, 900), radius=200 * s, fill=KOYU)
    # kollar (masaya doğru)
    d.rounded_rectangle(P(80, 360, 250, 900), radius=80 * s, fill=KOYU)
    d.rounded_rectangle(P(650, 360, 820, 900), radius=80 * s, fill=KOYU)
    for x in (95, 665):  # kol şeritleri
        d.line(P(x + 18, 420, x + 18, 900), fill=TURUNCU, width=10 * s)
        d.line(P(x + 40, 420, x + 40, 900), fill=TURUNCU, width=6 * s)
    # V yaka + kabarık göğüs tüyü
    d.polygon(P(320, 255, 580, 255, 450, 470), fill=KREM)
    d.polygon(P(380, 400, 405, 440, 430, 410, 450, 470, 470, 410, 495, 440, 520, 400), fill=KREM)
    d.polygon(P(330, 262, 360, 290, 345, 262), fill=KREM_K)
    # fermuar
    d.line(P(450, 470, 450, 900), fill=(90, 84, 110), width=6 * s)
    for y in range(480, 900, 22):
        d.line(P(443, y, 457, y), fill=(90, 84, 110), width=3 * s)
    # kapüşon ipleri
    for x0, x1 in ((380, 395), (520, 505)):
        d.line(P(x0, 300, x1, 560), fill=(230, 230, 240), width=7 * s)
        d.rounded_rectangle(P(x1 - 7, 555, x1 + 7, 590), radius=5 * s, fill=TURUNCU)
    # neon şeritler
    d.line(P(320, 262, 440, 520), fill=TURUNCU, width=14 * s)
    d.line(P(580, 262, 460, 520), fill=TURUNCU, width=14 * s)
    # göğüs logosu: PF (prensfox)
    d.rounded_rectangle(P(225, 345, 335, 415), radius=18 * s, outline=NEON, width=6 * s)
    d.text((280 * s, 380 * s), "PF", font=font(44 * s), fill=NEON, anchor="mm")
    return im.resize((900, 900), Image.LANCZOS)


def tilki_kafa(agiz: float, goz: float, kas: float) -> Image.Image:
    """agiz 0..1 açıklık, goz 1 açık..0 kapalı, kas 0 normal..1 kalkık. 700x700."""
    s = SS
    im = Image.new("RGBA", (700 * s, 700 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # kulaklar
    for kx in (1, -1):
        cx = 350 + kx * 165
        d.polygon(P(cx - 100, 255, cx + 100, 255, cx + kx * 40, 15), fill=TURUNCU)
        d.polygon(P(cx - 58, 245, cx + 58, 245, cx + kx * 32, 75), fill=KREM)
        # iç kulak tüyleri
        for j in range(4):
            bx = cx - 40 + j * 26
            d.line(P(bx, 245, bx + kx * 14, 175 - j * 6), fill=(255, 255, 255), width=5 * s)
        d.polygon(P(cx + kx * 16, 72, cx + kx * 64, 72, cx + kx * 40, 15), fill=KOYU)
    # küpe (sol kulak)
    d.ellipse(P(130, 200, 162, 232), outline=(220, 225, 235), width=6 * s)
    # alt gölge + baş
    d.ellipse(P(108, 168, 592, 572), fill=TURUNCU_K)
    d.ellipse(P(112, 150, 588, 555), fill=TURUNCU)
    # tepe perçemi
    d.polygon(P(285, 175, 305, 95, 335, 160, 360, 80, 385, 160, 420, 105, 415, 180), fill=TURUNCU)
    d.polygon(P(330, 175, 360, 110, 375, 170), fill=TURUNCU_A)
    # alın işareti
    d.polygon(P(330, 235, 370, 235, 350, 290), fill=TURUNCU_K)
    # kabarık yanak tüyleri (zikzak)
    d.polygon(P(125, 360, 30, 440, 110, 455, 40, 515, 140, 515, 120, 570, 230, 560), fill=TURUNCU)
    d.polygon(P(575, 360, 670, 440, 590, 455, 660, 515, 560, 515, 580, 570, 470, 560), fill=TURUNCU)
    # krem ağız/yanak bölgesi (zikzak kenarlı)
    d.polygon(P(140, 415, 260, 360, 350, 335, 440, 360, 560, 415, 520, 470, 545, 500, 470, 590,
                350, 645, 230, 590, 155, 500, 180, 470), fill=KREM)
    # gözler
    for gx in (255, 445):
        acik = max(0.06, goz)
        yy = 100 * acik
        d.ellipse(P(gx - 52, 335 - yy / 2 - 3, gx + 52, 335 + yy / 2 + 3), fill=KOYU)
        d.ellipse(P(gx - 48, 335 - yy / 2, gx + 48, 335 + yy / 2), fill=(255, 255, 255))
        if goz > 0.25:
            ix = gx + (6 if gx < 350 else -2)
            d.ellipse(P(ix - 32, 335 - yy / 2.5, ix + 32, 335 + yy / 2.5), fill=(20, 170, 110))
            d.ellipse(P(ix - 24, 335 - yy / 3.5, ix + 24, 335 + yy / 3.5), fill=(40, 220, 140))
            d.ellipse(P(ix - 14, 335 - yy / 5, ix + 14, 335 + yy / 5), fill=(12, 12, 18))
            d.ellipse(P(ix + 4, 318, ix + 20, 334), fill=(255, 255, 255))
            d.ellipse(P(ix - 18, 342, ix - 10, 350), fill=(255, 255, 255))
            # yarı kapalı "havalı" göz kapağı
            kapak = 335 - yy / 2 + yy * (0.28 - 0.18 * kas)
            d.chord(P(gx - 54, 335 - yy / 2 - 30, gx + 54, kapak + 12), 180, 360, fill=TURUNCU)
            d.line(P(gx - 50, kapak, gx + 50, kapak), fill=KOYU, width=6 * s)
        # kaşlar
        yon = 1 if gx < 350 else -1
        ky = 262 - 26 * kas
        d.line(P(gx - 55, ky - yon * 8, gx + 50, ky + yon * 10), fill=TURUNCU_K, width=18 * s)
        d.line(P(gx - 55, ky - yon * 8, gx + 50, ky + yon * 10), fill=(120, 50, 10), width=6 * s)
    # burun
    d.polygon(P(312, 445, 388, 445, 350, 492), fill=KOYU)
    d.ellipse(P(312, 432, 388, 470), fill=KOYU)
    d.ellipse(P(330, 440, 352, 452), fill=(130, 120, 140))
    # bıyık noktaları
    for bx, by in ((270, 505), (250, 525), (280, 535), (430, 505), (450, 525), (420, 535)):
        d.ellipse(P(bx - 5, by - 5, bx + 5, by + 5), fill=KREM_K)
    # ağız
    ah = 12 + 100 * agiz
    if agiz < 0.06:
        # sırıtma: bir taraf yukarı + sivri diş
        d.line(P(350, 492, 350, 512), fill=KOYU, width=6 * s)
        d.arc(P(290, 470, 352, 530), 20, 160, fill=KOYU, width=7 * s)
        d.arc(P(348, 455, 420, 525), 10, 150, fill=KOYU, width=7 * s)
        d.polygon(P(392, 518, 404, 516, 397, 538), fill=(255, 255, 255))
    else:
        d.line(P(350, 490, 350, 505), fill=KOYU, width=6 * s)
        d.rounded_rectangle(P(298, 505, 402, 505 + ah), radius=int(min(48, ah / 2) * s), fill=(70, 18, 30))
        if ah > 38:
            d.ellipse(P(315, 505 + ah * 0.5, 385, 505 + ah + 12), fill=(255, 105, 125))
        d.rectangle(P(312, 505, 388, 518), fill=(255, 255, 255))
        d.polygon(P(380, 515, 392, 515, 386, 535), fill=(255, 255, 255))  # sivri diş
    # kulaklık
    d.arc(P(90, 85, 610, 525), 190, 350, fill=(40, 40, 52), width=36 * s)
    d.arc(P(98, 93, 602, 517), 200, 340, fill=MOR, width=6 * s)
    for kx in (95, 605):
        d.rounded_rectangle(P(kx - 48, 265, kx + 48, 425), radius=36 * s, fill=(40, 40, 52))
        d.rounded_rectangle(P(kx - 32, 295, kx + 32, 395), radius=24 * s, outline=NEON, width=9 * s)
        d.ellipse(P(kx - 10, 335, kx + 10, 355), fill=NEON)
    # mikrofon kolu
    d.line(P(105, 405, 150, 560, 270, 595), fill=(40, 40, 52), width=16 * s, joint="curve")
    d.ellipse(P(250, 568, 306, 624), fill=(40, 40, 52))
    d.ellipse(P(262, 580, 294, 612), fill=(70, 70, 86))
    d.ellipse(P(271, 589, 285, 603), fill=PEMBE)
    return im.resize((700, 700), Image.LANCZOS)


def masa_ustu() -> Image.Image:
    """Masa üstü: RGB klavye, patiler, enerji içeceği, mouse. Tam genişlik, y=MASA_Y-60'tan başlar."""
    h = 130
    im = Image.new("RGBA", (W * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = SS
    o = 60  # masa kenarının bu katmandaki y'si
    # klavye (perspektifli)
    d.polygon(P(330, o + 8, 750, o + 8, 790, o + 58, 290, o + 58), fill=(22, 20, 30))
    renk = [(255, 60, 90), (255, 160, 40), (60, 230, 120), (40, 170, 255), (160, 80, 255)]
    for r in range(3):
        y = o + 15 + r * 14
        sol = 338 - r * 12
        sag = 742 + r * 12
        n = 14
        w = (sag - sol) / n
        for k in range(n):
            c = renk[(k + r) % len(renk)]
            d.rounded_rectangle(P(sol + k * w + 2, y, sol + (k + 1) * w - 3, y + 10), radius=2 * s, fill=c)
    # patiler (kolların ucu)
    for cx in (255, 825):
        d.ellipse(P(cx - 62, o - 22, cx + 62, o + 48), fill=PATI)
        for j in (-34, 0, 34):
            d.ellipse(P(cx + j - 16, o + 22, cx + j + 16, o + 50), fill=(80, 52, 44))
    # enerji içeceği
    d.rounded_rectangle(P(930, o - 70, 1000, o + 50), radius=12 * s, fill=(20, 20, 26))
    d.rectangle(P(930, o - 40, 1000, o + 20), fill=NEON)
    d.text((965 * s, o * s - 10 * s), "FOX", font=font(22 * s), fill=(15, 8, 30), anchor="mm")
    d.ellipse(P(932, o - 78, 998, o - 62), fill=(170, 170, 180))
    # mouse
    d.ellipse(P(60, o + 5, 130, o + 55), fill=(22, 20, 30))
    d.line(P(95, o + 10, 95, o + 28), fill=PEMBE, width=4 * s)
    return im.resize((W, h), Image.LANCZOS)


# ---------------------------------------------------------------- sahne
def arka_plan() -> Image.Image:
    y = np.linspace(0, 1, H)[:, None]
    ust = np.array([18, 10, 40]); alt = np.array([60, 10, 70])
    g = (ust * (1 - y) + alt * y).astype(np.uint8)
    im = Image.fromarray(np.repeat(g[:, None, :], W, axis=1).reshape(H, W, 3))
    d = ImageDraw.Draw(im)
    for x in range(0, W + 1, 90):  # neon ızgara
        d.line([(x, 880), (W / 2 + (x - W / 2) * 2.2, H)], fill=(80, 40, 140), width=2)
    for yy in [880, 930, 1000, 1100, 1240, 1440]:
        d.line([(0, yy), (W, yy)], fill=(80, 40, 140), width=2)
    return im


def gorsel_yukle(yol: Path, w: int, h: int) -> Image.Image:
    im = Image.open(yol).convert("RGB")
    oran = max(w * 1.15 / im.width, h * 1.15 / im.height)
    return im.resize((int(im.width * oran) + 1, int(im.height * oran) + 1), Image.LANCZOS)


GECIS = 0.5  # saniye


def ease_out_back(x: float) -> float:
    c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def ease_in_out(x: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ken_burns(g: Image.Image, yerel: float) -> Image.Image:
    z = 1.0 + 0.12 * yerel
    cw, ch = int(PW * 1.15 / z), int(PH * 1.15 / z)
    ox = int((g.width - cw) * (0.3 + 0.4 * yerel)); oy = int((g.height - ch) / 2)
    return g.crop((ox, oy, ox + cw, oy + ch)).resize((PW, PH), Image.BILINEAR)


def gecis(a: Image.Image, b: Image.Image, p: float, tur: int) -> Image.Image:
    """İki kare arasında geçiş. tur 0: kaydırma, 1: dairesel açılış, 2: glitch + flaş."""
    if tur == 0:
        e = ease_in_out(p)
        out = Image.new("RGB", (PW, PH))
        dx = int(e * PW)
        out.paste(a, (-dx, 0)); out.paste(b, (PW - dx, 0))
        ImageDraw.Draw(out).rectangle([PW - dx - 6, 0, PW - dx + 6, PH], fill=NEON)
        return out
    if tur == 1:
        e = ease_in_out(p)
        r = e * math.hypot(PW, PH) / 2
        m = Image.new("L", (PW, PH), 0)
        ImageDraw.Draw(m).ellipse([PW / 2 - r, PH / 2 - r, PW / 2 + r, PH / 2 + r], fill=255)
        out = Image.composite(b, a, m)
        ImageDraw.Draw(out).ellipse([PW / 2 - r, PH / 2 - r, PW / 2 + r, PH / 2 + r], outline=TURUNCU, width=10)
        return out
    # glitch
    kaynak = a if p < 0.5 else b
    out = kaynak.copy()
    rnd = random.Random(int(p * 1000))
    siddet = 1 - abs(p - 0.5) * 2
    for _ in range(int(10 * siddet) + 1):
        y = rnd.randrange(0, PH - 20); h = rnd.randrange(8, 60)
        dx = rnd.randint(-80, 80)
        out.paste(kaynak.crop((0, y, PW, min(PH, y + h))), (dx, y))
    r, g, bb = out.split()
    out = Image.merge("RGB", (r.transform(out.size, Image.AFFINE, (1, 0, -int(14 * siddet), 0, 1, 0)), g,
                              bb.transform(out.size, Image.AFFINE, (1, 0, int(14 * siddet), 0, 1, 0))))
    if 0.4 < p < 0.6:
        out = Image.blend(out, Image.new("RGB", out.size, (255, 255, 255)), 0.6)
    return out


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


def altyazi_parcalari(metin: str, sure: float) -> list[tuple[float, float, str]]:
    metin = re.sub(r"\[[^\]]*\]", " ", metin)
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
    zarf, kas_zarf, sure = ses_zarfi(mp3)
    son_ek = 2.2  # abone ol kapanışı için ek süre
    toplam = sure + son_ek
    n = int(toplam * FPS)

    bg = arka_plan()
    govde = tilki_govde()
    masa = masa_ustu()
    kafa_onbellek: dict[tuple[int, int, int], Image.Image] = {}

    gorseller = []
    for g in sen.get("gorseller", []):
        p = Path(g) if Path(g).is_absolute() else senaryo_yolu.parent / g
        if p.exists():
            gorseller.append(gorsel_yukle(p, PW, PH))
    gorselsiz = not gorseller
    if gorselsiz:
        gorseller = [baslik_karti(PW, PH, sen.get("manset", "Fox Bülten"))]
    maske = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, PW, PH], radius=36, fill=255)

    altyazi = altyazi_parcalari(sen.get("metin", ""), sure)
    f_logo, f_manset, f_alt, f_ticker = font(64), font(46), font(58), font(34)
    manset_satir = [] if gorselsiz else sar(sen.get("manset", ""), f_manset, PW - 60)[:2]
    ticker = "  •  ".join(["SON DAKİKA", "FOX BÜLTEN", sen.get("manset", "")]) + "  •  "

    font_onbellek: dict[int, ImageFont.FreeTypeFont] = {}
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
        d.rectangle([0, 0, W, 165], fill=(15, 8, 30))
        d.text((70, 88), "FOX", font=f_logo, fill=TURUNCU, anchor="lm")
        d.text((70 + f_logo.getlength("FOX "), 88), "BÜLTEN", font=f_logo, fill=(255, 255, 255), anchor="lm")
        if int(t * 2) % 2 == 0:
            d.ellipse([W - 230, 74, W - 202, 102], fill=(255, 50, 70))
        d.text((W - 190, 88), "CANLI", font=f_ticker, fill=(255, 255, 255), anchor="lm")

        # haber paneli: görseller sırayla, Ken Burns + animasyonlu geçişler
        dilim = max(sure, 0.1) / len(gorseller)
        idx = min(int(t / dilim), len(gorseller) - 1)
        yerel = min(1.0, (t - idx * dilim) / dilim)
        kare = ken_burns(gorseller[idx], yerel)
        gecen = t - idx * dilim
        if idx > 0 and gecen < GECIS:
            p = gecen / GECIS
            onceki = ken_burns(gorseller[idx - 1], 1.0)
            kare = gecis(onceki, kare, p, (idx - 1) % 3)
        # giriş: panel yukarıdan kayarak gelir
        giris = ease_out_back(min(1.0, t / 0.55))
        py = int(PY - (1 - giris) * (PY + PH + 40))
        d.rounded_rectangle([PX - 8, py - 8, PX + PW + 8, py + PH + 8], radius=44, fill=NEON if idx % 2 == 0 else TURUNCU)
        fr.paste(kare, (PX, py), maske)
        if manset_satir:
            bh = 30 + 58 * len(manset_satir)
            mx = int((1 - ease_out_back(min(1.0, max(0.0, (t - 0.4) / 0.5)))) * -W)
            d.rounded_rectangle([PX + 20 + mx, py + PH - bh - 20, PX + PW - 20 + mx, py + PH - 20], radius=24, fill=(15, 8, 30))
            for j, s in enumerate(manset_satir):
                d.text((PX + 50 + mx, py + PH - bh + 2 + j * 58), s, font=f_manset, fill=(255, 255, 255))

        # kayan yazı
        d.rectangle([0, TICKER_Y, W, TICKER_Y + 56], fill=TURUNCU)
        tw = f_ticker.getlength(ticker)
        x0 = -((t * 220) % tw)
        d.text((x0, TICKER_Y + 28), ticker * (int(W / tw) + 3), font=f_ticker, fill=(15, 8, 30), anchor="lm")

        # tilki
        ses = zarf[i] if i < len(zarf) else 0.0
        kas = kas_zarf[i] if i < len(kas_zarf) else 0.0
        agiz = 0 if ses < 0.12 else min(1, (ses - 0.12) * 1.5)
        goz = 1.0
        for kz in kirp_zamanlari:
            if 0 <= t - kz < 0.16:
                goz = abs((t - kz) / 0.08 - 1)
        anahtar = (int(round(agiz * 4)), int(round(goz * 2)), int(round(kas * 2)))
        if anahtar not in kafa_onbellek:
            kafa_onbellek[anahtar] = tilki_kafa(anahtar[0] / 4, anahtar[1] / 2, anahtar[2] / 2)
        kafa = kafa_onbellek[anahtar]
        sallanma = math.sin(t * 2.2) * 6 + ses * 10
        aci = math.sin(t * 1.3) * 3 + (ses - 0.4) * 4
        kafa_r = kafa.rotate(aci, resample=Image.BICUBIC, center=(350, 560))
        gy = GY + int(math.sin(t * 2.2 + 0.6) * 4) + int((1 - ease_out_back(min(1.0, max(0.0, (t - 0.15) / 0.6)))) * 900)
        fr.paste(govde, (GX, gy), govde)
        fr.paste(kafa_r, (GX + 100, gy - 330 + int(sallanma)), kafa_r)

        # masa + masa üstü
        d.rounded_rectangle([-20, MASA_Y, W + 20, H + 40], radius=30, fill=(24, 18, 40))
        d.rectangle([0, MASA_Y, W, MASA_Y + 12], fill=NEON)
        fr.paste(masa, (0, MASA_Y - 60), masa)

        # altyazı
        for a, b, metin in altyazi:
            if a <= t < b:
                pop = ease_out_back(min(1.0, (t - a) / 0.16))
                boy = max(20, int(58 * (0.6 + 0.4 * pop)))
                fa = font_onbellek.setdefault(boy, font(boy))
                satirlar = sar(metin.upper(), f_alt, W - 120)
                for j, s in enumerate(satirlar):
                    yy = ALTYAZI_Y + j * 70 - (len(satirlar) - 1) * 35
                    d.text((W / 2, yy), s, font=fa, fill=(255, 230, 60), anchor="mm", stroke_width=8, stroke_fill=(10, 5, 20))
                break

        # kapanış: abone ol
        if t >= sure:
            k = min(1, (t - sure) / 0.35)
            bw, bh = int(620 * k), int(130 * k)
            if bw > 10:
                cy = PY + PH / 2 - 40
                d.rounded_rectangle([W / 2 - bw / 2, cy - bh / 2, W / 2 + bw / 2, cy + bh / 2], radius=30, fill=(230, 20, 40))
                if k >= 1:
                    d.text((W / 2, cy), "ABONE OL", font=font(64), fill=(255, 255, 255), anchor="mm")
                    d.text((W / 2, cy + 130), "Beğen • Yorum yap", font=f_manset, fill=(255, 255, 255), anchor="mm",
                           stroke_width=6, stroke_fill=(10, 5, 20))

        ff.stdin.write(fr.tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg başarısız")
    print(f"OK {cikti} ({toplam:.1f} sn)")


if __name__ == "__main__":
    main()
