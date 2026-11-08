#!/usr/bin/env python3
"""Tilki Haber: oyun haberi senaryosu -> ElevenLabs seslendirme -> tilki animasyonu -> 1080x1920 Shorts MP4.

Kullanım (repo kökünden):
  python3 video-otomasyon/tilki/uret.py <bolum>/senaryo.json              # ElevenLabs ile yayına hazır video
  python3 video-otomasyon/tilki/uret.py <bolum>/senaryo.json --onizleme   # yerel espeak-ng sesiyle TASLAK (yayına uygun değil)
  python3 video-otomasyon/tilki/uret.py <bolum>/senaryo.json --metin      # seslendirilecek metinler + süre tahmini
  python3 video-otomasyon/tilki/uret.py <bolum>/senaryo.json --ses-ekle 3 indirilen.mp3
                                                                          # ElevenLabs bağlayıcısından gelen sahne sesini kaydet
  python3 video-otomasyon/tilki/uret.py <bolum>/senaryo.json --telaffuz   # ElevenLabs STT ile ad telaffuzu kontrolü

Sahne sesi önceliği: <bolum>/ses/sahneNN.mp3 (metni eşleşiyorsa) > ElevenLabs API > (--onizleme) espeak-ng.
Gerekenler: Python 3.9+, numpy, Pillow, ffmpeg/ffprobe, Node + Playwright (Chromium). espeak-ng yalnızca önizleme için.
"""
from __future__ import annotations

import argparse
import base64
import contextlib
import difflib
import hashlib
import io
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import wave
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

KOK = Path(__file__).resolve().parent
RENDER = KOK / "render"
FPS = 30
SR = 44100
PAY_BAS = 0.12      # video başladıktan sonra ilk kelimeye kadar (kanca hemen gelsin)
ARA = 0.12          # sahneler arası nefes (sahne sesleri ayrıca kırpılır)
KAPANIS_EK = 1.2    # son cümleden sonra tilkinin el salladığı kapanış
UNLU = set("aeıioöuüâîû")
NOKTALAMA = ",.!?;:…"
ELEVEN = "https://api.elevenlabs.io"


def hata(mesaj: str, kod: int = 1) -> None:
    print(f"\nHATA: {mesaj}", file=sys.stderr)
    sys.exit(kod)


def uyar(liste: list, mesaj: str) -> None:
    liste.append(mesaj)
    print(f"  ⚠ {mesaj}")


def calistir(komut: list[str], **kw) -> subprocess.CompletedProcess:
    sonuc = subprocess.run(komut, capture_output=True, text=True, **kw)
    if sonuc.returncode != 0:
        print(sonuc.stdout[-2000:], sonuc.stderr[-3000:], file=sys.stderr)
        hata(f"komut başarısız: {' '.join(komut[:3])} …")
    return sonuc


def sure_olc(dosya: Path) -> float:
    return float(calistir(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                           "-of", "default=nw=1:nk=1", str(dosya)]).stdout.strip())


def kucuk(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def normal(s: str) -> str:
    return re.sub(r"[^\wçğıöşü]+", "", kucuk(s))


# ------------------------------------------------------------------ ayarlar & telaffuz

def ayarlari_yukle() -> dict:
    return json.loads((KOK / "ayarlar.json").read_text(encoding="utf-8"))


def sozluk_yukle(senaryo: dict) -> dict:
    d = {}
    yol = KOK / "telaffuz.json"
    if yol.exists():
        d = {k: v for k, v in json.loads(yol.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    d.update(senaryo.get("telaffuz", {}))
    return d


def telaffuz_uygula(metin: str, sozluk: dict) -> tuple[str, list]:
    """Ekran metnini seslendirme metnine çevirir; karakter eşlemesi için aralıkları döndürür."""
    if not sozluk:
        return metin, [(0, len(metin), 0, len(metin))]
    anahtarlar = sorted(sozluk, key=len, reverse=True)
    desen = re.compile("|".join(rf"(?<!\w){re.escape(k)}(?!\w)" for k in anahtarlar))
    parca, araliklar, i, o = [], [], 0, 0
    for m in desen.finditer(metin):
        if m.start() > i:
            seg = metin[i:m.start()]
            araliklar.append((i, m.start(), o, o + len(seg)))
            parca.append(seg)
            o += len(seg)
        yeni = sozluk[m.group(0)]
        araliklar.append((m.start(), m.end(), o, o + len(yeni)))
        parca.append(yeni)
        o += len(yeni)
        i = m.end()
    if i < len(metin) or not araliklar:
        seg = metin[i:]
        araliklar.append((i, len(metin), o, o + len(seg)))
        parca.append(seg)
    return "".join(parca), araliklar


def d2t(araliklar: list, d: int) -> float:
    for d0, d1, t0, t1 in araliklar:
        if d0 <= d <= d1:
            return t0 + (d - d0) * (t1 - t0) / max(1, d1 - d0)
    return araliklar[-1][3]


# ------------------------------------------------------------------ ses

def ses_oku(dosya: Path) -> np.ndarray:
    ham = subprocess.run(["ffmpeg", "-v", "error", "-i", str(dosya), "-f", "s16le", "-ac", "1",
                          "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(ham, dtype=np.int16).astype(np.float32) / 32768.0


def model_dil_destekli(model: str) -> bool:
    return any(x in model for x in ("v2_5", "flash", "turbo"))


def eleven_istek(yol: str, govde: bytes, basliklar: dict, zaman_asimi: int = 180) -> bytes:
    anahtar = os.environ.get("ELEVENLABS_API_KEY") or "proxy-tarafindan-eklenir"
    istek = urllib.request.Request(ELEVEN + yol, data=govde, method="POST",
                                   headers={"xi-api-key": anahtar, **basliklar})
    for deneme in range(4):
        try:
            with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
                return yanit.read()
        except urllib.error.HTTPError as e:
            ayrinti = e.read().decode(errors="replace")[:600]
            if e.code in (429, 500, 502, 503) and deneme < 3:
                time.sleep(2 ** (deneme + 1))
                continue
            if e.code == 401 and "missing_permissions" in ayrinti:
                hata("ElevenLabs anahtarında bu işlem için izin yok. elevenlabs.io → API Keys → anahtarı düzenle → "
                     "'Text to Speech' ve 'Speech to Text' izinlerini aç. " + ayrinti)
            if e.code == 402:
                hata("ElevenLabs planı bu sesi API'de kullanmaya izin vermiyor (ücretsiz plan kütüphane seslerini "
                     "kapatır). Planı yükseltin ya da ayarlar.json'da hazır bir ses seçin. " + ayrinti)
            if e.code == 401:
                hata("ElevenLabs anahtarı yok/geçersiz (401). Ortamın 'network secrets' kısmına "
                     "api.elevenlabs.io için xi-api-key ekleyin ya da ELEVENLABS_API_KEY tanımlayın. " + ayrinti)
            hata(f"ElevenLabs {e.code}: {ayrinti}")
        except urllib.error.URLError as e:
            if "403" in str(e.reason) or "Tunnel" in str(e.reason):
                hata("api.elevenlabs.io'ya ağ izni yok (proxy 403). README > Kurulum > Ağ adımına bakın, "
                     "ya da sesi ElevenLabs bağlayıcısıyla üretip --ses-ekle ile kaydedin.")
            if deneme < 3:
                time.sleep(2 ** (deneme + 1))
                continue
            hata(f"ElevenLabs'e ulaşılamadı: {e.reason}")
    hata("ElevenLabs isteği tekrar denemelerde başarısız oldu.")
    return b""


def elevenlabs_tts(metin: str, ses: dict, onceki: str, sonraki: str) -> tuple[bytes, dict]:
    model = ses.get("model_id", "eleven_multilingual_v2")
    govde = {
        "text": metin,
        "model_id": model,
        "voice_settings": {
            "stability": ses.get("stability", 0.4),
            "similarity_boost": ses.get("similarity_boost", 0.8),
            "style": ses.get("style", 0.4),
            "use_speaker_boost": True,
            "speed": ses.get("speed", 1.0),
        },
    }
    if onceki:
        govde["previous_text"] = onceki
    if sonraki:
        govde["next_text"] = sonraki
    if ses.get("seed") is not None:
        govde["seed"] = ses["seed"]
    if model_dil_destekli(model):
        govde["language_code"] = "tr"
    yanit = eleven_istek(f"/v1/text-to-speech/{ses['voice_id']}/with-timestamps?output_format=mp3_44100_128",
                         json.dumps(govde).encode(), {"Content-Type": "application/json"})
    veri = json.loads(yanit)
    hiz = veri.get("alignment") or veri.get("normalized_alignment")
    hizalama = None
    if hiz:
        hizalama = {"c": hiz["characters"], "b": hiz["character_start_times_seconds"],
                    "s": hiz["character_end_times_seconds"]}
    return base64.b64decode(veri["audio_base64"]), hizalama


def elevenlabs_stt(dosya: Path) -> str:
    sinir = uuid.uuid4().hex
    parcalar = []
    for ad, deger in (("model_id", "scribe_v1"), ("language_code", "tr")):
        parcalar.append(f'--{sinir}\r\nContent-Disposition: form-data; name="{ad}"\r\n\r\n{deger}\r\n'.encode())
    parcalar.append(f'--{sinir}\r\nContent-Disposition: form-data; name="file"; filename="{dosya.name}"\r\n'
                    f'Content-Type: audio/mpeg\r\n\r\n'.encode() + dosya.read_bytes() + b"\r\n")
    parcalar.append(f"--{sinir}--\r\n".encode())
    yanit = eleven_istek("/v1/speech-to-text", b"".join(parcalar),
                         {"Content-Type": f"multipart/form-data; boundary={sinir}"})
    return json.loads(yanit).get("text", "")


def dinleme_kontrolu(bolum: Path, ttsler: list, uyarilar: list) -> None:
    """Her sahne sesini ElevenLabs STT ile yazıya döker ve senaryodaki metinle kelime kelime karşılaştırır.

    "gigabayt diyor" → "gidiyor" gibi yutulan/birleşen kelimeleri yakalar. Sonuç ses dosyasının meta
    dosyasında saklanır (aynı ses için tekrar ücret ödenmez). İzin yoksa uyarı verir, üretimi durdurmaz.
    """
    for i, (tts, _) in enumerate(ttsler, 1):
        mp3, meta_yolu = bolum / "ses" / f"sahne{i:02d}.mp3", bolum / "ses" / f"sahne{i:02d}.json"
        if not mp3.exists():
            continue
        meta = json.loads(meta_yolu.read_text(encoding="utf-8")) if meta_yolu.exists() else {}
        imza = hashlib.sha1(mp3.read_bytes()).hexdigest()[:12]
        if meta.get("stt_imza") != imza:
            try:
                with contextlib.redirect_stderr(io.StringIO()):
                    meta["stt"] = elevenlabs_stt(mp3)
            except SystemExit:
                uyar(uyarilar, "dinleme kontrolü yapılamadı: anahtarda Speech-to-Text izni yok (elevenlabs.io → "
                               "API Keys → anahtarı düzenle → Speech to Text)")
                return
            meta["stt_imza"] = imza
            meta_yolu.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        beklenen = [normal(w) for w in tts.split() if normal(w)]
        duyulan = [normal(w) for w in meta["stt"].split() if normal(w)]
        sm = difflib.SequenceMatcher(None, beklenen, duyulan, autojunk=False)
        for op, a0, a1, b0, b1 in sm.get_opcodes():
            if op == "equal":
                continue
            b, d = " ".join(beklenen[a0:a1]), " ".join(duyulan[b0:b1])
            if difflib.SequenceMatcher(None, b.replace(" ", ""), d.replace(" ", "")).ratio() >= 0.85:
                continue  # yazım farkı (ör. rakam/harf), söyleyiş doğru
            uyar(uyarilar, f"sahne {i}: beklenen «{b or '—'}», duyulan «{d or '—'}»")


def espeak_sesi(metin: str, hedef: Path) -> None:
    if not shutil.which("espeak-ng"):
        hata("Önizleme için espeak-ng gerekli (apt-get install -y espeak-ng).")
    calistir(["espeak-ng", "-v", "tr", "-s", "168", "-p", "58", "-w", str(hedef), metin])


def ozet(*parcalar) -> str:
    return hashlib.sha1(json.dumps(parcalar, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]


def sahne_sesi(bolum: Path, no: int, tts: str, ses: dict, onceki: str, sonraki: str,
               onizleme: bool, calisma: Path) -> tuple[Path, dict | None, str]:
    if onizleme:
        hedef = calisma / f"onizleme{no:02d}.wav"
        espeak_sesi(tts, hedef)
        return hedef, None, "espeak-ng (önizleme)"
    klasor = bolum / "ses"
    klasor.mkdir(exist_ok=True)
    mp3, meta = klasor / f"sahne{no:02d}.mp3", klasor / f"sahne{no:02d}.json"
    if mp3.exists():
        m = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}
        if m.get("metin", tts) == tts and m.get("voice_id", ses["voice_id"]) == ses["voice_id"]:
            if m.get("kaynak") != "api" or m.get("ozet") == ozet(tts, ses) or not m.get("ozet"):
                return mp3, m.get("hizalama"), m.get("kaynak", "dosya")
        print(f"  sahne {no}: metin/ses değişmiş, yeniden seslendiriliyor")
    print(f"  sahne {no}: ElevenLabs seslendiriyor…")
    ses_baytlari, hizalama = elevenlabs_tts(tts, ses, onceki, sonraki)
    mp3.write_bytes(ses_baytlari)
    meta.write_text(json.dumps({"metin": tts, "voice_id": ses["voice_id"], "model_id": ses.get("model_id"),
                                "kaynak": "api", "ozet": ozet(tts, ses),
                                "tarih": datetime.now().isoformat(timespec="seconds"),
                                "hizalama": hizalama}, ensure_ascii=False), encoding="utf-8")
    return mp3, hizalama, "api"


# ------------------------------------------------------------------ hizalama (zaman damgası yoksa tahmin)

def zarf(x: np.ndarray, adim: float = 0.01) -> np.ndarray:
    n = int(SR * adim)
    k = len(x) // n
    if k == 0:
        return np.zeros(1)
    return np.sqrt(np.mean(x[: k * n].reshape(k, n) ** 2, axis=1) + 1e-12)


def konusma_maskesi(rms: np.ndarray) -> np.ndarray:
    esik = max(0.006, 0.14 * float(np.percentile(rms, 95)))
    m = rms > esik
    # kısa boşlukları doldur (<60 ms), kısa çıtırtıları at (<40 ms)
    for deger, en_az in ((False, 6), (True, 4)):
        i = 0
        while i < len(m):
            if m[i] == deger:
                j = i
                while j < len(m) and m[j] == deger:
                    j += 1
                if j - i < en_az and i > 0 and j < len(m):
                    m[i:j] = not deger
                i = j
            else:
                i += 1
    return m


def sessizlik_kirp(x: np.ndarray, hiz: dict | None, en_uzun: float = 0.3, bas_pay: float = 0.03,
                   son_pay: float = 0.1, kelime_arasi: float = 0.08) -> tuple[np.ndarray, dict | None]:
    """Baştaki/sondaki sessizliği atar, duraklamaları sınırlar ve hizalamayı kaydırır.

    Noktalamalı yerlerde en_uzun, noktalamasız kelime aralarında kelime_arasi saniye kalır
    (ör. "Geta … Altı" arasındaki gereksiz bekleme). Kelime içi sessizliklere dokunulmaz.
    """
    adim = 0.01
    araliklar = []  # (başlangıç, bitiş, noktalamalı mı) — hizalamaya göre iki kelime arası
    if hiz:
        c, b, s_ = hiz["c"], hiz["b"], hiz["s"]
        for k in range(1, len(c) - 1):
            if c[k].isspace() and not c[k + 1].isspace():
                j = k - 1
                while j >= 0 and c[j].isspace():
                    j -= 1
                if j >= 0:
                    araliklar.append((s_[j] - 0.06, b[k + 1] + 0.06, c[j] in NOKTALAMA + "-—"))
    m = konusma_maskesi(zarf(x, adim))
    if not m.any():
        return x, hiz
    ilk, son = int(np.argmax(m)), len(m) - int(np.argmax(m[::-1]))
    sure = len(x) / SR
    kesik = [(0.0, max(0.0, ilk * adim - bas_pay))]
    i = ilk
    while i < son:
        if m[i]:
            i += 1
            continue
        j = i
        while j < son and not m[j]:
            j += 1
        orta, sinir = (i + j) / 2 * adim, en_uzun
        for g0, g1, noktalamali in araliklar:
            if g0 <= orta <= g1:
                sinir = en_uzun if noktalamali else kelime_arasi
                break
        if (j - i) * adim > sinir:
            r0 = i * adim + sinir / 2
            kesik.append((r0, r0 + (j - i) * adim - sinir))
        i = j
    kesik.append((min(sure, son * adim + son_pay), sure))
    kesik = [(a, b) for a, b in kesik if b - a > 0.005]
    parcalar, onceki = [], 0.0
    for a, b in kesik:
        parcalar.append(x[int(onceki * SR):int(a * SR)])
        onceki = b
    parcalar.append(x[int(onceki * SR):])
    y = np.concatenate(parcalar) if parcalar else x

    def esle(t: float) -> float:
        cikan = 0.0
        for a, b in kesik:
            if t >= b:
                cikan += b - a
            elif t > a:
                return a - cikan
        return t - cikan

    if hiz:
        hiz = {"c": hiz["c"], "b": [max(0.0, esle(t)) for t in hiz["b"]], "s": [max(0.0, esle(t)) for t in hiz["s"]]}
    return y, hiz


def tempo_ayarla(x: np.ndarray, tts: str, hiz: dict | None, hedef: float, en_fazla: float) -> tuple[np.ndarray, dict | None, float]:
    """Sahneyi saniyede `hedef` heceye yaklaştırır (yalnızca hızlandırır, ses perdesi korunur)."""
    hece = sum(1 for ch in kucuk(tts) if ch in UNLU) or 1
    oran = min(en_fazla, max(1.0, hedef / (hece / max(0.3, len(x) / SR))))
    if oran < 1.02:
        return x, hiz, 1.0
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    cikis = subprocess.run(["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                            "-filter:a", f"atempo={oran:.4f}", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-"],
                           input=pcm, capture_output=True, check=True).stdout
    y = np.frombuffer(cikis, dtype=np.int16).astype(np.float32) / 32768.0
    if hiz:
        hiz = {"c": hiz["c"], "b": [t / oran for t in hiz["b"]], "s": [t / oran for t in hiz["s"]]}
    return y, hiz, oran


def harf_agirligi(ch: str) -> float:
    c = kucuk(ch)
    if c in UNLU:
        return 1.0
    if c.isalpha() or c.isdigit():
        return 0.5
    return 0.0


def hizala_tahmin(tts: str, x: np.ndarray) -> dict:
    """Türkçede her hece bir ünlü taşır: ünlü ağırlıklarını ses zarfındaki konuşma bölgelerine dağıtır."""
    rms = zarf(x)
    m = konusma_maskesi(rms)
    adim = 0.01
    if not m.any():
        m[:] = True
    ilk, son = int(np.argmax(m)), len(m) - int(np.argmax(m[::-1]))
    aktif = np.cumsum(m.astype(float)) * adim         # aktif konuşma süresi (sn)

    def aktif_to_zaman(a: float) -> float:
        j = int(np.searchsorted(aktif, a))
        return min(j, len(aktif) - 1) * adim

    # sessizlikler (>=100 ms)
    sessiz = []
    i = ilk
    while i < son:
        if not m[i]:
            j = i
            while j < son and not m[j]:
                j += 1
            if j - i >= 10:
                sessiz.append((i * adim, j * adim))
            i = j
        else:
            i += 1

    kelimeler = [(mm.start(), mm.end()) for mm in re.finditer(r"\S+", tts)]
    agirlik = [max(0.6, sum(harf_agirligi(c) for c in tts[a:b])) for a, b in kelimeler]
    # ifade sınırları: noktalamayla biten kelimeden sonra
    sinirlar = [k for k, (a, b) in enumerate(kelimeler) if tts[b - 1] in NOKTALAMA and k < len(kelimeler) - 1]
    toplam = sum(agirlik) or 1.0
    a_bas, a_son = aktif[ilk], aktif[son - 1]
    kume = np.cumsum(agirlik)
    # her sınırı, orantılı hedef zamana en yakın sessizliğe oturt
    kullanildi, kesimler = set(), {}
    for k in sinirlar:
        hedef = aktif_to_zaman(a_bas + (a_son - a_bas) * kume[k] / toplam)
        aday = [(abs((s0 + s1) / 2 - hedef), idx) for idx, (s0, s1) in enumerate(sessiz)
                if idx not in kullanildi and abs((s0 + s1) / 2 - hedef) < 0.7]
        if aday:
            _, idx = min(aday)
            kullanildi.add(idx)
            kesimler[k] = sessiz[idx]
    # sınırlarla ifadeler
    gruplar, bas_k, bas_t = [], 0, ilk * adim
    for k in sorted(kesimler):
        s0, s1 = kesimler[k]
        if s0 <= bas_t:
            continue
        gruplar.append((bas_k, k, bas_t, s0))
        bas_k, bas_t = k + 1, s1
    gruplar.append((bas_k, len(kelimeler) - 1, bas_t, son * adim))

    c, b, s = list(tts), [0.0] * len(tts), [0.0] * len(tts)
    for k0, k1, t0, t1 in gruplar:
        if k1 < k0:
            continue
        g_agirlik = agirlik[k0:k1 + 1]
        g_top = sum(g_agirlik)
        A0, A1 = aktif[min(int(t0 / adim), len(aktif) - 1)], aktif[min(int(t1 / adim), len(aktif) - 1)]
        if A1 - A0 < 0.05:
            A0, A1 = A0, A0 + max(0.05, t1 - t0)
        birikim = 0.0
        for k in range(k0, k1 + 1):
            a, bb = kelimeler[k]
            w_bas = A0 + (A1 - A0) * birikim / g_top
            birikim += agirlik[k]
            w_son = A0 + (A1 - A0) * birikim / g_top
            harf_ag = [max(0.15, harf_agirligi(ch)) for ch in tts[a:bb]]
            h_top, h_bir = sum(harf_ag), 0.0
            for j, ch in enumerate(tts[a:bb]):
                hb = w_bas + (w_son - w_bas) * h_bir / h_top
                h_bir += harf_ag[j]
                hs = w_bas + (w_son - w_bas) * h_bir / h_top
                b[a + j], s[a + j] = aktif_to_zaman(hb), aktif_to_zaman(hs)
    # boşluklar: bir önceki harfin sonu
    for i in range(len(c)):
        if c[i].isspace():
            b[i] = s[i] = s[i - 1] if i > 0 else 0.0
    return {"c": c, "b": b, "s": s}


# ------------------------------------------------------------------ zaman çizelgesi

def kelime_zamanlari(metin: str, araliklar: list, hiz: dict, t0: float) -> list[dict]:
    c, b, s = hiz["c"], hiz["b"], hiz["s"]
    sonuc = []
    for mm in re.finditer(r"\S+", metin):
        ta, tb = d2t(araliklar, mm.start()), d2t(araliklar, mm.end())
        ia, ib = int(math.floor(ta)), int(math.ceil(tb))
        idx = [j for j in range(max(0, ia), min(ib, len(c))) if not c[j].isspace()]
        if idx:
            sonuc.append({"w": mm.group(0), "bas": t0 + min(b[j] for j in idx), "son": t0 + max(s[j] for j in idx)})
        else:
            sonuc.append({"w": mm.group(0), "bas": None, "son": None})
    # eksikleri komşudan doldur, monoton yap
    for i, k in enumerate(sonuc):
        if k["bas"] is None:
            onceki = sonuc[i - 1]["son"] if i > 0 and sonuc[i - 1]["son"] is not None else t0
            k["bas"] = k["son"] = onceki
    for i in range(1, len(sonuc)):
        sonuc[i]["bas"] = max(sonuc[i]["bas"], sonuc[i - 1]["bas"])
    for k in sonuc:
        k["son"] = max(k["son"], k["bas"] + 0.06)
    return sonuc


def ifade_zamani(kelimeler: list[dict], ifade: str | None) -> float | None:
    if not ifade:
        return None
    hedef = [normal(w) for w in ifade.split() if normal(w)]
    kel = [normal(k["w"]) for k in kelimeler]
    for i in range(len(kel)):
        if all(i + j < len(kel) and kel[i + j].startswith(h) for j, h in enumerate(hedef)):
            return kelimeler[i]["bas"]
    for i, k in enumerate(kel):  # gevşek: ilk kelime yeter
        if hedef and k.startswith(hedef[0]):
            return kelimeler[i]["bas"]
    return None


VISEM = {  # genişlik, açıklık, yuvarlaklık, diş
    "kapali": (24, 0, 0.0, 0.0), "unsuz": (26, 14, 0.1, 0.3), "a": (34, 46, 0.0, 0.2),
    "e": (36, 28, 0.0, 0.8), "i": (33, 17, 0.0, 0.9), "o": (24, 38, 1.0, 0.0),
    "u": (19, 25, 1.0, 0.0), "f": (29, 10, 0.0, 1.0),
}


def visem_sec(ch: str) -> str:
    c = kucuk(ch)
    if c == "a" or c == "â":
        return "a"
    if c == "e":
        return "e"
    if c in "ıiî":
        return "i"
    if c in "oö":
        return "o"
    if c in "uüû":
        return "u"
    if c in "mbp":
        return "kapali"
    if c in "fv":
        return "f"
    if c.isalpha() or c.isdigit():
        return "unsuz"
    return ""


def agiz_kareleri(n: int, harfler: list, genlik: np.ndarray) -> list:
    """harfler: (bas, son, ch) küresel; genlik: kare başına 0..1. Kare başına [w, h, r, d]."""
    harfler = sorted(harfler)
    baslar = [h[0] for h in harfler]
    w, h, r, d = 24.0, 0.0, 0.0, 0.0
    sonuc = []
    for k in range(n):
        t = k / FPS
        a = float(genlik[k]) if k < len(genlik) else 0.0
        j = int(np.searchsorted(baslar, t, side="right")) - 1
        v = ""
        if 0 <= j < len(harfler) and harfler[j][0] <= t <= harfler[j][1] + 0.03:
            v = visem_sec(harfler[j][2])
            if v == "unsuz":  # ünsüz bir sonraki ünlüye doğru şekillenir
                for jj in range(j + 1, min(j + 3, len(harfler))):
                    vv = visem_sec(harfler[jj][2])
                    if vv and vv not in ("unsuz", "kapali", "f"):
                        v = vv if harfler[jj][0] - t < 0.07 else "unsuz"
                        break
        if a < 0.07 or not v:
            hedef = VISEM["kapali"]
        else:
            tw, th, tr, td = VISEM[v]
            hedef = (tw, th * min(1.15, 0.35 + 0.85 * a), tr, td)
        acilma = 0.65 if hedef[1] > h else 0.5
        w += (hedef[0] - w) * 0.6
        h += (hedef[1] - h) * acilma
        r += (hedef[2] - r) * 0.5
        d += (hedef[3] - d) * 0.5
        sonuc.append([round(w, 1), round(max(0.0, h), 1), round(r, 2), round(d, 2)])
    return sonuc


def kare_genligi(x: np.ndarray, n: int) -> np.ndarray:
    pencere = int(SR * 0.04)
    g = np.zeros(n)
    for k in range(n):
        merkez = int(k / FPS * SR)
        p = x[max(0, merkez - pencere // 2): merkez + pencere // 2]
        g[k] = math.sqrt(float(np.mean(p ** 2))) if len(p) else 0.0
    ust = np.percentile(g[g > 1e-4], 95) if np.any(g > 1e-4) else 1.0
    g = np.clip(g / max(ust, 1e-4), 0, 1.2) ** 0.7
    # yumuşatma: hızlı atak, orta bırakma
    y, s = np.zeros(n), 0.0
    for k in range(n):
        s += (g[k] - s) * (0.7 if g[k] > s else 0.35)
        y[k] = s
    return np.round(y, 3)


def altyazi_parcalari(kelimeler: list[dict], sahne_no: int) -> list[dict]:
    parcalar, cur = [], []

    def bosalt():
        if cur:
            parcalar.append({"i0": cur[0], "i1": cur[-1], "sahne": sahne_no})
            cur.clear()

    for i, k in enumerate(kelimeler):
        cur.append(k["i"])
        uzunluk = sum(len(kelimeler_g[j]["w"]) + 1 for j in cur)
        sonraki = kelimeler[i + 1] if i + 1 < len(kelimeler) else None
        if (len(cur) >= 4 or uzunluk >= 24 or k["w"][-1] in NOKTALAMA
                or (sonraki and sonraki["bas"] - k["son"] > 0.35)):
            bosalt()
    bosalt()
    return parcalar


kelimeler_g: list[dict] = []   # altyazi_parcalari için küresel kelime listesi


# ------------------------------------------------------------------ efekt sesleri

def efekt_whoosh() -> np.ndarray:
    n = int(SR * 0.42)
    rng = np.random.default_rng(7)
    gurultu = rng.standard_normal(n).astype(np.float32)
    t = np.arange(n) / SR
    zarf_ = np.minimum(1, t / 0.12) * np.exp(-np.maximum(0, t - 0.12) / 0.11)
    y, s = np.zeros(n, dtype=np.float32), 0.0
    for i in range(n):  # süpüren alçak geçiren filtre
        a = 0.02 + 0.25 * min(1, t[i] / 0.2)
        s += a * (gurultu[i] - s)
        y[i] = s
    return (y / (np.abs(y).max() + 1e-9) * zarf_ * 0.16).astype(np.float32)


def efekt_pop() -> np.ndarray:
    n = int(SR * 0.09)
    t = np.arange(n) / SR
    f = 620 * (2.0 ** (t / 0.06))
    faz = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(faz) * np.exp(-t / 0.025) * 0.13).astype(np.float32)


# ------------------------------------------------------------------ görseller

def gorselleri_hazirla(bolum: Path, senaryo: dict, uyarilar: list) -> tuple[dict, dict]:
    kaynaklar_yolu = bolum / "kaynaklar.json"
    kaynaklar = json.loads(kaynaklar_yolu.read_text(encoding="utf-8")) if kaynaklar_yolu.exists() else {}
    kaynaklar.update(senaryo.get("gorseller", {}))
    kullanilan = {s["gorsel"] for s in senaryo["sahneler"] if s.get("gorsel")}
    eksik = kullanilan - set(kaynaklar)
    if eksik:
        hata(f"kaynaklar.json'da olmayan görsel anahtarı: {', '.join(sorted(eksik))}")
    veri = {}
    for anahtar in sorted(kullanilan):
        meta = kaynaklar[anahtar]
        dosya = (bolum / meta["dosya"]).resolve()
        if not dosya.exists():
            hata(f"görsel dosyası yok: {dosya}")
        for alan in ("sayfa", "sahip"):
            if not meta.get(alan):
                uyar(uyarilar, f"'{anahtar}' görselinde '{alan}' bilgisi eksik (açıklamaya kaynak yazılamaz)")
        im = Image.open(dosya).convert("RGB")
        if im.width < 1000:
            uyar(uyarilar, f"'{anahtar}' düşük çözünürlüklü ({im.width}x{im.height}); dikey kartta bulanık görünebilir")
        im.thumbnail((2560, 2560))
        tampon = io.BytesIO()
        im.save(tampon, "JPEG", quality=92)
        veri[anahtar] = {"src": "data:image/jpeg;base64," + base64.b64encode(tampon.getvalue()).decode(),
                         "w": im.width, "h": im.height, "sahip": meta.get("sahip", ""),
                         "etiket": meta.get("etiket", "RESMİ GÖRSEL" if meta.get("resmi") else "")}
    return veri, kaynaklar


# ------------------------------------------------------------------ çıktı yardımcıları

def srt_zaman(s: float) -> str:
    ms = int(round(max(0.0, s) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def youtube_metni(senaryo: dict, kaynaklar: dict, kullanilan: list[str]) -> str:
    yt, haber = senaryo.get("youtube", {}), senaryo.get("haber", {})
    satir = [yt.get("baslik", senaryo.get("baslik", "")), ""]
    if yt.get("aciklama"):
        satir += [yt["aciklama"], ""]
    if haber.get("kaynak"):
        satir.append(f"📰 Haber kaynağı: {haber.get('kaynak_adi', '')} – {haber['kaynak']}"
                     + (f" ({haber['tarih']})" if haber.get("tarih") else ""))
    for ek in haber.get("ek_kaynaklar", []):
        satir.append(f"   Ek kaynak: {ek}")
    if kullanilan:
        satir += ["", "🖼️ Görseller (özgün kaynaklar):"]
        for i, a in enumerate(kullanilan, 1):
            m = kaynaklar[a]
            parca = [f"{i}. {m.get('aciklama', a)}", f"© {m['sahip']}" if m.get("sahip") else "",
                     m.get("sayfa", "")]
            satir.append(" – ".join(p for p in parca if p))
    if not kullanilan:
        satir += ["", "🖼️ Görseller: Bu bölümde yalnızca Tilki Haber bilgi grafikleri kullanıldı (üçüncü taraf görsel yok)."]
    satir += ["", "🎙️ Seslendirme: ElevenLabs ile yapay zekâ seslendirmesi. Tilki animasyonu bu kanal için üretilmiştir."]
    if kullanilan:
        satir.append("Görseller haber/bilgilendirme amacıyla, hak sahiplerinin resmî tanıtım materyallerinden kullanılmıştır.")
    if yt.get("etiketler"):
        satir += ["", " ".join(e if e.startswith("#") else "#" + e for e in yt["etiketler"])]
    return "\n".join(satir).strip() + "\n"


def kontrol_paftasi(video: Path, anlar: list[tuple[float, str]], hedef: Path, calisma: Path) -> None:
    anlar = anlar[:12]
    kucukler = []
    for i, (t, ad) in enumerate(anlar):
        png = calisma / f"kontrol{i:02d}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.2f}", "-i", str(video),
                        "-frames:v", "1", "-vf", "scale=360:640", str(png)], check=False)
        if png.exists():
            kucukler.append((Image.open(png).convert("RGB"), f"{t:5.1f} sn · {ad}"))
    if not kucukler:
        return
    sutun = 4
    satir = math.ceil(len(kucukler) / sutun)
    pafta = Image.new("RGB", (sutun * 370 + 10, satir * 690 + 10), (20, 16, 32))
    try:
        font = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf", 20)
    except OSError:
        font = ImageFont.load_default()
    ciz = ImageDraw.Draw(pafta)
    for i, (im, yazi) in enumerate(kucukler):
        x, y = 10 + (i % sutun) * 370, 10 + (i // sutun) * 690
        pafta.paste(im, (x, y))
        ciz.text((x + 4, y + 648), yazi[:38], fill=(255, 230, 120), font=font)
    pafta.save(hedef, quality=88)


# ------------------------------------------------------------------ ana akış

def main() -> None:
    ap = argparse.ArgumentParser(description="Tilki Haber Shorts üreticisi")
    ap.add_argument("senaryo", type=Path)
    ap.add_argument("--onizleme", action="store_true", help="ElevenLabs yerine espeak-ng ile taslak üret")
    ap.add_argument("--metin", action="store_true", help="seslendirme metinlerini ve süre tahminini yazdır")
    ap.add_argument("--ses-ekle", nargs=2, metavar=("SAHNE", "DOSYA"), help="hazır sahne sesini kaydet")
    ap.add_argument("--telaffuz", action="store_true", help="ElevenLabs STT ile ad telaffuzunu denetle")
    ap.add_argument("--isci", type=int, default=None, help="paralel render işçisi")
    ap.add_argument("--zorla", action="store_true", help="süre tahmini sınırı aşsa da devam et")
    arg = ap.parse_args()

    ayar = ayarlari_yukle()
    senaryo_yolu = arg.senaryo.resolve()
    bolum = senaryo_yolu.parent
    senaryo = json.loads(senaryo_yolu.read_text(encoding="utf-8"))
    sahneler = senaryo.get("sahneler") or hata("senaryoda 'sahneler' yok")
    ses = {**ayar["ses"], **senaryo.get("ses", {})}
    sozluk = sozluk_yukle(senaryo)
    ttsler = [telaffuz_uygula(s["metin"], sozluk) for s in sahneler]
    sinir = ayar["sure"]["sinir"]

    # --- metin modu / tahmin
    karakter = sum(len(t) for t, _ in ttsler)  # seslendirilen metin (sayılar okunuşlarıyla) uzunluğu
    tahmin = PAY_BAS + karakter / ayar["sure"].get("karakter_hizi", 11.8) + ARA * (len(sahneler) - 1) + KAPANIS_EK
    if arg.metin:
        print(f"Ses: {ses.get('ad', ses['voice_id'])} · model {ses.get('model_id')}")
        for i, (tts, _) in enumerate(ttsler, 1):
            print(f"\n[sahne {i}] {tts}")
        print(f"\nTahmini süre ≈ {tahmin:.1f} sn (hedef {ayar['sure']['hedef_min']}–{ayar['sure']['hedef_max']}, sınır {sinir})")
        (bolum / "ses").mkdir(exist_ok=True)
        (bolum / "ses" / "metinler.json").write_text(json.dumps(
            [{"sahne": i, "metin": t} for i, (t, _) in enumerate(ttsler, 1)], ensure_ascii=False, indent=2),
            encoding="utf-8")
        return
    if arg.ses_ekle:
        no, kaynak = int(arg.ses_ekle[0]), Path(arg.ses_ekle[1])
        if not 1 <= no <= len(sahneler) or not kaynak.exists():
            hata("geçersiz sahne numarası veya dosya")
        (bolum / "ses").mkdir(exist_ok=True)
        hedef = bolum / "ses" / f"sahne{no:02d}.mp3"
        calistir(["ffmpeg", "-y", "-v", "error", "-i", str(kaynak), "-ac", "1", "-ar", str(SR),
                  "-b:a", "160k", str(hedef)])
        (bolum / "ses" / f"sahne{no:02d}.json").write_text(json.dumps(
            {"metin": ttsler[no - 1][0], "voice_id": ses["voice_id"], "kaynak": "elevenlabs-baglayici",
             "tarih": datetime.now().isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
        print(f"Kaydedildi: {hedef} ({sure_olc(hedef):.2f} sn)")
        return
    if arg.telaffuz:
        adlar = [k for k in sozluk if any(k in s["metin"] for s in sahneler)]
        print("Telaffuz denetimi (ElevenLabs Scribe):")
        for i, s in enumerate(sahneler, 1):
            mp3 = bolum / "ses" / f"sahne{i:02d}.mp3"
            ilgili = [a for a in adlar if a in s["metin"]]
            if not ilgili or not mp3.exists():
                continue
            yazi = elevenlabs_stt(mp3)
            kel = [normal(w) for w in yazi.split()]
            for a in ilgili:
                hedefler = [normal(a), normal(sozluk[a])]
                n = max(1, len(a.split()))
                pencereler = ["".join(kel[j:j + n]) for j in range(max(1, len(kel) - n + 1))]
                skor = max((difflib.SequenceMatcher(None, p, h).ratio() for p in pencereler for h in hedefler),
                           default=0)
                print(f"  sahne {i}: {a!r:24} → {'✓' if skor >= 0.72 else '✗ KONTROL ET'} ({skor:.2f})")
            print(f"     duyulan: {yazi}")
        return

    if tahmin > sinir - 1 and not arg.zorla:
        hata(f"tahmini süre {tahmin:.1f} sn — {sinir} sn sınırına çok yakın. Metni kısaltın (ya da --zorla).", 3)

    if not shutil.which("ffmpeg"):
        hata("ffmpeg bulunamadı")
    ad = bolum.name + ("-onizleme" if arg.onizleme else "")
    cikti = bolum / "cikti"
    calisma = cikti / f".{ad}-calisma"
    if calisma.exists():
        shutil.rmtree(calisma)
    calisma.mkdir(parents=True)
    uyarilar: list[str] = []

    print(f"▶ {senaryo.get('baslik', bolum.name)} — {len(sahneler)} sahne")
    gorseller, kaynaklar = gorselleri_hazirla(bolum, senaryo, uyarilar)

    # --- 1) seslendirme
    print("1) Seslendirme")
    sesler, hizalamalar, kaynak_turu, tempolar = [], [], set(), []
    for i, (tts, _) in enumerate(ttsler, 1):
        onceki = ttsler[i - 2][0] if i > 1 else ""
        sonraki = ttsler[i][0] if i < len(ttsler) else ""
        yol, hiz, tur = sahne_sesi(bolum, i, tts, ses, onceki, sonraki, arg.onizleme, calisma)
        x = ses_oku(yol)
        if hiz is not None and len(hiz.get("c", [])) != len(tts):
            hiz = None
        kirp = ayar.get("ses_kirpma", {})
        x, hiz = sessizlik_kirp(x, hiz, kirp.get("en_uzun_duraklama", 0.3), kirp.get("bas_pay", 0.03),
                                kirp.get("son_pay", 0.1), kirp.get("kelime_arasi", 0.08))
        if not arg.onizleme and ayar.get("tempo"):
            x, hiz, oran = tempo_ayarla(x, tts, hiz, ayar["tempo"].get("hedef_hece_hizi", 6.0),
                                        ayar["tempo"].get("en_fazla", 1.3))
            tempolar.append(round(oran, 2))
        if hiz is None:
            hiz = hizala_tahmin(tts, x)
            tur += " + tahmini hizalama"
        sesler.append(x)
        hizalamalar.append(hiz)
        kaynak_turu.add(tur)

    if tempolar:
        print(f"  tempo (sahne başına hızlandırma): {tempolar}")
    if not arg.onizleme and ayar.get("dinleme_kontrolu", True):
        print("   dinleme kontrolü (ElevenLabs Speech-to-Text)…")
        dinleme_kontrolu(bolum, ttsler, uyarilar)
    # --- 2) zaman çizelgesi
    print("2) Zamanlama, ağız senkronu, altyazı")
    global kelimeler_g
    kelimeler_g = []
    harfler, sahne_tl, parcalar = [], [], []
    an = PAY_BAS
    ses_baslari = []
    for i, (s, x, (tts, aralik), hiz) in enumerate(zip(sahneler, sesler, ttsler, hizalamalar)):
        ses_baslari.append(an)
        kel = kelime_zamanlari(s["metin"], aralik, hiz, an)
        for k in kel:
            k["i"] = len(kelimeler_g)
            k["sahne"] = i
            kelimeler_g.append(k)
        parcalar += altyazi_parcalari(kel, i)
        for ch, b, e in zip(hiz["c"], hiz["b"], hiz["s"]):
            if not ch.isspace():
                harfler.append((an + b, an + e, ch))
        sahne_tl.append({"kelimeler": kel, "ses_bas": an, "ses_son": an + len(x) / SR})
        an += len(x) / SR + ARA
    toplam = an - ARA + KAPANIS_EK
    n_kare = int(math.ceil(toplam * FPS))

    for i, st in enumerate(sahne_tl):
        st["bas"] = 0.0 if i == 0 else st["ses_bas"] - ARA / 2
    for i, st in enumerate(sahne_tl):
        st["son"] = sahne_tl[i + 1]["bas"] if i + 1 < len(sahne_tl) else toplam

    for p in parcalar:
        p["bas"] = kelimeler_g[p["i0"]]["bas"] - 0.04
    for j, p in enumerate(parcalar):
        sonraki = parcalar[j + 1]["bas"] if j + 1 < len(parcalar) else toplam
        p["son"] = min(sonraki, kelimeler_g[p["i1"]]["son"] + 0.45)

    # ses izi
    iz = np.zeros(n_kare * SR // FPS + SR, dtype=np.float32)
    for st, x in zip(sahne_tl, sesler):
        a = int(st["ses_bas"] * SR)
        iz[a:a + len(x)] += x
    genlik = kare_genligi(iz, n_kare)

    # sahne olayları
    tl_sahneler, gorsel_olaylari, efektler = [], [], []
    duzenler = [s.get("duzen") or ("gorsel" if (s.get("gorsel") or s.get("grafik")) else "studyo") for s in sahneler]
    if duzenler[-1] != "kapanis":
        uyar(uyarilar, "son sahne 'kapanis' değil; tilki kapanış sorusunu kameraya yakın planda sormayacak")
    zoomlar = [1.0, 1.07]
    for i, (s, st) in enumerate(zip(sahneler, sahne_tl)):
        kel = st["kelimeler"]
        oge = {"bas": round(st["bas"], 3), "son": round(st["son"], 3), "ses_bas": round(st["ses_bas"], 3),
               "ses_son": round(st["ses_son"], 3), "duzen": duzenler[i], "ekran": s.get("ekran", ""),
               "ifade": s.get("ifade", "heyecan" if i == 0 else "normal"), "jest": s.get("jest", ""),
               "zoom": zoomlar[i % 2], "k0": kel[0]["i"], "k1": kel[-1]["i"]}
        if s.get("espri"):
            e = s["espri"] if isinstance(s["espri"], dict) else {"tip": s["espri"]}
            tz = ifade_zamani(kel, e.get("tetik"))
            e = {**e, "bas": round((tz if tz is not None else st["ses_bas"] + 0.15), 3)}
            if e.get("tetik") and tz is None:
                uyar(uyarilar, f"sahne {i + 1}: espri tetiği '{e['tetik']}' metinde bulunamadı")
            oge["espri"] = e
            efektler.append(("pop", e["bas"]))
        if s.get("gorsel") or s.get("grafik"):
            tz = ifade_zamani(kel, s.get("tetik"))
            if s.get("tetik") and tz is None:
                uyar(uyarilar, f"sahne {i + 1}: görsel tetiği '{s['tetik']}' metinde bulunamadı; sahne başında açılacak")
            gb = st["bas"] if tz is None else max(st["bas"], tz - 0.08)
            olay = {"anahtar": s.get("gorsel") or f"grafik{i + 1}", "bas": round(gb, 3), "son": round(st["son"], 3),
                    "odak": s.get("odak", [0.5, 0.5]), "sahne": i, "tetik_zamani": tz,
                    "tetik": s.get("tetik", ""), "etiket": s.get("etiket", "")}
            if s.get("grafik"):
                olay["grafik"] = s["grafik"]
            if s.get("vurgu"):
                v = dict(s["vurgu"])
                vz = ifade_zamani(kel, v.get("tetik"))
                if v.get("tetik") and vz is None:
                    uyar(uyarilar, f"sahne {i + 1}: vurgu tetiği '{v['tetik']}' bulunamadı")
                vz = gb + 0.7 if vz is None else vz
                v["bas"] = round(min(max(vz, gb + 0.35), olay["son"] - 0.7), 3)
                olay["vurgu"] = v
                efektler.append(("pop", v["bas"] + 0.3))
            if gorsel_olaylari and gorsel_olaylari[-1]["anahtar"] == olay["anahtar"] \
                    and abs(gorsel_olaylari[-1]["son"] - olay["bas"]) < 0.3 and not olay.get("vurgu"):
                gorsel_olaylari[-1]["son"] = olay["son"]
            else:
                if gorsel_olaylari and abs(gorsel_olaylari[-1]["son"] - olay["bas"]) < 0.3:
                    gorsel_olaylari[-1]["son"] = olay["bas"]
                gorsel_olaylari.append(olay)
                efektler.append(("whoosh", olay["bas"] - 0.06))
        tl_sahneler.append(oge)
    for o in gorsel_olaylari:
        if o["son"] - o["bas"] < 1.6:
            uyar(uyarilar, f"'{o['anahtar']}' yalnızca {o['son'] - o['bas']:.1f} sn görünüyor (en az 1.6 sn önerilir)")
    pencereler = []
    for o in gorsel_olaylari:
        if pencereler and o["bas"] - pencereler[-1][1] < 0.3:
            pencereler[-1][1] = o["son"]
        else:
            pencereler.append([o["bas"], o["son"]])

    rng = random.Random(senaryo.get("tohum", 42))
    kirpmalar, t = [], 0.9
    while t < toplam:
        kirpmalar.append(round(t, 2))
        if rng.random() < 0.18:
            kirpmalar.append(round(t + 0.28, 2))
        t += rng.uniform(2.3, 4.6)
    kulaklar, t = [], 1.6
    while t < toplam:
        kulaklar.append([round(t, 2), rng.choice([-1, 1])])
        t += rng.uniform(3.0, 6.5)

    agiz = agiz_kareleri(n_kare, harfler, genlik)

    # efektler ses izine
    if ayar.get("efektler", True):
        ornek = {"whoosh": efekt_whoosh(), "pop": efekt_pop()}
        for tur, zt in efektler:
            a = max(0, int(zt * SR))
            e = ornek[tur][: max(0, len(iz) - a)]
            iz[a:a + len(e)] += e
    tepe = float(np.abs(iz).max()) or 1.0
    if tepe > 0.97:
        iz *= 0.97 / tepe
    wav = calisma / "ses.wav"
    pcm = (np.clip(iz[: int(toplam * SR)], -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)

    zaman = {
        "fps": FPS, "sure": round(toplam, 3), "kareler": n_kare, "marka": ayar.get("marka", "TİLKİ HABER"),
        "oyun": senaryo.get("oyun", ""), "onizleme": arg.onizleme,
        "manset": senaryo.get("manset") or senaryo.get("haber", {}).get("baslik", ""),
        "kayan": senaryo.get("kayan", []), "tarih": senaryo.get("tarih", ""),
        "ust_etiket": senaryo.get("ust_etiket", "SON DAKİKA"),
        "kaynak_adi": senaryo.get("haber", {}).get("kaynak_adi", ""),
        "sahneler": tl_sahneler, "gorsel_olaylari": gorsel_olaylari, "pencereler": pencereler,
        "kelimeler": [{"w": k["w"], "bas": round(k["bas"], 3), "son": round(k["son"], 3), "s": k["sahne"]}
                      for k in kelimeler_g],
        "altyazi": [{"bas": round(p["bas"], 3), "son": round(p["son"], 3), "i0": p["i0"], "i1": p["i1"],
                     "s": p["sahne"]} for p in parcalar],
        "agiz": agiz, "genlik": genlik.tolist(), "kirpmalar": kirpmalar, "kulaklar": kulaklar,
        "gorseller": gorseller,
    }
    zaman_yolu = calisma / "zaman.json"
    zaman_yolu.write_text(json.dumps(zaman, ensure_ascii=False), encoding="utf-8")

    # --- 3) render
    isci = arg.isci or ayar.get("isci", 3)
    print(f"3) Animasyon render ({n_kare} kare, {isci} işçi)")
    t0 = time.time()
    r = subprocess.run(["node", str(RENDER / "kaydet.mjs"), str(zaman_yolu), str(calisma), str(isci)])
    if r.returncode != 0:
        hata("render başarısız")
    print(f"   render {time.time() - t0:.0f} sn")
    sessiz = calisma / "goruntu.mp4"
    calistir(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(calisma / "parcalar.txt"),
              "-c", "copy", str(sessiz)], cwd=str(calisma))

    # --- 4) montaj
    print("4) Montaj (ses + loudness)")
    video = cikti / f"tilki-{ad}.mp4"
    calistir(["ffmpeg", "-y", "-v", "error", "-i", str(sessiz), "-i", str(wav),
              "-map", "0:v", "-map", "1:a", "-c:v", "copy",
              "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000", "-c:a", "aac", "-b:a", "192k",
              "-ac", "2", "-t", f"{toplam:.3f}", "-movflags", "+faststart", str(video)])

    # --- 5) kontrol
    print("5) Kontrol")
    gercek = sure_olc(video)
    v_bilgi = json.loads(calistir(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,r_frame_rate", "-of", "json", str(video)]).stdout)
    akis = v_bilgi["streams"][0]
    if (akis["width"], akis["height"]) != (1080, 1920):
        uyar(uyarilar, f"çözünürlük {akis['width']}x{akis['height']} (1080x1920 bekleniyordu)")
    for o in gorsel_olaylari:
        if o["tetik_zamani"] is not None and abs(o["bas"] + 0.08 - o["tetik_zamani"]) > 0.2 and o["bas"] > o["tetik_zamani"]:
            uyar(uyarilar, f"'{o['anahtar']}' tetik kelimesinden {o['bas'] - o['tetik_zamani']:.2f} sn sonra açılıyor")

    srt = []
    for j, p in enumerate(parcalar, 1):
        yazi = " ".join(kelimeler_g[i]["w"] for i in range(p["i0"], p["i1"] + 1))
        srt.append(f"{j}\n{srt_zaman(p['bas'])} --> {srt_zaman(p['son'])}\n{yazi}\n")
    (cikti / f"tilki-{ad}.srt").write_text("\n".join(srt), encoding="utf-8")
    kullanilan = []
    for o in gorsel_olaylari:
        if not o.get("grafik") and o["anahtar"] not in kullanilan:
            kullanilan.append(o["anahtar"])
    (cikti / "youtube.txt").write_text(youtube_metni(senaryo, kaynaklar, kullanilan), encoding="utf-8")

    anlar = [(0.6, "kanca")]
    for o in gorsel_olaylari:
        anlar.append((o["bas"] + 0.7, f"görsel: {o['anahtar']}"))
        if o.get("vurgu"):
            anlar.append((o["vurgu"]["bas"] + 0.9, f"vurgu: {o['anahtar']}"))
    anlar.append((tl_sahneler[-1]["ses_bas"] + 1.0, "kapanış sorusu"))
    kontrol_paftasi(video, anlar, cikti / "kontrol.jpg", calisma)

    rapor = {
        "video": str(video), "olculen_sure": round(gercek, 2), "sinir": sinir,
        "hedef": [ayar["sure"]["hedef_min"], ayar["sure"]["hedef_max"]],
        "ses_kaynagi": sorted(kaynak_turu), "ses": ses.get("ad", ses["voice_id"]),
        "sahneler": [{"no": i + 1, "bas": s["bas"], "son": s["son"], "duzen": s["duzen"],
                      "metin": sahneler[i]["metin"]} for i, s in enumerate(tl_sahneler)],
        "gorseller": [{"anahtar": o["anahtar"], "acilis": o["bas"], "kapanis": o["son"],
                       "tetik": o["tetik"], "tetik_kelime_zamani": o["tetik_zamani"],
                       "vurgu": o.get("vurgu", {}).get("bas")} for o in gorsel_olaylari],
        "uyarilar": uyarilar,
    }
    (cikti / "rapor.json").write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.rmtree(calisma)

    print(f"\n✅ {video}")
    print(f"   Ölçülen süre: {gercek:.2f} sn · {akis['width']}x{akis['height']} · ses: {', '.join(sorted(kaynak_turu))}")
    print(f"   Kontrol paftası: {cikti / 'kontrol.jpg'}  ·  YouTube metni: {cikti / 'youtube.txt'}")
    if arg.onizleme:
        print("   ⚠ ÖNİZLEME: ses espeak-ng ile üretildi, yayına uygun değil.")
    if gercek > sinir:
        print(f"\n❌ Süre {gercek:.1f} sn > {sinir} sn. Metni kısaltın ve yeniden çalıştırın "
              "(değişmeyen sahnelerin sesi önbellekten gelir).", file=sys.stderr)
        sys.exit(3)
    if not ayar["sure"]["hedef_min"] <= gercek <= ayar["sure"]["hedef_max"]:
        print(f"   ⚠ Süre hedef aralığın ({ayar['sure']['hedef_min']}–{ayar['sure']['hedef_max']} sn) dışında.")


if __name__ == "__main__":
    main()
