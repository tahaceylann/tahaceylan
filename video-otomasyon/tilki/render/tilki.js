/* Tilki Haber — kare çizici.
 * hazirla(zaman) bir kez, sonra kare(k) her kare için çağrılır; kare(k) JPEG data URL döndürür.
 * Her kare yalnızca zamana bağlıdır (durumsuz), böylece kareler paralel işçilerde çizilebilir.
 */
'use strict';
const W = 1080, H = 1920;
const YAZI = '"Inter", "Noto Color Emoji", "DejaVu Sans", sans-serif';
const EMOJI = '"Noto Color Emoji", sans-serif';
const R = {
  kurk: '#F47B20', kurkKoyu: '#C85A14', kurkAcik: '#FFA14A', kontur: '#A9480F',
  krem: '#FFF3E2', kulakIc: '#FFD2AE', uc: '#3A2218', burun: '#24150F',
  kulaklik: '#2E2B42', kulaklikKoyu: '#1A1828', neon: '#33E1FF', pembe: '#FF4FD8',
  kapusonlu: '#6B4DFF', kapusonluKoyu: '#4F36D1', agiz: '#5B1A22', dil: '#FF6B7A',
  sari: '#FFD23F', gece: '#1B1033',
};
const IFADE = {
  normal:  { kasY: 0, kasR: 0, egim: 0, kulak: 0, goz: 1, kisik: 0, yanak: 0.3 },
  heyecan: { kasY: -11, kasR: -0.07, egim: -0.03, kulak: -0.06, goz: 1.1, kisik: 0, yanak: 0.5 },
  saskin:  { kasY: -19, kasR: -0.1, egim: 0.02, kulak: -0.09, goz: 1.18, kisik: 0, yanak: 0.3, pupil: 0.75 },
  supheli: { kasY: 3, kasR: 0.16, egim: 0.06, kulak: 0.06, goz: 1, kisik: 0, ustKapak: 0.3, yanak: 0.2, kasSag: { y: -12, r: -0.12 } },
  uzgun:   { kasY: -4, kasR: -0.3, egim: 0.05, kulak: 0.34, goz: 1, kisik: 0.1, yanak: 0.15 },
  gulme:   { kasY: -7, kasR: -0.05, egim: -0.05, kulak: -0.04, goz: 1, kisik: 0.42, yanak: 0.65 },
  dusunme: { kasY: -7, kasR: 0.07, egim: 0.08, kulak: 0.05, goz: 1, kisik: 0.12, yanak: 0.25, bak: [-0.6, -0.6] },
};
const KX = 60, KY = 215, KW = 960, KH = 770;           // görsel kartı
const KAM = { x: 40, y: 1004, w: 340 };                  // köşe kamerası
const ALT_Y = 1478, ALT_X = 520, ALT_W = 860;           // altyazı (Shorts düğmelerinden uzak)

let T = null, ana, ac, kam, kc, statik, masa, bulanik;
const G = {};

// ------------------------------------------------------------ yardımcılar
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const eOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const eBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mix = (a, b, w) => ({ x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w), s: lerp(a.s, b.s, w) });
const pencere = (dt, giris, sure, cikis) => ease(dt / giris) * (1 - ease((dt - sure) / cikis));
function tuval() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }

function satirla(x, metin, maxW) {
  const kel = metin.split(/\s+/).filter(Boolean), satir = [];
  let cur = '';
  for (const k of kel) {
    const dene = cur ? cur + ' ' + k : k;
    if (cur && x.measureText(dene).width > maxW) { satir.push(cur); cur = k; } else cur = dene;
  }
  if (cur) satir.push(cur);
  return satir;
}
function sigdir(x, metin, agirlik, buyuk, kucuk, maxW, maxSatir) {
  for (let b = buyuk; b >= kucuk; b -= 4) {
    x.font = `${agirlik} ${b}px ${YAZI}`;
    const s = satirla(x, metin, maxW);
    if (s.length <= maxSatir && s.every((l) => x.measureText(l).width <= maxW)) return { boyut: b, satir: s };
  }
  x.font = `${agirlik} ${kucuk}px ${YAZI}`;
  return { boyut: kucuk, satir: satirla(x, metin, maxW).slice(0, maxSatir) };
}

// ------------------------------------------------------------ zaman sorguları
function sahneNo(t) { const S = T.sahneler; for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].bas) return i; return 0; }
function gorselOlay(t) { for (const o of T.gorsel_olaylari) if (t >= o.bas && t < o.son) return o; return null; }
function oncekiOlay(o) { const i = T.gorsel_olaylari.indexOf(o); return i > 0 ? T.gorsel_olaylari[i - 1] : null; }
function duzenG(t) {
  for (const [a, b] of T.pencereler) if (t >= a && t < b) return ease(Math.min((t - a) / 0.42, (b - t) / 0.38, 1));
  return 0;
}
function sonSahne() { return T.sahneler[T.sahneler.length - 1]; }
function kapanisC(t) { const s = sonSahne(); return s.duzen === 'kapanis' ? eOut((t - s.bas) / 0.55) : 0; }
function aktifKelime(t) {
  const K = T.kelimeler;
  for (let i = 0; i < K.length; i++) {
    const son = i + 1 < K.length ? Math.min(K[i + 1].bas, K[i].son + 0.25) : K[i].son + 0.25;
    if (t >= K[i].bas && t < son) return K[i];
  }
  return null;
}

// ------------------------------------------------------------ hazırlık
async function hazirla(zaman) {
  T = zaman;
  ana = document.getElementById('c'); ac = ana.getContext('2d');
  kam = tuval(); kc = kam.getContext('2d');
  await Promise.all(Object.entries(T.gorseller).map(([k, v]) => new Promise((ok, red) => {
    const im = new Image();
    im.onload = () => { G[k] = im; ok(); };
    im.onerror = () => red(new Error('görsel yüklenemedi: ' + k));
    im.src = v.src;
  })));
  for (const f of ['900 60px Inter', '800 60px Inter', '700 60px Inter', '60px "Noto Color Emoji"']) {
    try { await document.fonts.load(f, 'AaÇğİşÖü🦊'); } catch (e) { /* sistem fontu */ }
  }
  statik = statikStudyo();
  masa = masaTuvali();
  bulanik = bulanikArka();
  return true;
}
function kare(k) { ciz(k / T.fps, k); return ana.toDataURL('image/jpeg', 0.92); }

// ------------------------------------------------------------ stüdyo
function statikStudyo() {
  const c = tuval(), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120A27'); g.addColorStop(0.5, '#25124D'); g.addColorStop(1, '#170D31');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // akustik paneller
  for (let r = 0; r < 12; r++) for (let s = 0; s < 13; s++) {
    const px = -30 + s * 90 + (r % 2) * 45, py = 470 + r * 88;
    x.fillStyle = `rgba(${90 + 40 * hash(r * 13 + s)}, 60, 170, ${0.08 + 0.09 * hash(r * 7 + s * 3)})`;
    rr(x, px, py, 78, 78, 14); x.fill();
  }
  // arka ışıklar
  for (const [cx, cy, renk] of [[120, 520, 'rgba(255,79,216,0.30)'], [980, 760, 'rgba(51,225,255,0.24)'], [540, 1250, 'rgba(244,123,32,0.20)']]) {
    const rg = x.createRadialGradient(cx, cy, 10, cx, cy, 520);
    rg.addColorStop(0, renk); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
  }
  // sol monitör çerçevesi
  rr(x, 56, 560, 290, 188, 20); x.fillStyle = '#0B0818'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#3D3463'; x.stroke();
  x.fillStyle = '#3D3463'; x.fillRect(186, 748, 30, 40); rr(x, 150, 784, 102, 14, 7); x.fill();
  // raflar
  x.fillStyle = '#4A3A72'; rr(x, 30, 1046, 320, 18, 6); x.fill();
  x.fillStyle = '#4A3A72'; rr(x, 744, 900, 320, 18, 6); x.fill();
  // sol raf: saksı + bitki
  x.fillStyle = '#E2643B'; rr(x, 60, 980, 70, 66, 10); x.fill();
  x.fillStyle = '#3FBF7F';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(95, 985); x.rotate(-1.1 + i * 0.44); x.beginPath(); x.ellipse(0, -46, 15, 46, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  // oyun kutuları
  const kutuRenk = ['#FF4F6D', '#33E1FF', '#FFD23F', '#8A6CFF'];
  kutuRenk.forEach((r, i) => { x.fillStyle = r; rr(x, 160 + i * 30, 950 - (i % 2) * 8, 24, 96 + (i % 2) * 8, 4); x.fill(); });
  // kupa
  x.fillStyle = '#FFC93C';
  x.beginPath(); x.moveTo(285, 960); x.lineTo(335, 960); x.quadraticCurveTo(332, 1004, 310, 1010); x.quadraticCurveTo(288, 1004, 285, 960); x.fill();
  x.fillRect(304, 1008, 12, 22); rr(x, 290, 1028, 40, 18, 4); x.fill();
  // sağ raf: oyun kolu + retro konsol + figür
  x.fillStyle = '#20203A'; rr(x, 770, 850, 120, 50, 24); x.fill();
  x.fillStyle = '#FF4F6D'; x.beginPath(); x.arc(860, 868, 7, 0, 7); x.fill();
  x.fillStyle = '#33E1FF'; x.beginPath(); x.arc(875, 882, 7, 0, 7); x.fill();
  x.fillStyle = '#9C98B8'; x.fillRect(790, 870, 26, 8); x.fillRect(799, 861, 8, 26);
  x.fillStyle = '#D9D4F0'; rr(x, 920, 820, 62, 80, 8); x.fill();
  x.fillStyle = '#2E2B42'; rr(x, 930, 830, 42, 30, 4); x.fill();
  x.fillStyle = R.kurk; x.beginPath(); x.arc(1025, 870, 22, 0, 7); x.fill();
  x.beginPath(); x.moveTo(1008, 858); x.lineTo(1012, 832); x.lineTo(1024, 852); x.fill();
  x.beginPath(); x.moveTo(1042, 858); x.lineTo(1038, 832); x.lineTo(1026, 852); x.fill();
  // YAYINDA tabelası çerçevesi
  rr(x, 790, 610, 230, 74, 18); x.fillStyle = '#26091A'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#5A2440'; x.stroke();
  return c;
}

function masaTuvali() {
  const c = tuval(), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 1330, 0, 1410);
  g.addColorStop(0, '#4A4072'); g.addColorStop(1, '#2C2549');
  x.fillStyle = g; x.fillRect(0, 1330, W, 80);
  g = x.createLinearGradient(0, 1410, 0, H);
  g.addColorStop(0, '#221B3E'); g.addColorStop(1, '#0F0B1F');
  x.fillStyle = g; x.fillRect(0, 1410, W, H - 1410);
  for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(255,255,255,0.025)'; x.fillRect(i * 92 + 20, 1430, 46, H - 1430); }
  x.save();
  x.font = `900 120px ${YAZI}`; x.textAlign = 'center';
  x.strokeStyle = 'rgba(244,123,32,0.35)'; x.lineWidth = 4; x.strokeText('TİLKİ HABER', 540, 1820);
  x.restore();
  // kupa (sol) + oyun kolu (sağ)
  x.fillStyle = '#FF5A5A'; rr(x, 150, 1236, 92, 102, 14); x.fill();
  x.lineWidth = 14; x.strokeStyle = '#FF5A5A'; x.beginPath(); x.arc(246, 1282, 26, -1.2, 1.2); x.stroke();
  x.fillStyle = '#fff'; x.font = `900 40px ${YAZI}`; x.textAlign = 'center'; x.fillText('GG', 196, 1302);
  x.fillStyle = '#16152A'; x.beginPath(); x.ellipse(890, 1338, 96, 34, -0.08, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#FF4F6D'; x.beginPath(); x.arc(930, 1330, 8, 0, 7); x.fill();
  x.fillStyle = '#33E1FF'; x.beginPath(); x.arc(950, 1342, 8, 0, 7); x.fill();
  x.fillStyle = '#56527A'; x.fillRect(832, 1334, 30, 9); x.fillRect(843, 1323, 9, 30);
  return c;
}

function bulanikArka() {
  const c = tuval(), x = c.getContext('2d');
  x.filter = 'blur(28px) brightness(0.55) saturate(1.25)';
  x.drawImage(statik, -80, -80, W + 160, H + 160);
  x.drawImage(masa, -80, -80, W + 160, H + 160);
  x.filter = 'none';
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(18,10,39,0.35)'); g.addColorStop(1, 'rgba(18,10,39,0.6)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return c;
}

function studyoAnim(x, t) {
  // monitör içeriği
  x.save(); rr(x, 66, 570, 270, 168, 12); x.clip();
  const g = x.createLinearGradient(66, 570, 336, 738); g.addColorStop(0, '#16224A'); g.addColorStop(1, '#2A1458');
  x.fillStyle = g; x.fillRect(66, 570, 270, 168);
  x.fillStyle = R.sari; x.font = `800 22px ${YAZI}`; x.fillText('OYUN GÜNDEMİ', 84, 602);
  for (let i = 0; i < 7; i++) {
    const h = 24 + 64 * Math.abs(Math.sin(t * 2.6 + i * 0.9));
    x.fillStyle = i % 2 ? R.neon : R.pembe; x.fillRect(86 + i * 34, 726 - h, 22, h);
  }
  x.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 570; y < 738; y += 6) x.fillRect(66, y, 270, 2);
  x.restore();
  // YAYINDA
  const nabiz = 0.65 + 0.35 * Math.sin(t * 4);
  x.save(); x.font = `900 40px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = `rgba(255,59,92,${nabiz})`; x.shadowBlur = 28; x.fillStyle = `rgba(255,90,110,${0.6 + 0.4 * nabiz})`;
  x.fillText('● YAYINDA', 905, 648); x.restore();
}

function masaAnim(x, t) {
  const g = x.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= 6; i++) {
    const h = (t * 40 + i * 60) % 360;
    g.addColorStop(i / 6, `hsl(${h}, 95%, 62%)`);
  }
  x.save(); x.shadowColor = 'rgba(255,255,255,0.6)'; x.shadowBlur = 16; x.fillStyle = g; x.fillRect(0, 1326, W, 7); x.restore();
  // kahve buharı
  x.save(); x.lineWidth = 5; x.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    for (let y = 0; y <= 90; y += 6) {
      const px = 176 + i * 20 + Math.sin(y * 0.07 + t * 3 + i) * 9, py = 1230 - y;
      if (y === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.strokeStyle = `rgba(255,255,255,${0.16 + 0.06 * Math.sin(t * 2 + i)})`; x.stroke();
  }
  x.restore();
}

// ------------------------------------------------------------ tilki
function tilkiDurum(t, k, sc) {
  const m = T.agiz[Math.min(k, T.agiz.length - 1)] || [24, 0, 0, 0];
  const a = T.genlik[Math.min(k, T.genlik.length - 1)] || 0;
  const o = gorselOlay(t), c = kapanisC(t);
  const P = IFADE[sc.ifade] || IFADE.normal;
  let bx = 0.16 * Math.sin(t * 0.63), by = 0.1 * Math.sin(t * 0.87 + 1.3);
  if (P.bak) { bx = P.bak[0]; by = P.bak[1]; }
  let kart = 0;
  if (o) {
    kart = pencere(t - o.bas, 0.25, 1.25, 0.3);
    if (o.vurgu) kart = Math.max(kart, pencere(t - o.vurgu.bas + 0.1, 0.2, 1.0, 0.3));
  }
  bx = lerp(bx, 0.85, kart); by = lerp(by, -0.75, kart);
  bx = lerp(bx, 0, c); by = lerp(by, 0, c);
  let kirp = 0;
  for (const b of T.kirpmalar) { const d = t - b; if (d > -0.01 && d < 0.17) kirp = Math.max(kirp, 1 - Math.abs(d - 0.075) / 0.09); }
  const kel = aktifKelime(t), vurgu = kel && /[!?]$/.test(kel.w) ? 1 : 0;
  const kas = { y: P.kasY - 7 * vurgu - 5 * a - 4 * c, r: P.kasR };
  const kasSag = P.kasSag ? { y: P.kasSag.y, r: P.kasSag.r } : kas;
  let kulakSol = P.kulak - 0.05 * c, kulakSag = P.kulak - 0.05 * c;
  for (const [kt, yon] of T.kulaklar) {
    const d = t - kt;
    if (d > 0 && d < 0.35) { const v = Math.sin(d / 0.35 * Math.PI) * 0.24; if (yon < 0) kulakSol += v; else kulakSag += v; }
  }
  return {
    t, m, a, P, bx, by, kirp: clamp(kirp, 0, 1), kasSol: kas, kasSag,
    x: 540, y: 860 - 14 * c + Math.sin(t * 1.6) * 2, s: 1.25 * (1 + 0.07 * c),
    egim: P.egim + 0.035 * Math.sin(t * 0.9) + 0.07 * kart - 0.04 * c,
    bas: -9 * a + 2.5 * Math.sin(t * 2.2), kulakSol, kulakSag,
    kuyruk: Math.sin(t * 1.7) * 0.13 + 0.1 * a, pati: patiPoz(t, sc, o, c, a),
  };
}

function patiPoz(t, sc, o, c, a) {
  const tik = Math.sin(t * 11) * 4 * a;
  let L = { x: -150, y: 372 + tik * 0.5, s: 1 }, Rr = { x: 150, y: 372 - tik * 0.5, s: 1 };
  const dt = t - sc.bas;
  if (o) { const w = pencere(t - o.bas, 0.3, 1.5, 0.35); if (w > 0) Rr = mix(Rr, { x: 250, y: 70, s: 1 }, w); }
  switch (sc.jest) {
    case 'salla': Rr = mix(Rr, { x: 240 + 30 * Math.sin(t * 12), y: 30, s: 1 }, pencere(dt, 0.3, 1.6, 0.3)); break;
    case 'yumruk': Rr = mix(Rr, { x: 215, y: 120 - 50 * Math.abs(Math.sin(t * 9)), s: 1 }, pencere(dt, 0.25, 1.2, 0.3)); break;
    case 'omuz': { const w = pencere(dt, 0.3, 1.4, 0.3); L = mix(L, { x: -255, y: 205, s: 1 }, w); Rr = mix(Rr, { x: 255, y: 205, s: 1 }, w); break; }
    case 'dusun': Rr = mix(Rr, { x: 70, y: 190, s: 1 }, pencere(dt, 0.4, 2.2, 0.4)); break;
    case 'isaret': Rr = mix(Rr, { x: 250, y: 70, s: 1 }, pencere(dt, 0.3, 1.6, 0.3)); break;
    default: break;
  }
  const son = sonSahne();
  if (c > 0) Rr = mix(Rr, { x: 178, y: 128, s: 1.45 }, ease((t - son.bas - 0.2) / 0.35) * (1 - ease((t - son.ses_son - 0.05) / 0.25)));
  if (t > son.ses_son + 0.05) Rr = mix(Rr, { x: 245 + 28 * Math.sin(t * 13), y: 20, s: 1.1 }, ease((t - son.ses_son - 0.05) / 0.3));
  return { L, R: Rr };
}

function kafaYolu(x) {
  x.beginPath();
  x.moveTo(0, -150);
  x.bezierCurveTo(85, -152, 150, -112, 166, -40);
  x.bezierCurveTo(172, -10, 190, 15, 214, 36);
  x.bezierCurveTo(186, 44, 176, 52, 182, 64);
  x.bezierCurveTo(150, 70, 128, 104, 84, 128);
  x.bezierCurveTo(52, 146, 22, 154, 0, 156);
  x.bezierCurveTo(-22, 154, -52, 146, -84, 128);
  x.bezierCurveTo(-128, 104, -150, 70, -182, 64);
  x.bezierCurveTo(-176, 52, -186, 44, -214, 36);
  x.bezierCurveTo(-190, 15, -172, -10, -166, -40);
  x.bezierCurveTo(-150, -112, -85, -152, 0, -150);
  x.closePath();
}

function kulak(x, yon, sarkma) {
  x.save(); x.translate(yon * 92, -112); x.rotate(yon * (0.3 + sarkma));
  const yol = () => { x.beginPath(); x.moveTo(-58, 36); x.bezierCurveTo(-56, -30, -24, -110, 0, -152); x.bezierCurveTo(24, -110, 56, -30, 58, 36); x.closePath(); };
  yol(); x.fillStyle = R.kurk; x.fill();
  x.save(); yol(); x.clip(); x.fillStyle = R.uc; x.beginPath(); x.moveTo(-80, -96); x.quadraticCurveTo(0, -116, 80, -96); x.lineTo(80, -200); x.lineTo(-80, -200); x.fill(); x.restore();
  yol(); x.lineWidth = 5; x.strokeStyle = R.kontur; x.stroke();
  x.beginPath(); x.moveTo(-34, 30); x.bezierCurveTo(-30, -24, -12, -74, 0, -98); x.bezierCurveTo(12, -74, 30, -24, 34, 30); x.closePath();
  x.fillStyle = R.kulakIc; x.fill();
  x.strokeStyle = R.krem; x.lineWidth = 4; x.lineCap = 'round';
  for (const [a, b] of [[-14, 6], [0, -2], [14, 6]]) { x.beginPath(); x.moveTo(a, 32); x.lineTo(b * 0.6 + a * 0.4, b - 30); x.stroke(); }
  x.restore();
}

function goz(x, yon, d) {
  const P = d.P, rx = 31, ry = 37 * (P.goz || 1);
  x.save(); x.translate(yon * 68, -26); x.rotate(yon * 0.1);
  x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = '#FFFFFF'; x.fill();
  x.save(); x.clip();
  const ix = d.bx * 11, iy = d.by * 12;
  const g = x.createRadialGradient(ix - 4, iy - 6, 2, ix, iy, 23);
  g.addColorStop(0, '#8A5426'); g.addColorStop(1, '#2A170B');
  x.beginPath(); x.arc(ix, iy, 23, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  x.beginPath(); x.arc(ix, iy, 11.5 * (P.pupil || 1), 0, Math.PI * 2); x.fillStyle = '#0E0806'; x.fill();
  x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(ix - 8, iy - 10, 7, 0, 7); x.fill();
  x.beginPath(); x.arc(ix + 7, iy + 8, 3, 0, 7); x.fill();
  const ust = Math.max(d.kirp, P.ustKapak || 0);
  if (ust > 0.01) {
    const yb = -ry + 2 * ry * ust;
    x.fillStyle = R.kurk; x.beginPath(); x.moveTo(-rx - 4, -ry - 4); x.lineTo(rx + 4, -ry - 4); x.lineTo(rx + 4, yb);
    x.quadraticCurveTo(0, yb + 12 * ust, -rx - 4, yb); x.closePath(); x.fill();
    x.strokeStyle = R.uc; x.lineWidth = 4.5; x.beginPath(); x.moveTo(-rx, yb); x.quadraticCurveTo(0, yb + 12 * ust, rx, yb); x.stroke();
  }
  const alt = P.kisik || 0;
  if (alt > 0.01 && d.kirp < 0.9) {
    const yb = ry - 2 * ry * alt;
    x.fillStyle = R.kurk; x.beginPath(); x.moveTo(-rx - 4, ry + 4); x.lineTo(rx + 4, ry + 4); x.lineTo(rx + 4, yb);
    x.quadraticCurveTo(0, yb - 14 * alt, -rx - 4, yb); x.closePath(); x.fill();
  }
  x.restore();
  x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.lineWidth = 4.5; x.strokeStyle = R.uc; x.stroke();
  x.lineCap = 'round'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(yon * 26, -24); x.lineTo(yon * 38, -34); x.stroke();
  x.beginPath(); x.moveTo(yon * 30, -14); x.lineTo(yon * 42, -18); x.stroke();
  x.restore();
}

function kas(x, yon, k) {
  x.save(); x.translate(yon * 68, -84 + k.y); x.rotate(-yon * k.r);
  x.beginPath(); x.moveTo(-26, 5); x.quadraticCurveTo(0, -10, 26, 5);
  x.lineWidth = 11; x.lineCap = 'round'; x.strokeStyle = '#8E3E10'; x.stroke();
  x.restore();
}

function agizYolu(x, hw, h, y0) {
  x.beginPath();
  x.moveTo(-hw, y0 + 1);
  x.quadraticCurveTo(0, y0 - 5, hw, y0 + 1);
  x.bezierCurveTo(hw * 1.04, y0 + h * 0.8, hw * 0.6, y0 + h, 0, y0 + h);
  x.bezierCurveTo(-hw * 0.6, y0 + h, -hw * 1.04, y0 + h * 0.8, -hw, y0 + 1);
  x.closePath();
}

function agiz(x, d) {
  const [w, h, r, dis] = d.m, y0 = 76;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = R.uc; x.lineWidth = 4.5;
  x.beginPath(); x.moveTo(0, 60); x.lineTo(0, y0); x.stroke();
  if (h < 3) {
    const gul = 6 + 8 * (d.P.yanak || 0.3);
    x.beginPath(); x.moveTo(-w - 4, y0 - gul * 0.45); x.quadraticCurveTo(-w * 0.5, y0 + gul, 0, y0);
    x.quadraticCurveTo(w * 0.5, y0 + gul, w + 4, y0 - gul * 0.45); x.stroke();
    return;
  }
  const hw = w * (1 - 0.35 * r);
  agizYolu(x, hw, h, y0); x.fillStyle = R.agiz; x.fill();
  x.save(); agizYolu(x, hw, h, y0); x.clip();
  x.fillStyle = R.dil; x.beginPath(); x.ellipse(0, y0 + h * 0.98, hw * 0.72, Math.max(4, h * 0.42), 0, 0, Math.PI * 2); x.fill();
  if (dis > 0.05) { x.fillStyle = '#FFFFFF'; x.beginPath(); x.roundRect(-hw * 0.78, y0 - 6, hw * 1.56, 6 + 8 * dis, 4); x.fill(); }
  x.restore();
  agizYolu(x, hw, h, y0); x.lineWidth = 4.5; x.strokeStyle = R.uc; x.stroke();
}

function burun(x) {
  x.beginPath(); x.moveTo(-25, 42); x.bezierCurveTo(-25, 28, 25, 28, 25, 42); x.bezierCurveTo(25, 54, 7, 63, 0, 65);
  x.bezierCurveTo(-7, 63, -25, 54, -25, 42); x.closePath(); x.fillStyle = R.burun; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(-8, 37, 8, 4.5, -0.2, 0, Math.PI * 2); x.fill();
}

function kulaklik(x) {
  x.lineCap = 'round';
  const bant = () => { x.beginPath(); x.moveTo(-184, -4); x.bezierCurveTo(-188, -132, -82, -172, 0, -172); x.bezierCurveTo(82, -172, 188, -132, 184, -4); };
  bant(); x.strokeStyle = R.kulaklikKoyu; x.lineWidth = 32; x.stroke();
  bant(); x.strokeStyle = R.kulaklik; x.lineWidth = 22; x.stroke();
  bant(); x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 5; x.stroke();
  for (const yon of [-1, 1]) {
    x.save(); x.translate(yon * 192, 14); x.rotate(yon * 0.06);
    rr(x, -38, -68, 76, 136, 32); x.fillStyle = R.kulaklikKoyu; x.fill();
    rr(x, -29, -59, 58, 118, 26); x.fillStyle = R.kulaklik; x.fill();
    x.shadowColor = R.neon; x.shadowBlur = 18;
    rr(x, -18, -44, 36, 88, 18); x.strokeStyle = R.neon; x.lineWidth = 6; x.stroke();
    x.shadowBlur = 0; x.restore();
  }
  x.beginPath(); x.moveTo(-186, 54); x.bezierCurveTo(-180, 120, -130, 142, -86, 130);
  x.strokeStyle = R.kulaklikKoyu; x.lineWidth = 11; x.stroke();
  x.beginPath(); x.ellipse(-76, 128, 19, 14, -0.2, 0, Math.PI * 2); x.fillStyle = '#14131F'; x.fill();
  x.beginPath(); x.ellipse(-80, 124, 8, 5, -0.2, 0, Math.PI * 2); x.fillStyle = 'rgba(51,225,255,0.6)'; x.fill();
}

function kafa(x, d) {
  kulak(x, -1, d.kulakSol); kulak(x, 1, d.kulakSag);
  const g = x.createRadialGradient(-40, -70, 20, 0, 0, 230);
  g.addColorStop(0, R.kurkAcik); g.addColorStop(0.55, R.kurk); g.addColorStop(1, R.kurkKoyu);
  kafaYolu(x); x.fillStyle = g; x.fill();
  x.save(); kafaYolu(x); x.clip();
  x.beginPath(); x.moveTo(-240, 30);
  x.bezierCurveTo(-170, 10, -120, -4, -96, 20); x.bezierCurveTo(-74, 42, -40, 32, -22, 8);
  x.bezierCurveTo(-10, -6, 10, -6, 22, 8); x.bezierCurveTo(40, 32, 74, 42, 96, 20);
  x.bezierCurveTo(120, -4, 170, 10, 240, 30); x.lineTo(240, 220); x.lineTo(-240, 220); x.closePath();
  x.fillStyle = R.krem; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(0, 76, 66, 50, 0, 0, Math.PI * 2); x.fill();
  const rim = x.createLinearGradient(220, 0, 90, 0); rim.addColorStop(0, 'rgba(255,79,216,0.28)'); rim.addColorStop(1, 'rgba(255,79,216,0)');
  x.fillStyle = rim; x.fillRect(-240, -200, 480, 420);
  const rim2 = x.createLinearGradient(-220, 0, -100, 0); rim2.addColorStop(0, 'rgba(51,225,255,0.2)'); rim2.addColorStop(1, 'rgba(51,225,255,0)');
  x.fillStyle = rim2; x.fillRect(-240, -200, 480, 420);
  x.restore();
  kafaYolu(x); x.lineWidth = 5; x.strokeStyle = R.kontur; x.stroke();
  x.beginPath(); x.moveTo(-24, -146); x.lineTo(-10, -170); x.lineTo(0, -150); x.lineTo(12, -172); x.lineTo(24, -146); x.closePath();
  x.fillStyle = R.kurk; x.fill();
  x.fillStyle = `rgba(255,110,130,${0.18 + 0.3 * (d.P.yanak || 0.3)})`;
  for (const yon of [-1, 1]) { x.beginPath(); x.ellipse(yon * 118, 50, 27, 15, 0, 0, Math.PI * 2); x.fill(); }
  goz(x, -1, d); goz(x, 1, d);
  kas(x, -1, d.kasSol); kas(x, 1, d.kasSag);
  agiz(x, d);
  burun(x);
  kulaklik(x);
}

function govde(x, d) {
  x.save(); x.translate(205, 330); x.rotate(-0.35 + d.kuyruk);
  const ky = () => { x.beginPath(); x.moveTo(-10, 30); x.bezierCurveTo(80, 0, 170, -110, 150, -250); x.bezierCurveTo(140, -320, 80, -350, 45, -320); x.bezierCurveTo(85, -250, 60, -140, -40, -50); x.closePath(); };
  ky(); x.fillStyle = R.kurk; x.fill();
  x.save(); ky(); x.clip(); x.fillStyle = R.krem; x.beginPath(); x.ellipse(95, -320, 90, 70, 0.3, 0, Math.PI * 2); x.fill(); x.restore();
  ky(); x.lineWidth = 5; x.strokeStyle = R.kontur; x.stroke();
  x.restore();
  const n = Math.sin(d.t * 1.7) * 1.5;
  x.save(); x.translate(0, n);
  const g = x.createLinearGradient(-200, 120, 200, 430);
  g.addColorStop(0, '#7F63FF'); g.addColorStop(1, R.kapusonluKoyu);
  x.beginPath(); x.moveTo(-118, 118); x.bezierCurveTo(-200, 132, -255, 215, -268, 440); x.lineTo(268, 440);
  x.bezierCurveTo(255, 215, 200, 132, 118, 118); x.closePath(); x.fillStyle = g; x.fill();
  x.beginPath(); x.ellipse(0, 128, 152, 46, 0, 0, Math.PI * 2); x.fillStyle = R.kapusonluKoyu; x.fill();
  x.beginPath(); x.moveTo(-80, 122); x.quadraticCurveTo(-30, 232, 0, 264); x.quadraticCurveTo(30, 232, 80, 122); x.closePath();
  x.fillStyle = R.krem; x.fill();
  x.strokeStyle = '#F3EEFF'; x.lineWidth = 6; x.lineCap = 'round';
  for (const yon of [-1, 1]) { x.beginPath(); x.moveTo(yon * 44, 168); x.quadraticCurveTo(yon * 52, 220, yon * 48, 262); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath(); x.ellipse(-130, 318, 22, 18, 0, 0, Math.PI * 2); x.fill();
  for (const [px, py] of [[-156, 290], [-140, 278], [-120, 278], [-104, 290]]) { x.beginPath(); x.ellipse(px, py, 7.5, 9, 0, 0, Math.PI * 2); x.fill(); }
  x.restore();
  x.fillStyle = 'rgba(10,5,30,0.28)'; x.beginPath(); x.ellipse(0, 154, 150, 34, 0, 0, Math.PI * 2); x.fill();
}

function kol(x, yon, P) {
  const S = { x: yon * 172, y: 205 }, L1 = 135, L2 = 140;
  let dx = P.x - S.x, dy = P.y - S.y;
  const D = Math.hypot(dx, dy), menzil = L1 + L2 - 2;
  const Pp = D > menzil ? { x: S.x + dx / D * menzil, y: S.y + dy / D * menzil } : { x: P.x, y: P.y };
  const Dc = clamp(Math.min(D, menzil), 30, menzil), aci = Math.atan2(dy, dx);
  const B = Math.acos(clamp((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1));
  const yukari = P.y < S.y + 40;
  const ea = aci + (yukari ? yon * B : -yon * B);
  const E = { x: S.x + L1 * Math.cos(ea), y: S.y + L1 * Math.sin(ea) };
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [renk, kal] of [[R.kapusonluKoyu, 76], [R.kapusonlu, 62]]) {
    x.beginPath(); x.moveTo(S.x, S.y); x.lineTo(E.x, E.y); x.lineTo(Pp.x, Pp.y); x.strokeStyle = renk; x.lineWidth = kal; x.stroke();
  }
  const s = P.s || 1;
  x.save(); x.translate(Pp.x, Pp.y); x.scale(s, s);
  x.fillStyle = '#F3EEFF'; x.beginPath(); x.ellipse(0, -18, 40, 16, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = R.uc; x.beginPath(); x.ellipse(0, 4, 44, 36, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5C3A28';
  for (const px of [-22, 0, 22]) { x.beginPath(); x.ellipse(px, 26, 10, 8, 0, 0, Math.PI * 2); x.fill(); }
  x.restore();
}

function tilki(x, d) {
  x.save(); x.translate(d.x, d.y); x.scale(d.s, d.s);
  govde(x, d);
  x.save(); x.translate(0, d.bas); x.rotate(d.egim); kafa(x, d); x.restore();
  x.restore();
}
function tilkiKollar(x, d) {
  x.save(); x.translate(d.x, d.y); x.scale(d.s, d.s);
  kol(x, -1, d.pati.L); kol(x, 1, d.pati.R);
  x.restore();
}

// ------------------------------------------------------------ görsel espriler
function yildiz(x, cx, cy, r, renk) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr_ = i % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr_, cy + Math.sin(a) * rr_); }
  x.closePath(); x.fillStyle = renk; x.fill(); x.lineWidth = 5; x.strokeStyle = '#fff'; x.stroke();
}
function espri(x, t, sc, d) {
  const e = sc.espri; if (!e) return;
  const dt = t - e.bas, sure = e.sure || 2.4;
  if (dt < 0 || dt > sure) return;
  const a = eBack(clamp(dt / 0.3, 0, 1)) * (1 - ease((dt - sure + 0.3) / 0.3));
  const hx = d.x, hy = d.y + d.bas * d.s;
  x.save();
  switch (e.tip) {
    case 'emoji': {
      const px = hx + 268, py = hy - 270 + Math.sin(dt * 5) * 8;
      x.translate(px, py); x.scale(a, a); x.rotate(Math.sin(dt * 6) * 0.08);
      x.beginPath(); x.arc(0, 0, 96, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 8; x.strokeStyle = R.sari; x.stroke();
      x.font = `110px ${EMOJI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e.emoji || '😮', 0, 6);
      if (e.metin) {
        x.font = `900 48px ${YAZI}`; const w = x.measureText(e.metin).width + 40;
        x.rotate(-0.06); rr(x, -w / 2, 104, w, 70, 20); x.fillStyle = R.sari; x.fill();
        x.fillStyle = R.gece; x.fillText(e.metin, 0, 141);
      }
      break;
    }
    case 'unlem': case 'soru': {
      const ch = e.tip === 'unlem' ? '!' : '?', renk = e.tip === 'unlem' ? '#FF3B5C' : R.neon;
      x.font = `900 170px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 12; x.strokeStyle = '#fff';
      [[hx + 240, hy - 250, -0.2], [hx + 315, hy - 190, 0.25]].forEach(([px, py, r], i) => {
        x.save(); x.translate(px, py); x.rotate(r + Math.sin(dt * 9 + i) * 0.12); x.scale(a * (1 - 0.2 * i), a * (1 - 0.2 * i));
        x.strokeText(ch, 0, 0); x.fillStyle = renk; x.fillText(ch, 0, 0); x.restore();
      });
      break;
    }
    case 'ter': {
      const px = hx - 150 * d.s, py = hy - 70 * d.s + dt * 40;
      x.translate(px, py); x.scale(a, a);
      x.beginPath(); x.moveTo(0, -38); x.bezierCurveTo(22, -6, 26, 14, 0, 26); x.bezierCurveTo(-26, 14, -22, -6, 0, -38);
      x.fillStyle = '#7FD7FF'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#fff'; x.stroke();
      break;
    }
    case 'yildiz': {
      for (let i = 0; i < 5; i++) { const an = dt * 3 + i * Math.PI * 2 / 5; yildiz(x, hx + Math.cos(an) * 250, hy - 210 + Math.sin(an) * 60, 30 * a, R.sari); }
      break;
    }
    case 'kalp': {
      x.font = `80px ${EMOJI}`; x.textAlign = 'center';
      for (let i = 0; i < 6; i++) { const ph = (dt * 0.7 + hash(i)) % 1; x.globalAlpha = (1 - ph) * a; x.fillText('💖', hx - 250 + hash(i + 3) * 500, hy - 120 - ph * 380); }
      break;
    }
    case 'konfeti': {
      const renk = [R.sari, R.neon, R.pembe, '#7CFF6B', '#FF7A30'];
      for (let i = 0; i < 90; i++) {
        const px = hash(i) * W, py = ((dt * 650 + hash(i + 9) * H) % (H + 120)) - 60;
        x.save(); x.translate(px + Math.sin(dt * 3 + i) * 20, py); x.rotate(dt * 5 + i); x.globalAlpha = a;
        x.fillStyle = renk[i % renk.length]; x.fillRect(-9, -5, 18, 10); x.restore();
      }
      break;
    }
    case 'gozluk': {
      const s = d.s, gy = lerp(hy - 520, hy - 26 * s, eOut(dt / 0.6));
      x.translate(hx, gy); x.rotate(d.egim); x.globalAlpha = 1 - ease((dt - sure + 0.3) / 0.3);
      const p = 13 * s; x.fillStyle = '#0B0B0B';
      x.fillRect(-11 * p, -2 * p, 22 * p, p);
      for (const yon of [-1, 1]) {
        x.fillRect(yon > 0 ? 1 * p : -10 * p, -p, 9 * p, 3 * p); x.fillRect(yon > 0 ? 2 * p : -9 * p, 2 * p, 7 * p, p);
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(yon > 0 ? 2 * p : -9 * p, -p, 2 * p, p); x.fillStyle = '#0B0B0B';
      }
      break;
    }
    case 'patlama': {
      x.translate(hx - 260, hy - 300); x.scale(a, a); x.rotate(-0.12);
      x.beginPath();
      for (let i = 0; i < 24; i++) { const an = i * Math.PI / 12, r = i % 2 ? 80 : 140; x.lineTo(Math.cos(an) * r * 1.3, Math.sin(an) * r); }
      x.closePath(); x.fillStyle = R.sari; x.fill(); x.lineWidth = 8; x.strokeStyle = '#FF3B5C'; x.stroke();
      x.font = `900 54px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = R.gece; x.fillText(e.metin || 'BOOM!', 0, 4);
      break;
    }
    default: break;
  }
  x.restore();
}

// ------------------------------------------------------------ kamera (stüdyo + tilki)
function kameraCiz(t, k, sc) {
  kc.drawImage(statik, 0, 0);
  studyoAnim(kc, t);
  const d = tilkiDurum(t, k, sc);
  tilki(kc, d);
  kc.drawImage(masa, 0, 0);
  masaAnim(kc, t);
  tilkiKollar(kc, d);
  espri(kc, t, sc, d);
}

function kameraYerlestir(t, g, c, sc) {
  const e = g, asp = lerp(W / H, 1, e);
  const z = lerp(sc.zoom || 1, 1, e) * (1 + 0.012 * Math.sin(t * 0.5)) * (1 + 0.28 * c);
  const sw = lerp(W / z, 690, e), sh = sw / asp;
  const cx = 540, cy = lerp(960 - 70 * c, 835, e);
  const sx = clamp(cx - sw / 2, 0, W - sw), sy = clamp(cy - sh / 2, 0, H - sh);
  const dw = lerp(W, KAM.w, e), dh = dw / asp, dx = lerp(0, KAM.x, e), dy = lerp(0, KAM.y, e);
  ac.save();
  if (e > 0.001) {
    ac.shadowColor = 'rgba(0,0,0,0.55)'; ac.shadowBlur = 34 * e;
    rr(ac, dx, dy, dw, dh, 40 * e); ac.fillStyle = '#000'; ac.fill(); ac.shadowBlur = 0;
    rr(ac, dx, dy, dw, dh, 40 * e); ac.clip();
  }
  ac.drawImage(kam, sx, sy, sw, sh, dx, dy, dw, dh);
  ac.restore();
  if (e > 0.001) {
    const gr = ac.createLinearGradient(dx, dy, dx + dw, dy + dh);
    gr.addColorStop(0, R.neon); gr.addColorStop(1, R.pembe);
    rr(ac, dx, dy, dw, dh, 40 * e); ac.lineWidth = 8 * e; ac.strokeStyle = gr; ac.stroke();
    ac.save(); ac.globalAlpha = ease((e - 0.5) / 0.5);
    ac.font = `800 26px ${YAZI}`; const w = ac.measureText('CANLI').width + 56;
    rr(ac, dx + 18, dy + 18, w, 44, 22); ac.fillStyle = '#E8213F'; ac.fill();
    ac.fillStyle = '#fff'; ac.beginPath(); ac.arc(dx + 40, dy + 40, 7 * (0.7 + 0.3 * Math.sin(t * 6)), 0, 7); ac.fill();
    ac.textBaseline = 'middle'; ac.fillText('CANLI', dx + 54, dy + 41);
    ac.restore();
  }
}

// ------------------------------------------------------------ görsel kartı
function kirpHesapla(o, t, im) {
  const iw = im.naturalWidth, ih = im.naturalHeight;
  const kapla = Math.max(KW / iw, KH / ih);
  const sure = Math.max(0.1, o.son - o.bas);
  const kb = 1 + 0.06 * clamp((t - o.bas) / sure, 0, 1);
  let z = kb, fx = (o.odak || [0.5, 0.5])[0] * iw, fy = (o.odak || [0.5, 0.5])[1] * ih;
  if (o.vurgu) {
    const pv = ease((t - o.vurgu.bas) / 0.6);
    const [bx, by, bw, bh] = o.vurgu.kutu;
    const zSigar = Math.min(0.78 * KW / (bw * iw * kapla), 0.78 * KH / (bh * ih * kapla));
    const zt = Math.max(1, Math.min(o.vurgu.yakinlik || 1.35, zSigar));
    z = lerp(kb, zt * kb, pv); fx = lerp(fx, (bx + bw / 2) * iw, pv); fy = lerp(fy, (by + bh / 2) * ih, pv);
  }
  const vw = KW / (kapla * z), vh = KH / (kapla * z);
  return { sx: clamp(fx - vw / 2, 0, iw - vw), sy: clamp(fy - vh / 2, 0, ih - vh), vw, vh, k: kapla * z };
}

function vurguCiz(o, t, im, kr) {
  const v = o.vurgu, dv = t - v.bas;
  if (dv < 0.3) return;
  const [bx, by, bw, bh] = v.kutu, iw = im.naturalWidth, ih = im.naturalHeight;
  const X = (bx * iw - kr.sx) * kr.k, Y = (by * ih - kr.sy) * kr.k, Wd = bw * iw * kr.k, Hd = bh * ih * kr.k;
  const a = ease((dv - 0.3) / 0.25);
  ac.save(); ac.globalAlpha *= 0.45 * a; ac.fillStyle = '#000';
  ac.beginPath(); ac.rect(0, 0, KW, KH);
  if (v.tip === 'daire') ac.ellipse(X + Wd / 2, Y + Hd / 2, Wd / 2 + 10, Hd / 2 + 10, 0, 0, Math.PI * 2); else ac.roundRect(X, Y, Wd, Hd, 18);
  ac.fill('evenodd'); ac.restore();
  const q = eOut((dv - 0.3) / 0.4), cevre = 2 * (Wd + Hd) + 40;
  ac.save(); ac.lineWidth = 9; ac.strokeStyle = R.sari; ac.shadowColor = 'rgba(255,210,63,0.9)'; ac.shadowBlur = 22;
  ac.setLineDash([cevre * q, cevre]);
  ac.beginPath();
  if (v.tip === 'daire') ac.ellipse(X + Wd / 2, Y + Hd / 2, Wd / 2 + 10, Hd / 2 + 10, 0, -Math.PI / 2, Math.PI * 1.5); else ac.roundRect(X, Y, Wd, Hd, 18);
  ac.stroke(); ac.restore();
  if (v.yazi && q > 0.6) {
    ac.save(); ac.globalAlpha *= ease((q - 0.6) / 0.3);
    ac.font = `900 40px ${YAZI}`; const w = ac.measureText(v.yazi).width + 36;
    const lx = clamp(X + Wd / 2 - w / 2, 12, KW - w - 12), ly = Y > 80 ? Y - 66 : Y + Hd + 12;
    rr(ac, lx, ly, w, 56, 16); ac.fillStyle = R.sari; ac.fill();
    ac.fillStyle = R.gece; ac.textBaseline = 'middle'; ac.fillText(v.yazi, lx + 18, ly + 30); ac.restore();
  }
}

function kartCiz(o, t, alfa, yon, g, p) {
  const im = G[o.anahtar], meta = T.gorseller[o.anahtar];
  ac.save();
  ac.globalAlpha = alfa * clamp(g * 1.3, 0, 1);
  const pe = yon === 0 ? eBack(clamp(p, 0, 1)) : 1;
  const ox = yon === 1 ? (1 - alfa) * W * 0.6 : yon === -1 ? -(1 - alfa) * W * 0.6 : 0;
  const s = (yon === 0 ? lerp(0.86, 1, pe) : 1) * lerp(0.92, 1, g);
  ac.translate(KX + KW / 2 + ox, KY + KH / 2 + (1 - g) * 80);
  ac.rotate(yon === 0 ? lerp(-0.035, 0, pe) : 0); ac.scale(s, s); ac.translate(-KW / 2, -KH / 2);
  ac.shadowColor = 'rgba(0,0,0,0.55)'; ac.shadowBlur = 40; ac.shadowOffsetY = 16;
  rr(ac, -8, -8, KW + 16, KH + 16, 40); ac.fillStyle = '#fff'; ac.fill();
  ac.shadowColor = 'transparent';
  ac.save(); rr(ac, 0, 0, KW, KH, 32); ac.clip();
  const kr = kirpHesapla(o, t, im);
  ac.drawImage(im, kr.sx, kr.sy, kr.vw, kr.vh, 0, 0, KW, KH);
  if (o.vurgu) vurguCiz(o, t, im, kr);
  ac.restore();
  const etiket = o.etiket || meta.etiket;
  if (etiket) {
    ac.font = `900 30px ${YAZI}`; const w = ac.measureText(etiket).width + 40;
    rr(ac, 22, 22, w, 54, 16); ac.fillStyle = R.sari; ac.fill();
    ac.fillStyle = R.gece; ac.textBaseline = 'middle'; ac.fillText(etiket, 42, 51);
  }
  if (meta.sahip) {
    const yazi = 'Görsel: ' + meta.sahip;
    ac.font = `700 24px ${YAZI}`; const w = ac.measureText(yazi).width + 32;
    rr(ac, 20, KH - 62, w, 42, 14); ac.fillStyle = 'rgba(12,8,28,0.72)'; ac.fill();
    ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText(yazi, 36, KH - 40);
  }
  ac.restore();
}

function kart(t, g) {
  const o = gorselOlay(t);
  if (!o) return;
  const p = (t - o.bas) / 0.45, onc = oncekiOlay(o);
  const gecis = onc && Math.abs(onc.son - o.bas) < 0.3 && p < 1;
  if (gecis) kartCiz(onc, t, 1 - eOut(p), -1, g, 1);
  kartCiz(o, t, gecis ? eOut(p) : 1, gecis ? 1 : 0, g, p);
}

function panel(t, g, sc) {
  if (!sc.ekran || g < 0.05) return;
  const o = gorselOlay(t), bas = Math.max(sc.bas, o ? o.bas : sc.bas);
  const p = eBack(clamp((t - bas - 0.15) / 0.4, 0, 1));
  const x = 400, y = KAM.y, w = 560, h = KAM.w;
  ac.save(); ac.globalAlpha = clamp(g * 1.5, 0, 1) * clamp(p * 1.5, 0, 1);
  ac.translate(x + w / 2, y + h / 2); ac.scale(lerp(0.8, 1, p), lerp(0.8, 1, p)); ac.translate(-w / 2, -h / 2);
  rr(ac, 0, 0, w, h, 34); ac.fillStyle = 'rgba(20,12,44,0.86)'; ac.fill();
  ac.lineWidth = 5; ac.strokeStyle = R.pembe; ac.stroke();
  const f = sigdir(ac, sc.ekran, 900, 84, 44, w - 60, 3);
  ac.font = `900 ${f.boyut}px ${YAZI}`; ac.textAlign = 'center'; ac.textBaseline = 'middle';
  const lh = f.boyut * 1.12, y0 = h / 2 - (f.satir.length - 1) * lh / 2;
  f.satir.forEach((l, i) => { ac.fillStyle = i === 0 ? R.sari : '#fff'; ac.fillText(l, w / 2, y0 + i * lh); });
  ac.restore();
}

function baslikYazisi(t, sc, g) {
  if (!sc.ekran || g > 0.4) return;
  const p = (t - sc.bas - 0.05) / 0.35;
  if (p < 0) return;
  const pe = eBack(clamp(p, 0, 1));
  const f = sigdir(ac, sc.ekran, 900, 104, 60, 900, 2);
  ac.font = `900 ${f.boyut}px ${YAZI}`;
  const lh = f.boyut * 1.1, gw = Math.max(...f.satir.map((l) => ac.measureText(l).width)), gh = lh * f.satir.length;
  ac.save(); ac.globalAlpha = 1 - ease(g / 0.4);
  ac.translate(540, 335); ac.rotate(-0.025); ac.scale(lerp(0.5, 1, pe), lerp(0.5, 1, pe));
  ac.shadowColor = 'rgba(0,0,0,0.45)'; ac.shadowBlur = 24; ac.shadowOffsetY = 10;
  rr(ac, -gw / 2 - 34, -gh / 2 - 20, gw + 68, gh + 40, 22); ac.fillStyle = R.sari; ac.fill();
  ac.shadowColor = 'transparent';
  ac.fillStyle = R.gece; ac.textAlign = 'center'; ac.textBaseline = 'middle';
  f.satir.forEach((l, i) => ac.fillText(l, 0, -gh / 2 + lh / 2 + i * lh + 4));
  ac.restore();
}

function ust(t) {
  ac.fillStyle = 'rgba(255,255,255,0.18)'; ac.fillRect(0, 0, W, 10);
  ac.fillStyle = R.sari; ac.fillRect(0, 0, W * clamp(t / T.sure, 0, 1), 10);
  ac.save(); ac.textBaseline = 'middle';
  ac.font = `900 34px ${YAZI}`;
  const marka = '🦊 ' + T.marka, w1 = ac.measureText(marka).width + 48;
  ac.shadowColor = 'rgba(0,0,0,0.35)'; ac.shadowBlur = 14;
  rr(ac, 44, 62, w1, 66, 33); ac.fillStyle = R.kurk; ac.fill(); ac.shadowBlur = 0;
  ac.fillStyle = '#fff'; ac.fillText(marka, 68, 97);
  if (T.oyun) {
    ac.font = `800 30px ${YAZI}`; const w2 = ac.measureText(T.oyun).width + 44;
    rr(ac, 44 + w1 + 14, 62, w2, 66, 33); ac.fillStyle = 'rgba(20,12,44,0.85)'; ac.fill();
    ac.lineWidth = 3; ac.strokeStyle = 'rgba(255,255,255,0.5)'; ac.stroke();
    ac.fillStyle = '#fff'; ac.fillText(T.oyun, 44 + w1 + 36, 97);
  }
  if (T.onizleme) {
    ac.font = `800 24px ${YAZI}`; const y = 'ÖNİZLEME · espeak sesi', w3 = ac.measureText(y).width + 32;
    rr(ac, W - 44 - w3, 150, w3, 44, 14); ac.fillStyle = 'rgba(232,33,63,0.9)'; ac.fill();
    ac.fillStyle = '#fff'; ac.fillText(y, W - 28 - w3, 173);
  }
  ac.restore();
}

function kelimeDizgisi(kelimeler, t, maxW, boyut, renkler, x0, yMerkez, lh) {
  ac.font = `800 ${boyut}px ${YAZI}`;
  const bosluk = ac.measureText(' ').width, satirlar = [];
  let cur = [], cw = 0;
  for (const k of kelimeler) {
    const kw = ac.measureText(k.w).width;
    if (cur.length && cw + bosluk + kw > maxW) { satirlar.push([cur, cw]); cur = []; cw = 0; }
    cw += (cur.length ? bosluk : 0) + kw; cur.push({ ...k, kw });
  }
  if (cur.length) satirlar.push([cur, cw]);
  const y0 = yMerkez - (satirlar.length - 1) * lh / 2;
  satirlar.forEach(([sat, sw], i) => {
    let x = x0 - sw / 2;
    const y = y0 + i * lh;
    for (let j = 0; j < sat.length; j++) {
      const k = sat[j], sonraki = kelimeler[kelimeler.indexOf(k) + 1];
      const simdi = t >= k.bas - 0.02 && t < (sonraki ? sonraki.bas : k.son + 0.3);
      const gecti = t >= k.bas - 0.02;
      ac.save();
      if (simdi) { ac.translate(x + k.kw / 2, y); ac.scale(1.08, 1.08); ac.translate(-(x + k.kw / 2), -y); }
      renkler(ac, k, simdi, gecti, x, y);
      ac.restore();
      x += k.kw + bosluk;
    }
  });
}

function altyazi(t) {
  let p = null;
  for (const a of T.altyazi) if (t >= a.bas && t < a.son) { p = a; break; }
  if (!p || T.sahneler[p.s].duzen === 'kapanis') return;
  const kel = T.kelimeler.slice(p.i0, p.i1 + 1);
  const pp = eBack(clamp((t - p.bas) / 0.14, 0, 1));
  ac.save();
  ac.translate(ALT_X, ALT_Y); ac.scale(lerp(0.86, 1, pp), lerp(0.86, 1, pp)); ac.translate(-ALT_X, -ALT_Y);
  ac.textBaseline = 'middle'; ac.lineJoin = 'round';
  kelimeDizgisi(kel, t, ALT_W, 70, (x, k, simdi, gecti, px, py) => {
    x.lineWidth = 15; x.strokeStyle = 'rgba(10,6,24,0.95)'; x.strokeText(k.w, px, py);
    x.fillStyle = simdi ? R.sari : '#FFFFFF'; x.fillText(k.w, px, py);
  }, ALT_X, ALT_Y, 86);
  ac.restore();
}

function kapanisBalonu(t, c) {
  if (c <= 0.01) return;
  const sc = sonSahne(), kel = T.kelimeler.slice(sc.k0, sc.k1 + 1);
  ac.font = `800 58px ${YAZI}`;
  const satirSay = Math.min(4, satirla(ac, kel.map((k) => k.w).join(' '), 820).length);
  const bx = 70, bw = 940, by = 170, bh = satirSay * 74 + 76;
  const pc = eBack(c);
  ac.save();
  ac.translate(540, by + bh / 2); ac.scale(lerp(0.6, 1, pc), lerp(0.6, 1, pc)); ac.translate(-540, -(by + bh / 2));
  ac.shadowColor = 'rgba(0,0,0,0.45)'; ac.shadowBlur = 30; ac.shadowOffsetY = 12;
  rr(ac, bx, by, bw, bh, 46); ac.fillStyle = '#fff'; ac.fill();
  ac.beginPath(); ac.moveTo(560, by + bh - 4); ac.lineTo(640, by + bh - 4); ac.lineTo(600, by + bh + 58); ac.closePath(); ac.fill();
  ac.shadowColor = 'transparent';
  ac.textBaseline = 'middle';
  kelimeDizgisi(kel, t, 820, 58, (x, k, simdi, gecti, px, py) => {
    x.fillStyle = simdi ? '#E8452C' : gecti ? R.kurk : R.gece; x.fillText(k.w, px, py);
  }, 540, by + bh / 2, 74);
  ac.restore();
  if (t > sc.ses_son) {
    const p = eBack(clamp((t - sc.ses_son) / 0.3, 0, 1)), n = 1 + 0.05 * Math.sin(t * 8);
    ac.save(); ac.translate(ALT_X, ALT_Y); ac.scale(p * n, p * n);
    ac.font = `900 64px ${YAZI}`; const y = 'Yorumlara yaz 👇', w = ac.measureText(y).width + 70;
    rr(ac, -w / 2, -52, w, 104, 52); ac.fillStyle = R.kurk; ac.fill(); ac.lineWidth = 6; ac.strokeStyle = '#fff'; ac.stroke();
    ac.fillStyle = '#fff'; ac.textAlign = 'center'; ac.textBaseline = 'middle'; ac.fillText(y, 0, 4);
    ac.restore();
  }
}

// ------------------------------------------------------------ kare
function ciz(t, k) {
  const sc = T.sahneler[sahneNo(t)];
  const g = duzenG(t), c = kapanisC(t);
  kameraCiz(t, k, sc);
  ac.save();
  ac.fillStyle = '#000'; ac.fillRect(0, 0, W, H);
  if (g > 0.001) { ac.drawImage(bulanik, 0, 0); kart(t, g); panel(t, g, sc); }
  kameraYerlestir(t, g, c, sc);
  if (sc.duzen !== 'kapanis') baslikYazisi(t, sc, g);
  ust(t);
  if (c < 0.5) altyazi(t);
  kapanisBalonu(t, c);
  ac.restore();
}
