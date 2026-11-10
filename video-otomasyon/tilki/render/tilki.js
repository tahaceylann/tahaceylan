/* Fox Bülten — TV haber kanalı teması, insansı "gamer" spiker tilki.
 * hazirla(zaman) bir kez, kare(k) her kare için çağrılır ve JPEG data URL döndürür.
 * Her kare yalnızca zamana bağlıdır (durumsuz), bu yüzden kareler paralel işçilerde çizilebilir.
 */
'use strict';
const W = 1080, H = 1920;
const YAZI = '"Inter", "Noto Color Emoji", "DejaVu Sans", sans-serif';
const EMOJI = '"Noto Color Emoji", sans-serif';
const R = {
  kurk: '#D4521D', kurkKoyu: '#9C3410', kurkAcik: '#F0803D', kontur: '#5A1D08', krem: '#FFF4E8', siyah: '#1C1311',
  iris1: '#FFC93C', iris2: '#E25B0E', ceket: '#16203D', ceketAcik: '#26335F', forma: '#111319',
  kirmizi: '#E3122D', camgobegi: '#2DE2E6', lacivert: '#0A1630', mavi: '#1E4FD8', altin: '#FFC233',
  gece: '#0B1430', eldiven: '#111116', parmak: '#2A1915',
};
const IFADE = {  // kas r>0: iç uç yukarı (endişe), r<0: iç uç aşağı (kararlı)
  normal:  { kasY: 0, kasR: -0.04, egim: 0, kulak: 0, goz: 1, kisik: 0.05, gulus: 0.15 },
  heyecan: { kasY: -9, kasR: 0.06, egim: -0.03, kulak: -0.05, goz: 1.12, kisik: 0, gulus: 0.5, pupil: 1.6 },
  saskin:  { kasY: -16, kasR: 0.12, egim: 0.03, kulak: -0.08, goz: 1.22, kisik: 0, gulus: 0.1, pupil: 0.8 },
  supheli: { kasY: 4, kasR: -0.14, egim: 0.06, kulak: 0.05, goz: 0.85, kisik: 0.25, gulus: 0.2, kasSag: { y: -10, r: 0.12 } },
  uzgun:   { kasY: -3, kasR: 0.3, egim: 0.05, kulak: 0.3, goz: 0.95, kisik: 0.1, gulus: -0.4 },
  gulme:   { kasY: -6, kasR: 0.02, egim: -0.05, kulak: -0.04, goz: 1, kisik: 0.4, gulus: 0.7 },
  dusunme: { kasY: -6, kasR: -0.06, egim: 0.08, kulak: 0.04, goz: 0.95, kisik: 0.12, gulus: 0.1, bak: [-0.6, -0.7] },
  ciddi:   { kasY: 2, kasR: -0.08, egim: 0, kulak: 0, goz: 1, kisik: 0.08, gulus: 0 },
};
const SPIKER = { x: 540, y: 600, s: 1.25 };           // kamera tuvalinde spiker
const BROLL = { x: 0, y: 150, w: 1080, h: 780 };       // görüntü / grafik alanı
const PIP = { x: 40, y: 944, w: 300, h: 222 };         // spiker penceresi (görüntü modunda)
const KUNYE = { x: 356, y: 944, w: 564, h: 222 };      // künye kutusu
const ALTBANT_Y = 1188, ALTYAZI_Y = 1420, ALTYAZI_X = 490, ALTYAZI_W = 820, BANT_Y = 1522;

let T = null, ana, ac, kam, kc, statik, masa, arka;
const G = {};

// ------------------------------------------------------------ yardımcılar
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const eOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const eBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const pencere = (dt, giris, sure, cikis) => ease(dt / giris) * (1 - ease((dt - sure) / cikis));
function tuval() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
function satirla(x, metin, maxW) {
  const kel = String(metin).split(/\s+/).filter(Boolean), satir = [];
  let cur = '';
  for (const k of kel) { const d = cur ? cur + ' ' + k : k; if (cur && x.measureText(d).width > maxW) { satir.push(cur); cur = k; } else cur = d; }
  if (cur) satir.push(cur);
  return satir;
}
function sigdir(x, metin, agirlik, buyuk, kucuk, maxW, maxSatir) {
  for (let b = buyuk; b >= kucuk; b -= 2) {
    x.font = `${agirlik} ${b}px ${YAZI}`;
    const s = satirla(x, metin, maxW);
    if (s.length <= maxSatir && s.every((l) => x.measureText(l).width <= maxW)) return { boyut: b, satir: s };
  }
  x.font = `${agirlik} ${kucuk}px ${YAZI}`;
  return { boyut: kucuk, satir: satirla(x, metin, maxW).slice(0, maxSatir) };
}
function simetrik(x, P0, parcalar) {
  x.beginPath(); x.moveTo(P0[0], P0[1]);
  const uc = [P0];
  for (const p of parcalar) {
    if (p[0] === 'L') x.lineTo(p[1][0], p[1][1]);
    else if (p[0] === 'Q') x.quadraticCurveTo(p[1][0], p[1][1], p[2][0], p[2][1]);
    else x.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
    uc.push(p[p.length - 1]);
  }
  for (let i = parcalar.length - 1; i >= 0; i--) {
    const p = parcalar[i], s = uc[i];
    if (p[0] === 'L') x.lineTo(-s[0], s[1]);
    else if (p[0] === 'Q') x.quadraticCurveTo(-p[1][0], p[1][1], -s[0], s[1]);
    else x.bezierCurveTo(-p[2][0], p[2][1], -p[1][0], p[1][1], -s[0], s[1]);
  }
  x.closePath();
}
function amblem(x, cx, cy, s, renk, goz) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.beginPath(); x.moveTo(-50, -36); x.lineTo(-36, -62); x.lineTo(-16, -34); x.lineTo(16, -34); x.lineTo(36, -62);
  x.lineTo(50, -36); x.lineTo(42, 6); x.lineTo(0, 48); x.lineTo(-42, 6); x.closePath(); x.fillStyle = renk; x.fill();
  if (goz) {
    x.fillStyle = goz;
    for (const y of [-1, 1]) { x.beginPath(); x.moveTo(y * 10, -6); x.lineTo(y * 32, -14); x.lineTo(y * 26, 0); x.closePath(); x.fill(); }
    x.beginPath(); x.moveTo(-9, 24); x.lineTo(9, 24); x.lineTo(0, 34); x.closePath(); x.fill();
  }
  x.restore();
}

// ------------------------------------------------------------ zaman sorguları
function sahneNo(t) { const S = T.sahneler; for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].bas) return i; return 0; }
function gorselOlay(t) { for (const o of T.gorsel_olaylari) if (t >= o.bas && t < o.son) return o; return null; }
function oncekiOlay(o) { const i = T.gorsel_olaylari.indexOf(o); return i > 0 ? T.gorsel_olaylari[i - 1] : null; }
function duzenG(t) { for (const [a, b] of T.pencereler) if (t >= a && t < b) return ease(Math.min((t - a) / 0.42, (b - t) / 0.38, 1)); return 0; }
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
    const im = new Image(); im.onload = () => { G[k] = im; ok(); }; im.onerror = () => red(new Error('görsel yüklenemedi: ' + k)); im.src = v.src;
  })));
  for (const f of ['900 60px Inter', '800 60px Inter', '700 60px Inter', '60px "Noto Color Emoji"']) {
    try { await document.fonts.load(f, 'AaÇğİşÖü🦊'); } catch (e) { /* sistem fontu */ }
  }
  statik = statikStudyo(); masa = masaTuvali(); arka = arkaPlan();
  return true;
}
function kare(k) { ciz(k / T.fps, k); return ana.toDataURL('image/jpeg', 0.92); }

// ------------------------------------------------------------ haber stüdyosu
function statikStudyo() {
  const c = tuval(), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060E24'); g.addColorStop(0.45, '#0D2152'); g.addColorStop(1, '#071029');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let r = 0; r < 7; r++) for (let s = 0; s < 7; s++) {          // LED video duvarı
    const px = -50 + s * 172, py = 100 + r * 172;
    x.fillStyle = `rgba(${30 + 40 * hash(r * 9 + s)}, ${80 + 50 * hash(r + s * 5)}, 216, ${0.07 + 0.08 * hash(r * 3 + s * 7)})`;
    x.fillRect(px, py, 164, 164);
  }
  for (const cx of [60, 1020]) {                                     // ışık sütunları
    const lg = x.createLinearGradient(cx - 30, 0, cx + 30, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, 'rgba(120,170,255,0.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lg; x.fillRect(cx - 30, 100, 60, 1100);
  }
  const rg = x.createRadialGradient(540, 560, 40, 540, 560, 560);
  rg.addColorStop(0, 'rgba(70,120,255,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(227,18,45,0.85)'; x.fillRect(0, 1060, W, 26);  // duvar şeridi
  x.save(); x.font = `900 20px ${YAZI}`; x.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 8; i++) x.fillText('OYUN GÜNDEMİ  •', 10 + i * 210, 1080);
  x.restore();
  return c;
}
function masaTuvali() {
  const c = tuval(), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 1150, 0, 1250);
  g.addColorStop(0, '#2A3C74'); g.addColorStop(1, '#101A3A');
  x.beginPath(); x.moveTo(-40, 1172); x.quadraticCurveTo(540, 1138, 1120, 1172); x.lineTo(1120, 1250);
  x.quadraticCurveTo(540, 1214, -40, 1250); x.closePath(); x.fillStyle = g; x.fill();
  x.beginPath(); x.moveTo(-40, 1172); x.quadraticCurveTo(540, 1138, 1120, 1172); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.45)'; x.stroke();
  g = x.createLinearGradient(0, 1230, 0, H); g.addColorStop(0, '#0E1836'); g.addColorStop(1, '#050A1A');
  x.beginPath(); x.moveTo(-40, 1250); x.quadraticCurveTo(540, 1214, 1120, 1250); x.lineTo(1120, H); x.lineTo(-40, H); x.closePath(); x.fillStyle = g; x.fill();
  amblem(x, 540, 1690, 2.2, 'rgba(255,255,255,0.10)');
  x.fillStyle = '#B9C2D9'; rr(x, 196, 1100, 74, 86, 12); x.fill();   // kupa
  x.lineWidth = 12; x.strokeStyle = '#B9C2D9'; x.beginPath(); x.arc(274, 1140, 22, -1.2, 1.2); x.stroke();
  x.fillStyle = R.kirmizi; x.fillRect(196, 1124, 74, 18);
  x.save(); x.translate(840, 1160); x.rotate(-0.12);                   // oyun kolu
  x.fillStyle = '#15151E'; x.beginPath(); x.moveTo(-80, -10); x.bezierCurveTo(-90, -40, -40, -44, 0, -36);
  x.bezierCurveTo(40, -44, 90, -40, 80, -10); x.bezierCurveTo(96, 34, 64, 46, 44, 18); x.lineTo(-44, 18);
  x.bezierCurveTo(-64, 46, -96, 34, -80, -10); x.fill();
  x.fillStyle = '#3B3B4D'; x.fillRect(-56, -20, 26, 8); x.fillRect(-47, -29, 8, 26);
  for (const [bx, by, r] of [[46, -24, '#2DE2E6'], [60, -12, '#E3122D'], [32, -12, '#FFC233'], [46, 0, '#7CFF6B']]) { x.fillStyle = r; x.beginPath(); x.arc(bx, by, 6, 0, 7); x.fill(); }
  x.restore();
  return c;
}
function arkaPlan() {
  const c = tuval(), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#08122C'); g.addColorStop(1, '#040817');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(80,130,255,0.07)'; x.lineWidth = 2;
  for (let i = 0; i < W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 60) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  return c;
}
function studyoAnim(x, t) {
  x.save(); x.translate(540, 470); x.strokeStyle = 'rgba(45,226,230,0.22)'; x.lineWidth = 3;   // dönen küre
  const r = 300;
  x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke();
  for (let i = -2; i <= 2; i++) { const yy = i * r / 3; x.beginPath(); x.ellipse(0, yy, Math.sqrt(r * r - yy * yy), 22 * (1 - Math.abs(i) / 3) + 1, 0, 0, Math.PI * 2); x.stroke(); }
  for (let i = 0; i < 6; i++) { const ph = (t * 0.35 + i / 6) * Math.PI; x.beginPath(); x.ellipse(0, 0, Math.abs(Math.cos(ph)) * r + 0.5, r, 0, 0, Math.PI * 2); x.stroke(); }
  x.restore();
  const sx = ((t * 260) % 1800) - 400;                               // ışık süpürmesi
  const lg = x.createLinearGradient(sx - 120, 0, sx + 120, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(160,200,255,0.10)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = lg; x.fillRect(0, 100, W, 960);
}
function masaAnim(x, t) {
  const g = x.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, i % 2 ? R.kirmizi : `rgba(255,60,80,${0.5 + 0.4 * Math.sin(t * 3 + i)})`);
  x.save(); x.shadowColor = 'rgba(227,18,45,0.9)'; x.shadowBlur = 18; x.fillStyle = g;
  x.beginPath(); x.moveTo(-40, 1252); x.quadraticCurveTo(540, 1216, 1120, 1252); x.lineTo(1120, 1262); x.quadraticCurveTo(540, 1226, -40, 1262); x.closePath(); x.fill(); x.restore();
  x.save(); x.lineWidth = 4; x.lineCap = 'round';                   // kupa buharı
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    for (let y = 0; y <= 70; y += 5) { const px = 218 + i * 16 + Math.sin(y * 0.08 + t * 3 + i) * 7, py = 1094 - y; if (y === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.strokeStyle = `rgba(255,255,255,${0.14 + 0.05 * Math.sin(t * 2 + i)})`; x.stroke();
  }
  x.restore();
  const h = (t * 90) % 360;                                           // oyun kolu RGB
  x.save(); x.translate(840, 1160); x.rotate(-0.12); x.strokeStyle = `hsl(${h},95%,60%)`; x.lineWidth = 4; x.shadowColor = x.strokeStyle; x.shadowBlur = 12;
  x.beginPath(); x.moveTo(-60, -34); x.quadraticCurveTo(0, -46, 60, -34); x.stroke(); x.restore();
}

// ------------------------------------------------------------ spiker tilki
function spikerDurum(t, k, sc) {
  const m = T.agiz[Math.min(k, T.agiz.length - 1)] || [24, 0, 0, 0];
  const a = T.genlik[Math.min(k, T.genlik.length - 1)] || 0;
  const o = gorselOlay(t), c = kapanisC(t), P = IFADE[sc.ifade] || IFADE.normal;
  let bx = 0.14 * Math.sin(t * 0.63), by = 0.08 * Math.sin(t * 0.87 + 1.3);
  if (P.bak) { bx = P.bak[0]; by = P.bak[1]; }
  let ekrana = 0;
  if (o) { ekrana = pencere(t - o.bas, 0.25, 1.1, 0.3); if (o.vurgu) ekrana = Math.max(ekrana, pencere(t - o.vurgu.bas + 0.1, 0.2, 0.9, 0.3)); }
  bx = lerp(bx, 0.55, ekrana); by = lerp(by, -0.9, ekrana);
  bx = lerp(bx, 0, c); by = lerp(by, 0, c);
  let kirp = 0;
  for (const b of T.kirpmalar) { const d = t - b; if (d > -0.01 && d < 0.17) kirp = Math.max(kirp, 1 - Math.abs(d - 0.075) / 0.09); }
  const kel = aktifKelime(t), vurgu = kel && /[!?]$/.test(kel.w) ? 1 : 0;
  const kas = { y: P.kasY - 7 * vurgu - 4 * a - 3 * c, r: P.kasR };
  const kasSag = P.kasSag ? { y: P.kasSag.y, r: P.kasSag.r } : kas;
  let kulakSol = P.kulak - 0.04 * c, kulakSag = P.kulak - 0.04 * c;
  for (const [kt, yon] of T.kulaklar) { const d = t - kt; if (d > 0 && d < 0.35) { const v = Math.sin(d / 0.35 * Math.PI) * 0.2; if (yon < 0) kulakSol += v; else kulakSag += v; } }
  return {
    t, m, a, P, bx, by, kirp: clamp(kirp, 0, 1), kasSol: kas, kasSag, kulakSol, kulakSag,
    x: SPIKER.x, y: SPIKER.y - 10 * c + Math.sin(t * 1.5) * 1.5, s: SPIKER.s * (1 + 0.05 * c),
    egim: P.egim + 0.03 * Math.sin(t * 0.9) - 0.05 * ekrana - 0.03 * c, bas: -7 * a + 2 * Math.sin(t * 2.1),
    govdeEgim: 0.012 * Math.sin(t * 0.7), kuyruk: Math.sin(t * 1.6) * 0.14 + 0.08 * a, el: elPoz(t, sc, o, c, a),
  };
}

function elPoz(t, sc, o, c, a) {
  const tik = Math.sin(t * 10) * 3 * a;
  let L = { x: -150, y: 444 + tik * 0.5, s: 1, p: 'masa' }, Rr = { x: 150, y: 444 - tik * 0.5, s: 1, p: 'masa' };
  const kar = (A, B, w) => (w <= 0.001 ? A : { x: lerp(A.x, B.x, w), y: lerp(A.y, B.y, w), s: lerp(A.s, B.s, w), p: w > 0.45 ? B.p : A.p });
  const dt = t - sc.bas, son = sonSahne();
  let jest = sc.jest;
  if (!jest && sc.duzen === 'studyo' && sc.son - sc.bas > 3) jest = 'anlat';
  switch (jest) {
    case 'anlat': Rr = kar(Rr, { x: 185, y: 300 + 10 * Math.sin(t * 4), s: 1, p: 'acik' }, pencere(dt - 0.5, 0.3, 1.5, 0.35)); break;
    case 'omuz': { const w = pencere(dt, 0.3, 1.4, 0.3); L = kar(L, { x: -275, y: 300, s: 1, p: 'acik' }, w); Rr = kar(Rr, { x: 275, y: 300, s: 1, p: 'acik' }, w); break; }
    case 'basparmak': Rr = kar(Rr, { x: 180, y: 270, s: 1, p: 'bas' }, pencere(dt, 0.3, 1.5, 0.3)); break;
    case 'isaret': Rr = kar(Rr, { x: 205, y: 150, s: 1, p: 'isaret' }, pencere(dt, 0.3, 1.5, 0.3)); break;
    case 'salla': Rr = kar(Rr, { x: 230 + 26 * Math.sin(t * 12), y: 120, s: 1, p: 'acik' }, pencere(dt, 0.3, 1.6, 0.3)); break;
    default: break;
  }
  if (o) Rr = kar(Rr, { x: 205, y: 150, s: 1, p: 'isaret' }, pencere(t - o.bas, 0.3, 1.3, 0.35));
  if (c > 0) Rr = kar(Rr, { x: 110, y: 335, s: 1.25, p: 'acik' }, ease((t - son.bas - 0.2) / 0.35) * (1 - ease((t - son.ses_son - 0.05) / 0.25)));
  if (t > son.ses_son + 0.05) Rr = kar(Rr, { x: 236 + 26 * Math.sin(t * 12), y: 70, s: 1.1, p: 'acik' }, ease((t - son.ses_son - 0.05) / 0.3));
  return { L, R: Rr };
}

function basYolu(x, j) {
  simetrik(x, [0, -124], [
    ['C', [64, -126], [108, -98], [122, -52]],
    ['C', [128, -30], [132, -8], [136, 12]],
    ['Q', [158, 16], [186, 30]],
    ['Q', [164, 40], [152, 46]],
    ['Q', [174, 58], [180, 78]],
    ['Q', [160, 80], [144, 86]],
    ['Q', [160, 100], [156, 118 + j * 0.4]],
    ['Q', [136, 116 + j * 0.5], [116, 122 + j * 0.6]],
    ['C', [98, 142 + j], [58, 154 + j], [0, 156 + j]],
  ]);
}
function kulak(x, yon, sarkma) {
  x.save(); x.translate(yon * 78, -96); x.rotate(yon * (0.22 + sarkma));
  const yol = () => { x.beginPath(); x.moveTo(-48, 34); x.bezierCurveTo(-52, -50, -26, -140, 4, -198); x.bezierCurveTo(30, -150, 52, -60, 50, 34); x.closePath(); };
  yol(); x.fillStyle = R.kurk; x.fill();
  x.save(); yol(); x.clip(); x.fillStyle = R.siyah; x.beginPath(); x.moveTo(-70, -112); x.quadraticCurveTo(0, -140, 70, -112); x.lineTo(70, -220); x.lineTo(-70, -220); x.fill(); x.restore();
  x.beginPath(); x.moveTo(-30, 28); x.bezierCurveTo(-32, -36, -14, -104, 4, -148); x.bezierCurveTo(18, -104, 32, -36, 30, 28); x.closePath();
  x.fillStyle = '#3A1D17'; x.fill();
  x.strokeStyle = R.krem; x.lineWidth = 5; x.lineCap = 'round';
  for (const [a, b, h] of [[-20, -6, 70], [-6, 2, 92], [10, 8, 74], [22, 12, 52]]) { x.beginPath(); x.moveTo(a, 30); x.quadraticCurveTo(a, 30 - h * 0.6, b, 30 - h); x.stroke(); }
  yol(); x.lineWidth = 4.5; x.strokeStyle = R.kontur; x.stroke();
  x.restore();
}
function goz(x, yon, d) {
  const P = d.P, acik = clamp((1 - d.kirp) * (P.goz || 1) - (P.kisik || 0) * 0.6, 0, 1.25);
  x.save(); x.translate(yon * 50, -12); x.scale(yon, 1); x.rotate(-0.04);
  const ust = (o) => { x.moveTo(-26, 6); x.bezierCurveTo(-16, -4 - 12 * o, 14, -9 - 13 * o, 34, -6); };
  const yol = (o) => { x.beginPath(); ust(o); x.bezierCurveTo(20, 5 + 6 * o, -4, 10 + 6 * o, -26, 6); x.closePath(); };
  if (acik > 0.06) {
    yol(acik); x.fillStyle = '#FFF8EC'; x.fill();
    x.save(); yol(acik); x.clip();
    const ix = 4 + d.bx * 9 * yon, iy = -3 + d.by * 6;
    const g = x.createRadialGradient(ix - 3, iy - 4, 2, ix, iy, 19);
    g.addColorStop(0, R.iris1); g.addColorStop(1, R.iris2);
    x.beginPath(); x.arc(ix, iy, 17, 0, 7); x.fillStyle = g; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(90,30,0,0.6)'; x.stroke();
    x.beginPath(); x.ellipse(ix, iy, 3.2 * (P.pupil || 1), 12, 0, 0, 7); x.fillStyle = '#0B0605'; x.fill();
    x.fillStyle = 'rgba(90,30,8,0.38)'; x.fillRect(-32, -40, 76, 26);                    // ağır üst kapak gölgesi
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ix - 6, iy - 6, 3.4, 0, 7); x.fill();
    x.beginPath(); x.arc(ix + 5, iy + 6, 2, 0, 7); x.fill();
    x.restore();
  }
  x.beginPath(); ust(Math.max(acik, 0.02));
  x.lineWidth = 4.5; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = R.siyah; x.stroke();
  if (acik > 0.06) { x.beginPath(); x.moveTo(-22, 8); x.bezierCurveTo(-4, 12 + 8 * acik, 18, 6 + 8 * acik, 30, -4); x.lineWidth = 2.5; x.strokeStyle = 'rgba(30,15,10,0.55)'; x.stroke(); }
  x.restore();
}
function kas(x, yon, k) {
  x.save(); x.translate(yon * 52, -42 + k.y); x.scale(yon, 1); x.rotate(k.r);
  x.beginPath(); x.moveTo(-30, 3); x.quadraticCurveTo(2, -5, 40, -3);
  x.lineWidth = 13; x.lineCap = 'round'; x.strokeStyle = '#3A1204'; x.stroke(); x.restore();
}
function agizYolu(x, hw, h, y0) {
  x.beginPath(); x.moveTo(-hw, y0 + 2); x.quadraticCurveTo(0, y0 - 4, hw, y0 + 2);
  x.bezierCurveTo(hw, y0 + h * 0.8, hw * 0.6, y0 + h, 0, y0 + h);
  x.bezierCurveTo(-hw * 0.6, y0 + h, -hw, y0 + h * 0.8, -hw, y0 + 2); x.closePath();
}
function agiz(x, d) {
  const [w, h, r, dis] = d.m, y0 = 90, gul = d.P.gulus || 0;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = R.siyah; x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, 76); x.lineTo(0, y0 - 2); x.stroke();
  if (h < 3) {
    const kv = 7 * gul;
    x.beginPath(); x.moveTo(-36, 95 - kv * 0.3); x.quadraticCurveTo(-18, 99, 0, y0 - 1); x.quadraticCurveTo(20, 97, 42, 88 - kv); x.stroke();
    return;
  }
  const hw = w * (1 - 0.3 * r) * 1.05;
  agizYolu(x, hw, h, y0); x.fillStyle = '#3A0D12'; x.fill();
  x.save(); agizYolu(x, hw, h, y0); x.clip();
  x.fillStyle = '#E8566A'; x.beginPath(); x.ellipse(0, y0 + h * 0.98, hw * 0.7, Math.max(4, h * 0.4), 0, 0, 7); x.fill();
  x.fillStyle = '#FFFFFF';
  if (dis > 0.05) { x.beginPath(); x.roundRect(-hw * 0.7, y0 - 6, hw * 1.4, 5 + 7 * dis, 3); x.fill(); }
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * hw * 0.62 - 5, y0); x.lineTo(s * hw * 0.62 + 5, y0); x.lineTo(s * hw * 0.62, y0 + 10); x.closePath(); x.fill(); }
  x.restore();
  agizYolu(x, hw, h, y0); x.lineWidth = 4; x.strokeStyle = R.siyah; x.stroke();
}
function kulaklik(x, t) {
  x.lineCap = 'round';
  const bant = () => { x.beginPath(); x.moveTo(-138, -6); x.bezierCurveTo(-144, -128, -70, -164, 0, -164); x.bezierCurveTo(70, -164, 144, -128, 138, -6); };
  bant(); x.strokeStyle = '#0E0E15'; x.lineWidth = 26; x.stroke();
  bant(); x.strokeStyle = '#2A2A38'; x.lineWidth = 16; x.stroke();
  const rgb = x.createLinearGradient(-140, 0, 140, 0);
  rgb.addColorStop(0, `hsl(${(t * 60) % 360},95%,62%)`); rgb.addColorStop(1, `hsl(${(t * 60 + 160) % 360},95%,62%)`);
  bant(); x.strokeStyle = rgb; x.lineWidth = 3; x.stroke();
  for (const yon of [-1, 1]) {
    x.save(); x.translate(yon * 144, 14); x.rotate(yon * 0.05);
    rr(x, -36, -64, 72, 128, 30); x.fillStyle = '#0E0E15'; x.fill();
    rr(x, -27, -55, 54, 110, 24); x.fillStyle = '#24242F'; x.fill();
    x.shadowColor = `hsl(${(t * 60 + (yon > 0 ? 160 : 0)) % 360},95%,60%)`; x.shadowBlur = 16;
    rr(x, -16, -40, 32, 80, 16); x.strokeStyle = x.shadowColor; x.lineWidth = 5; x.stroke();
    x.shadowBlur = 0; amblem(x, 0, 0, 0.18, 'rgba(255,255,255,0.8)');
    x.restore();
  }
  x.beginPath(); x.moveTo(-148, 58); x.bezierCurveTo(-142, 120, -102, 136, -70, 124);
  x.strokeStyle = '#0E0E15'; x.lineWidth = 9; x.stroke();
  x.beginPath(); x.ellipse(-60, 122, 15, 11, -0.2, 0, 7); x.fillStyle = '#0B0B11'; x.fill();
  x.fillStyle = R.kirmizi; x.beginPath(); x.arc(-52, 118, 3, 0, 7); x.fill();
}
function bas(x, d) {
  const j = d.m[1] * 0.5;
  kulak(x, -1, d.kulakSol); kulak(x, 1, d.kulakSag);
  const g = x.createRadialGradient(-30, -70, 20, 0, 0, 200);
  g.addColorStop(0, R.kurkAcik); g.addColorStop(0.6, R.kurk); g.addColorStop(1, R.kurkKoyu);
  basYolu(x, j); x.fillStyle = g; x.fill();
  x.save(); basYolu(x, j); x.clip();
  x.beginPath(); x.moveTo(-200, 34); x.quadraticCurveTo(-112, -4, -64, 14); x.quadraticCurveTo(-34, 26, -18, 42);
  x.lineTo(0, 50); x.lineTo(18, 42); x.quadraticCurveTo(34, 26, 64, 14); x.quadraticCurveTo(112, -4, 200, 34);
  x.lineTo(200, 300); x.lineTo(-200, 300); x.closePath(); x.fillStyle = R.krem; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.ellipse(0, 100, 56, 40, 0, 0, 7); x.fill();
  const rim = x.createLinearGradient(170, 0, 60, 0); rim.addColorStop(0, 'rgba(110,160,255,0.35)'); rim.addColorStop(1, 'rgba(110,160,255,0)');
  x.fillStyle = rim; x.fillRect(-200, -200, 400, 400);
  x.restore();
  x.strokeStyle = 'rgba(40,18,10,0.5)'; x.lineWidth = 5; x.lineCap = 'round';
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 25, -2); x.quadraticCurveTo(s * 22, 20, s * 16, 40); x.stroke(); }
  basYolu(x, j); x.lineWidth = 4.5; x.strokeStyle = R.kontur; x.stroke();
  x.fillStyle = R.kurkKoyu;                                           // sivri saç tutamları
  for (const [a, tx, ty, b] of [[-60, -58, -204, -26], [-34, -16, -226, 4], [-8, 14, -214, 30]]) {
    x.beginPath(); x.moveTo(a, -118); x.lineTo(tx, ty); x.lineTo(b, -122); x.closePath(); x.fill();
  }
  x.fillStyle = R.camgobegi;
  x.beginPath(); x.moveTo(16, -124); x.lineTo(52, -216); x.lineTo(56, -140); x.lineTo(92, -150); x.lineTo(62, -110); x.lineTo(36, -118); x.closePath(); x.fill();
  x.strokeStyle = '#139CA8'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(28, -124); x.lineTo(48, -196); x.moveTo(44, -124); x.lineTo(78, -146); x.stroke();
  goz(x, -1, d); goz(x, 1, d); kas(x, -1, d.kasSol); kas(x, 1, d.kasSag);
  agiz(x, d);
  x.beginPath(); x.moveTo(-26, 56); x.bezierCurveTo(-26, 44, 26, 44, 26, 56); x.bezierCurveTo(26, 67, 7, 76, 0, 78);
  x.bezierCurveTo(-7, 76, -26, 67, -26, 56); x.fillStyle = R.siyah; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(-7, 52, 7, 4, -0.2, 0, 7); x.fill();
  kulaklik(x, d.t);
}
function govde(x, d) {
  x.save(); x.translate(250, 470); x.rotate(-0.25 + d.kuyruk);        // kuyruk
  const ky = () => { x.beginPath(); x.moveTo(0, 40); x.bezierCurveTo(90, 10, 150, -120, 120, -260); x.bezierCurveTo(110, -320, 50, -340, 20, -300); x.bezierCurveTo(60, -230, 40, -110, -40, -20); x.closePath(); };
  ky(); x.fillStyle = R.kurk; x.fill();
  x.save(); ky(); x.clip(); x.fillStyle = R.krem; x.beginPath(); x.ellipse(70, -306, 82, 62, 0.3, 0, 7); x.fill(); x.restore();
  ky(); x.lineWidth = 4.5; x.strokeStyle = R.kontur; x.stroke();
  x.restore();
  x.fillStyle = R.kurkKoyu; x.beginPath(); x.moveTo(-72, 100); x.lineTo(72, 100); x.lineTo(80, 236); x.lineTo(-80, 236); x.closePath(); x.fill();
  x.fillStyle = R.krem; x.beginPath(); x.moveTo(-72, 116); x.quadraticCurveTo(-58, 190, -20, 228); x.lineTo(-8, 214); x.lineTo(0, 236);
  x.lineTo(8, 214); x.lineTo(20, 228); x.quadraticCurveTo(58, 190, 72, 116); x.closePath(); x.fill();
  x.save(); x.rotate(d.govdeEgim);
  const g = x.createLinearGradient(-260, 210, 260, 540); g.addColorStop(0, '#2A3A70'); g.addColorStop(1, '#101833');
  x.beginPath(); x.moveTo(-72, 210); x.bezierCurveTo(-160, 206, -256, 218, -284, 280); x.lineTo(-308, 580); x.lineTo(308, 580);
  x.lineTo(284, 280); x.bezierCurveTo(256, 218, 160, 206, 72, 210); x.closePath(); x.fillStyle = g; x.fill();
  x.save(); x.beginPath(); x.moveTo(-68, 210); x.lineTo(0, 380); x.lineTo(68, 210); x.closePath(); x.clip();
  x.fillStyle = R.forma; x.fillRect(-80, 200, 160, 200);
  x.fillStyle = R.kirmizi; x.beginPath(); x.moveTo(-80, 300); x.lineTo(80, 240); x.lineTo(80, 262); x.lineTo(-80, 322); x.fill();
  x.fillStyle = R.camgobegi; x.beginPath(); x.moveTo(-80, 330); x.lineTo(80, 270); x.lineTo(80, 280); x.lineTo(-80, 340); x.fill();
  x.restore();
  x.beginPath(); x.moveTo(-60, 212); x.quadraticCurveTo(0, 250, 60, 212); x.lineWidth = 12; x.strokeStyle = R.kirmizi; x.stroke();
  for (const yon of [-1, 1]) {                                        // yakalar
    x.save(); x.scale(yon, 1);
    x.beginPath(); x.moveTo(68, 210); x.lineTo(8, 372); x.lineTo(40, 384); x.lineTo(118, 276); x.lineTo(100, 264);
    x.lineTo(128, 248); x.lineTo(106, 216); x.closePath(); x.fillStyle = R.ceketAcik; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.18)'; x.stroke();
    x.restore();
  }
  x.fillStyle = R.kirmizi; x.beginPath(); x.moveTo(150, 316); x.lineTo(196, 316); x.lineTo(176, 290); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(146, 316, 54, 4);
  amblem(x, -150, 312, 0.16, R.altin);
  x.restore();
  x.fillStyle = 'rgba(5,8,20,0.28)'; x.beginPath(); x.ellipse(0, 166, 120, 30, 0, 0, 7); x.fill();
}
function el(x, P, aci, yon) {
  x.save(); x.rotate(aci); x.scale(P.s || 1, (P.s || 1) * yon);
  const parmak = (px, py, a, uz, kal) => { x.save(); x.translate(px, py); x.rotate(a); rr(x, 0, -kal / 2, uz, kal, kal / 2); x.fillStyle = R.parmak; x.fill(); x.restore(); };
  if (P.p === 'acik') {
    [[-0.38, 50], [-0.13, 56], [0.12, 54], [0.36, 46]].forEach(([a, uz], i) => parmak(52, -18 + i * 12, a, uz, 17));
    parmak(26, -22, -1.15, 40, 18);
  } else if (P.p === 'isaret') {
    parmak(54, -14, -0.05, 60, 17);
    for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(64, -1 + i * 12, 9, 0, 7); x.fillStyle = R.parmak; x.fill(); }
    parmak(30, -20, -0.9, 30, 17);
  } else if (P.p === 'bas') {
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(64, -16 + i * 11, 9, 0, 7); x.fillStyle = R.parmak; x.fill(); }
    parmak(34, -24, -1.57, 42, 18);
  } else {
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(64, -18 + i * 12, 10, 0, 7); x.fillStyle = R.parmak; x.fill(); }
    parmak(30, -24, -0.6, 30, 17);
  }
  rr(x, 6, -30, 62, 60, 22); x.fillStyle = R.eldiven; x.fill();
  x.fillStyle = R.kirmizi; x.fillRect(14, -30, 8, 60);
  x.restore();
}
function kol(x, yon, P) {
  const S = { x: yon * 272, y: 284 }, L1 = 160, L2 = 160;
  const dx = P.x - S.x, dy = P.y - S.y, D = Math.hypot(dx, dy), menzil = L1 + L2 - 2;
  const Pp = D > menzil ? { x: S.x + dx / D * menzil, y: S.y + dy / D * menzil } : { x: P.x, y: P.y };
  const Dc = clamp(Math.min(D, menzil), 30, menzil), aci = Math.atan2(dy, dx);
  const B = Math.acos(clamp((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1));
  const ea = aci + (P.y < S.y + 40 ? yon * B : -yon * B);
  const E = { x: S.x + L1 * Math.cos(ea), y: S.y + L1 * Math.sin(ea) };
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [renk, kal] of [['#0C1228', 84], [R.ceket, 72]]) { x.beginPath(); x.moveTo(S.x, S.y); x.lineTo(E.x, E.y); x.lineTo(Pp.x, Pp.y); x.strokeStyle = renk; x.lineWidth = kal; x.stroke(); }
  const ka = Math.atan2(Pp.y - E.y, Pp.x - E.x);
  x.beginPath(); x.moveTo(Pp.x - Math.cos(ka) * 22, Pp.y - Math.sin(ka) * 22); x.lineTo(Pp.x - Math.cos(ka) * 6, Pp.y - Math.sin(ka) * 6);
  x.strokeStyle = R.kirmizi; x.lineWidth = 64; x.lineCap = 'butt'; x.stroke(); x.lineCap = 'round';
  x.save(); x.translate(Pp.x, Pp.y); el(x, P, ka, yon); x.restore();
}
function spiker(x, d) {
  x.save(); x.translate(d.x, d.y); x.scale(d.s, d.s);
  govde(x, d);
  x.save(); x.translate(0, d.bas); x.rotate(d.egim); bas(x, d); x.restore();
  x.restore();
}
function spikerKollar(x, d) { x.save(); x.translate(d.x, d.y); x.scale(d.s, d.s); kol(x, -1, d.el.L); kol(x, 1, d.el.R); x.restore(); }

// ------------------------------------------------------------ görsel espriler
function yildiz(x, cx, cy, r, renk) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
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
      x.translate(hx + 290, hy - 250 + Math.sin(dt * 5) * 8); x.scale(a, a); x.rotate(Math.sin(dt * 6) * 0.08);
      x.beginPath(); x.arc(0, 0, 92, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 8; x.strokeStyle = R.kirmizi; x.stroke();
      x.font = `104px ${EMOJI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e.emoji || '😮', 0, 6);
      if (e.metin) {
        x.font = `900 44px ${YAZI}`; const w = x.measureText(e.metin).width + 40;
        x.rotate(-0.05); x.fillStyle = R.kirmizi; x.fillRect(-w / 2, 100, w, 64); x.fillStyle = '#fff'; x.fillText(e.metin, 0, 134);
      }
      break;
    }
    case 'unlem': case 'soru': {
      const ch = e.tip === 'unlem' ? '!' : '?', renk = e.tip === 'unlem' ? R.kirmizi : R.camgobegi;
      x.font = `900 160px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 12; x.strokeStyle = '#fff';
      [[hx + 250, hy - 250, -0.2], [hx + 322, hy - 190, 0.25]].forEach(([px, py, r], i) => {
        x.save(); x.translate(px, py); x.rotate(r + Math.sin(dt * 9 + i) * 0.12); x.scale(a * (1 - 0.2 * i), a * (1 - 0.2 * i));
        x.strokeText(ch, 0, 0); x.fillStyle = renk; x.fillText(ch, 0, 0); x.restore();
      });
      break;
    }
    case 'ter': {
      x.translate(hx - 128 * d.s, hy - 60 * d.s + dt * 40); x.scale(a, a);
      x.beginPath(); x.moveTo(0, -38); x.bezierCurveTo(22, -6, 26, 14, 0, 26); x.bezierCurveTo(-26, 14, -22, -6, 0, -38);
      x.fillStyle = '#7FD7FF'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#fff'; x.stroke();
      break;
    }
    case 'yildiz': for (let i = 0; i < 5; i++) { const an = dt * 3 + i * Math.PI * 2 / 5; yildiz(x, hx + Math.cos(an) * 250, hy - 220 + Math.sin(an) * 60, 30 * a, R.altin); } break;
    case 'kalp': {
      x.font = `76px ${EMOJI}`; x.textAlign = 'center';
      for (let i = 0; i < 6; i++) { const ph = (dt * 0.7 + hash(i)) % 1; x.globalAlpha = (1 - ph) * a; x.fillText('💖', hx - 250 + hash(i + 3) * 500, hy - 120 - ph * 380); }
      break;
    }
    case 'konfeti': {
      const renk = [R.altin, R.camgobegi, R.kirmizi, '#7CFF6B', '#FFFFFF'];
      for (let i = 0; i < 90; i++) {
        const px = hash(i) * W, py = ((dt * 650 + hash(i + 9) * H) % (H + 120)) - 60;
        x.save(); x.translate(px + Math.sin(dt * 3 + i) * 20, py); x.rotate(dt * 5 + i); x.globalAlpha = a;
        x.fillStyle = renk[i % renk.length]; x.fillRect(-9, -5, 18, 10); x.restore();
      }
      break;
    }
    case 'patlama': {
      x.translate(hx - 270, hy - 290); x.scale(a, a); x.rotate(-0.12); x.beginPath();
      for (let i = 0; i < 24; i++) { const an = i * Math.PI / 12, r = i % 2 ? 80 : 140; x.lineTo(Math.cos(an) * r * 1.3, Math.sin(an) * r); }
      x.closePath(); x.fillStyle = R.altin; x.fill(); x.lineWidth = 8; x.strokeStyle = R.kirmizi; x.stroke();
      x.font = `900 50px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = R.gece; x.fillText(e.metin || 'BOOM!', 0, 4);
      break;
    }
    default: break;
  }
  x.restore();
}

// ------------------------------------------------------------ kamera (stüdyo + spiker)
function kameraCiz(t, k, sc) {
  kc.drawImage(statik, 0, 0);
  studyoAnim(kc, t);
  const d = spikerDurum(t, k, sc);
  spiker(kc, d);
  kc.drawImage(masa, 0, 0);
  masaAnim(kc, t);
  spikerKollar(kc, d);
  espri(kc, t, sc, d);
}
function kameraYerlestir(t, g, c, sc) {
  const e = g, asp = lerp(W / H, PIP.w / PIP.h, e);
  const z = lerp(sc.zoom || 1, 1, e) * (1 + 0.01 * Math.sin(t * 0.5)) * (1 + 0.3 * c);
  const sh = lerp(H / z, 770, e), sw = sh * asp;
  const cx = 540, cy = lerp(960 - 230 * c, 640, e);
  const sx = clamp(cx - sw / 2, 0, W - sw), sy = clamp(cy - sh / 2, 0, H - sh);
  const dw = lerp(W, PIP.w, e), dh = dw / asp, dx = lerp(0, PIP.x, e), dy = lerp(0, PIP.y, e);
  ac.save();
  if (e > 0.001) { rr(ac, dx, dy, dw, dh, 16 * e); ac.clip(); }
  ac.drawImage(kam, sx, sy, sw, sh, dx, dy, dw, dh);
  ac.restore();
  if (e > 0.001) {
    rr(ac, dx, dy, dw, dh, 16 * e); ac.lineWidth = 5 * e; ac.strokeStyle = R.kirmizi; ac.stroke();
    ac.save(); ac.globalAlpha = ease((e - 0.6) / 0.4);
    ac.fillStyle = 'rgba(8,16,40,0.88)'; ac.fillRect(dx, dy + dh - 42, dw, 42);
    ac.fillStyle = R.kirmizi; ac.fillRect(dx, dy + dh - 42, 8, 42);
    ac.font = `800 22px ${YAZI}`; ac.fillStyle = '#fff'; ac.textBaseline = 'middle';
    ac.fillText('TİLKİ · Oyun muhabiri', dx + 20, dy + dh - 20);
    ac.restore();
  }
}

// ------------------------------------------------------------ görüntü (B-roll) ve bilgi grafikleri
function kirpHesapla(o, t, im, A) {
  const iw = im.naturalWidth, ih = im.naturalHeight, kapla = Math.max(A.w / iw, A.h / ih);
  const kb = 1 + 0.07 * clamp((t - o.bas) / Math.max(0.1, o.son - o.bas), 0, 1);
  let z = kb, fx = (o.odak || [0.5, 0.5])[0] * iw, fy = (o.odak || [0.5, 0.5])[1] * ih;
  if (o.vurgu) {
    const pv = ease((t - o.vurgu.bas) / 0.6), [bx, by, bw, bh] = o.vurgu.kutu;
    const zt = Math.max(1, Math.min(o.vurgu.yakinlik || 1.35, 0.78 * A.w / (bw * iw * kapla), 0.78 * A.h / (bh * ih * kapla)));
    z = lerp(kb, zt * kb, pv); fx = lerp(fx, (bx + bw / 2) * iw, pv); fy = lerp(fy, (by + bh / 2) * ih, pv);
  }
  const vw = A.w / (kapla * z), vh = A.h / (kapla * z);
  return { sx: clamp(fx - vw / 2, 0, iw - vw), sy: clamp(fy - vh / 2, 0, ih - vh), vw, vh, k: kapla * z };
}
function vurguCiz(o, t, im, kr, A) {
  const v = o.vurgu, dv = t - v.bas; if (dv < 0.3) return;
  const [bx, by, bw, bh] = v.kutu, iw = im.naturalWidth, ih = im.naturalHeight;
  const X = (bx * iw - kr.sx) * kr.k, Y = (by * ih - kr.sy) * kr.k, Wd = bw * iw * kr.k, Hd = bh * ih * kr.k;
  const a = ease((dv - 0.3) / 0.25);
  ac.save(); ac.globalAlpha *= 0.5 * a; ac.fillStyle = '#000'; ac.beginPath(); ac.rect(0, 0, A.w, A.h);
  if (v.tip === 'daire') ac.ellipse(X + Wd / 2, Y + Hd / 2, Wd / 2 + 10, Hd / 2 + 10, 0, 0, 7); else ac.roundRect(X, Y, Wd, Hd, 10);
  ac.fill('evenodd'); ac.restore();
  const q = eOut((dv - 0.3) / 0.4), cevre = 2 * (Wd + Hd) + 40;
  ac.save(); ac.lineWidth = 8; ac.strokeStyle = R.altin; ac.shadowColor = 'rgba(255,194,51,0.9)'; ac.shadowBlur = 20; ac.setLineDash([cevre * q, cevre]);
  ac.beginPath(); if (v.tip === 'daire') ac.ellipse(X + Wd / 2, Y + Hd / 2, Wd / 2 + 10, Hd / 2 + 10, 0, -Math.PI / 2, Math.PI * 1.5); else ac.roundRect(X, Y, Wd, Hd, 10);
  ac.stroke(); ac.restore();
  if (v.yazi && q > 0.6) {
    ac.save(); ac.globalAlpha *= ease((q - 0.6) / 0.3); ac.font = `900 36px ${YAZI}`;
    const w = ac.measureText(v.yazi).width + 32, lx = clamp(X + Wd / 2 - w / 2, 12, A.w - w - 12), ly = Y > 70 ? Y - 58 : Y + Hd + 10;
    ac.fillStyle = R.kirmizi; ac.fillRect(lx, ly, w, 50); ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText(v.yazi, lx + 16, ly + 27); ac.restore();
  }
}
const SATIR_H = 104, SATIR_ARA = 118;
function sutunGenisligi(satirlar) {
  ac.font = `900 40px ${YAZI}`;
  return Math.max(200, ...satirlar.map((s) => ac.measureText(Array.isArray(s) ? s[0] : s).width + 44));
}
function satirCiz(s, i, p, A, y, sw) {
  const q = eOut((p - i * 0.18) / 0.35); if (q <= 0) return;
  ac.save(); ac.globalAlpha = q; ac.translate((1 - q) * 80, 0);
  ac.fillStyle = 'rgba(255,255,255,0.08)'; ac.fillRect(48, y, A.w - 96, SATIR_H);
  ac.fillStyle = R.kirmizi; ac.fillRect(48, y, 10, SATIR_H);
  ac.textBaseline = 'middle';
  const sutun = Array.isArray(s) ? s : [s];
  const f0 = sigdir(ac, sutun[0], 900, 40, 26, sw - 30, 1);
  ac.font = `900 ${f0.boyut}px ${YAZI}`; ac.fillStyle = R.altin; ac.fillText(sutun[0], 80, y + SATIR_H / 2 + 2);
  const f = sigdir(ac, sutun.slice(1).join('  ·  '), 800, 40, 24, A.w - 96 - sw - 50, 1);
  ac.font = `800 ${f.boyut}px ${YAZI}`; ac.fillStyle = '#fff'; ac.fillText(f.satir[0] || '', 80 + sw, y + SATIR_H / 2 + 2);
  ac.restore();
}
function grafikCiz(o, t, A) {
  const Gr = o.grafik, p = t - o.bas;
  const g = ac.createLinearGradient(0, 0, 0, A.h); g.addColorStop(0, '#0C1C48'); g.addColorStop(1, '#060D24');
  ac.fillStyle = g; ac.fillRect(0, 0, A.w, A.h);
  ac.strokeStyle = 'rgba(80,140,255,0.10)'; ac.lineWidth = 2;
  for (let i = 0; i < A.w; i += 54) { ac.beginPath(); ac.moveTo(i, 0); ac.lineTo(i, A.h); ac.stroke(); }
  for (let i = 0; i < A.h; i += 54) { ac.beginPath(); ac.moveTo(0, i); ac.lineTo(A.w, i); ac.stroke(); }
  amblem(ac, A.w - 150, A.h - 150, 2.4, 'rgba(255,255,255,0.05)');
  const gb = eOut(p / 0.35);
  ac.save(); ac.globalAlpha = gb; ac.translate((1 - gb) * -60, 0);
  ac.font = `900 30px ${YAZI}`; const et = (Gr.etiket || 'BİLGİ').toLocaleUpperCase('tr-TR'), ew = ac.measureText(et).width + 36;
  ac.fillStyle = R.kirmizi; ac.fillRect(48, 48, ew, 54); ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText(et, 66, 77);
  const bf = sigdir(ac, Gr.baslik || '', 900, 52, 34, A.w - 96, 2);
  ac.font = `900 ${bf.boyut}px ${YAZI}`; ac.fillStyle = '#fff';
  bf.satir.forEach((l, i) => ac.fillText(l, 48, 150 + i * bf.boyut * 1.1));
  ac.restore();
  const ust_ = 150 + bf.satir.length * bf.boyut * 1.1 + 20;
  if (Gr.tip === 'sayi') {
    const pe = eOut((p - 0.2) / 0.6), m = String(Gr.buyuk).match(/^(\d+)(.*)$/);
    const yazi = m ? Math.round(parseInt(m[1], 10) * pe) + m[2] : Gr.buyuk;
    ac.save(); ac.globalAlpha = clamp((p - 0.15) / 0.25, 0, 1);
    const f = sigdir(ac, String(Gr.buyuk), 900, 200, 90, A.w - 96, 1);
    ac.font = `900 ${f.boyut}px ${YAZI}`; ac.fillStyle = R.altin; ac.textBaseline = 'alphabetic';
    ac.shadowColor = 'rgba(255,194,51,0.45)'; ac.shadowBlur = 30; ac.fillText(yazi, 48, ust_ + f.boyut * 0.86); ac.shadowBlur = 0;
    ac.font = `700 34px ${YAZI}`; ac.fillStyle = R.camgobegi; ac.fillText(Gr.alt || '', 52, ust_ + f.boyut * 0.86 + 52);
    ac.restore();
    const n = (Gr.satirlar || []).length, sw = sutunGenisligi(Gr.satirlar || []);
    (Gr.satirlar || []).forEach((s, i) => satirCiz(s, i, p - 0.6, A, A.h - (Gr.not ? 84 : 40) - (n - i) * SATIR_ARA, sw));
  } else {
    const sw = sutunGenisligi(Gr.satirlar || []);
    (Gr.satirlar || []).forEach((s, i) => satirCiz(s, i, p - 0.25, A, ust_ + 10 + i * SATIR_ARA, sw));
  }
  if (Gr.not) { ac.save(); ac.globalAlpha = clamp((p - 0.8) / 0.3, 0, 1); ac.font = `600 25px ${YAZI}`; ac.fillStyle = 'rgba(255,255,255,0.72)'; ac.textBaseline = 'middle'; ac.fillText(Gr.not, 48, A.h - 40); ac.restore(); }
}
function brollIcerik(o, t) {
  const A = BROLL;
  ac.save(); ac.translate(A.x, A.y); ac.beginPath(); ac.rect(0, 0, A.w, A.h); ac.clip();
  if (o.grafik) grafikCiz(o, t, A);
  else {
    const im = G[o.anahtar], kr = kirpHesapla(o, t, im, A);
    ac.drawImage(im, kr.sx, kr.sy, kr.vw, kr.vh, 0, 0, A.w, A.h);
    if (o.vurgu) vurguCiz(o, t, im, kr, A);
    const meta = T.gorseller[o.anahtar] || {}, et = o.etiket || meta.etiket;
    if (et) { ac.font = `900 28px ${YAZI}`; const w = ac.measureText(et).width + 32; ac.fillStyle = R.kirmizi; ac.fillRect(24, 24, w, 50); ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText(et, 40, 51); }
  }
  ac.restore();
}
function broll(t, g) {
  const o = gorselOlay(t); if (!o) return;
  const p = (t - o.bas) / 0.42, onc = oncekiOlay(o), A = BROLL;
  const takas = onc && Math.abs(onc.son - o.bas) < 0.3 && p < 1;
  if (takas) brollIcerik(onc, t);
  const wx = p < 1 ? A.w * eOut(p) : A.w;
  ac.save(); ac.beginPath(); ac.rect(0, A.y, wx, A.h); ac.clip(); brollIcerik(o, t); ac.restore();
  if (wx < A.w) { ac.fillStyle = R.kirmizi; ac.fillRect(wx - 6, A.y, 26, A.h); ac.fillStyle = '#fff'; ac.fillRect(wx + 20, A.y, 5, A.h); }
  ac.fillStyle = R.kirmizi; ac.fillRect(0, A.y + A.h, W, 6);
}
function kunye(t, g, sc) {
  const o = gorselOlay(t); if (!o) return;
  const p = eOut((t - o.bas - 0.15) / 0.4), K = KUNYE;
  ac.save(); ac.globalAlpha = clamp(g * 1.4, 0, 1) * p; ac.translate((1 - p) * 60, 0);
  ac.fillStyle = 'rgba(10,22,56,0.92)'; ac.fillRect(K.x, K.y, K.w, K.h);
  ac.fillStyle = R.kirmizi; ac.fillRect(K.x, K.y, K.w, 6);
  const metin = sc.ekran || (o.grafik ? o.grafik.baslik : '');
  const f = sigdir(ac, metin, 900, 58, 30, K.w - 48, 2);
  ac.font = `900 ${f.boyut}px ${YAZI}`; ac.textBaseline = 'middle';
  const lh = f.boyut * 1.1, y0 = K.y + 22 + (K.h - 66) / 2 - (f.satir.length - 1) * lh / 2;
  f.satir.forEach((l, i) => { ac.fillStyle = i === 0 ? R.altin : '#fff'; ac.fillText(l, K.x + 24, y0 + i * lh); });
  const meta = o.grafik ? null : T.gorseller[o.anahtar];
  const alt = meta && meta.sahip ? 'Görsel: ' + meta.sahip : (o.grafik ? 'Grafik: ' + (T.marka_ad || 'Fox Bülten') + (T.kaynak_adi ? ' · Kaynak: ' + T.kaynak_adi : '') : '');
  ac.font = `700 21px ${YAZI}`; ac.fillStyle = 'rgba(255,255,255,0.75)'; ac.fillText(alt, K.x + 24, K.y + K.h - 24);
  ac.restore();
}

// ------------------------------------------------------------ yayın grafikleri
function ust(t) {
  ac.fillStyle = 'rgba(255,255,255,0.15)'; ac.fillRect(0, 0, W, 8);
  ac.fillStyle = R.kirmizi; ac.fillRect(0, 0, W * clamp(t / T.sure, 0, 1), 8);
  ac.save(); ac.shadowColor = 'rgba(0,0,0,0.4)'; ac.shadowBlur = 12;
  ac.fillStyle = R.kirmizi; ac.fillRect(40, 48, 84, 84); ac.shadowBlur = 0;
  amblem(ac, 82, 94, 0.62, '#fff', R.kirmizi);
  ac.font = `900 38px ${YAZI}`; const mw = ac.measureText(T.marka).width + 40;
  ac.fillStyle = 'rgba(8,16,40,0.92)'; ac.fillRect(124, 48, mw, 84);
  ac.fillStyle = '#fff'; ac.textBaseline = 'alphabetic'; ac.fillText(T.marka, 144, 92);
  ac.font = `800 18px ${YAZI}`; ac.fillStyle = R.camgobegi; ac.fillText('OYUN GÜNDEMİ', 145, 118);
  const cx = 124 + mw + 12, nab = 0.6 + 0.4 * Math.sin(t * 5);
  ac.font = `900 24px ${YAZI}`; const cw = ac.measureText('CANLI').width + 52;
  ac.fillStyle = R.kirmizi; ac.fillRect(cx, 48, cw, 40);
  ac.fillStyle = `rgba(255,255,255,${nab})`; ac.beginPath(); ac.arc(cx + 18, 68, 7, 0, 7); ac.fill();
  ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText('CANLI', cx + 32, 69);
  if (T.tarih) { ac.font = `800 22px ${YAZI}`; const tw = ac.measureText(T.tarih).width + 24; ac.fillStyle = 'rgba(255,255,255,0.92)'; ac.fillRect(cx, 92, tw, 40); ac.fillStyle = R.gece; ac.fillText(T.tarih, cx + 12, 113); }
  if (T.onizleme) { ac.font = `800 22px ${YAZI}`; const y = 'ÖNİZLEME · espeak sesi', w = ac.measureText(y).width + 28; ac.fillStyle = 'rgba(227,18,45,0.9)'; ac.fillRect(W - 44 - w, 160, w, 40); ac.fillStyle = '#fff'; ac.fillText(y, W - 30 - w, 181); }
  ac.restore();
}
function altBant(t, sc) {
  const g = eOut(t / 0.5), y = ALTBANT_Y;
  ac.save(); ac.translate((1 - g) * -W, 0);
  ac.font = `900 28px ${YAZI}`; const et = T.ust_etiket || 'SON DAKİKA', ew = ac.measureText(et).width + 36;
  const flas = t < 1.2 ? 0.75 + 0.25 * Math.sin(t * 20) : 1;
  ac.fillStyle = R.kirmizi; ac.globalAlpha = flas; ac.fillRect(40, y, ew, 46); ac.globalAlpha = 1;
  ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText(et, 58, y + 24);
  if (sc.ekran && sc.duzen !== 'kapanis') {
    const p = eOut((t - sc.bas) / 0.35), maxW = 880 - ew;
    const f = sigdir(ac, sc.ekran, 800, 28, 20, maxW - 32, 1);
    ac.font = `800 ${f.boyut}px ${YAZI}`; const w = Math.min(maxW, ac.measureText(f.satir[0] || '').width + 32);
    ac.save(); ac.beginPath(); ac.rect(40 + ew, y, w * p, 46); ac.clip();
    ac.fillStyle = 'rgba(8,16,40,0.95)'; ac.fillRect(40 + ew, y, w, 46); ac.fillStyle = '#fff'; ac.fillText(f.satir[0] || '', 40 + ew + 16, y + 24);
    ac.restore();
  }
  ac.fillStyle = '#fff'; ac.fillRect(40, y + 46, 880, 82);
  ac.fillStyle = R.kirmizi; ac.fillRect(40, y + 46, 10, 82);
  const f = sigdir(ac, (T.manset || '').toLocaleUpperCase('tr-TR'), 900, 48, 28, 830, 1);
  ac.font = `900 ${f.boyut}px ${YAZI}`; ac.fillStyle = R.gece; ac.fillText(f.satir[0] || '', 68, y + 89);
  ac.restore();
}
function kayanBant(t) {
  const y = BANT_Y;
  ac.fillStyle = 'rgba(6,12,32,0.94)'; ac.fillRect(0, y, W, 52);
  ac.save(); ac.beginPath(); ac.rect(176, y, W - 176, 52); ac.clip();
  const metin = (T.kayan && T.kayan.length ? T.kayan : [T.manset || '']).map((s) => s.toLocaleUpperCase('tr-TR')).join('   ◆   ') + '   ◆   ';
  ac.font = `700 28px ${YAZI}`; ac.fillStyle = '#fff'; ac.textBaseline = 'middle';
  const w = ac.measureText(metin).width, ofs = (t * 150) % w;
  for (let x0 = 190 - ofs; x0 < W; x0 += w) ac.fillText(metin, x0, y + 27);
  ac.restore();
  ac.fillStyle = R.kirmizi; ac.fillRect(0, y, 176, 52);
  ac.font = `900 26px ${YAZI}`; ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText('GÜNDEM', 30, y + 27);
}
function kelimeDizgisi(kelimeler, t, maxW, boyut, boya, x0, yMerkez, lh) {
  ac.font = `800 ${boyut}px ${YAZI}`;
  const bosluk = ac.measureText(' ').width + boyut * 0.2, satirlar = [];
  let cur = [], cw = 0;
  for (const k of kelimeler) {
    const kw = ac.measureText(k.w).width;
    if (cur.length && cw + bosluk + kw > maxW) { satirlar.push([cur, cw]); cur = []; cw = 0; }
    cw += (cur.length ? bosluk : 0) + kw; cur.push({ ...k, kw });
  }
  if (cur.length) satirlar.push([cur, cw]);
  const y0 = yMerkez - (satirlar.length - 1) * lh / 2;
  let idx = 0;
  satirlar.forEach(([sat, sw], i) => {
    let x = x0 - sw / 2; const y = y0 + i * lh;
    for (const k of sat) {
      const sonraki = kelimeler[idx + 1]; idx++;
      const simdi = t >= k.bas - 0.02 && t < (sonraki ? sonraki.bas : k.son + 0.3), gecti = t >= k.bas - 0.02;
      ac.save();
      if (simdi) { ac.translate(x + k.kw / 2, y); ac.scale(1.04, 1.04); ac.translate(-(x + k.kw / 2), -y); }
      boya(ac, k, simdi, gecti, x, y); ac.restore();
      x += k.kw + bosluk;
    }
  });
}
function altyazi(t) {
  let p = null;
  for (const a of T.altyazi) if (t >= a.bas && t < a.son) { p = a; break; }
  if (!p || T.sahneler[p.s].duzen === 'kapanis') return;
  const kel = T.kelimeler.slice(p.i0, p.i1 + 1), pp = eBack(clamp((t - p.bas) / 0.14, 0, 1));
  ac.save(); ac.translate(ALTYAZI_X, ALTYAZI_Y); ac.scale(lerp(0.88, 1, pp), lerp(0.88, 1, pp)); ac.translate(-ALTYAZI_X, -ALTYAZI_Y);
  ac.textBaseline = 'middle'; ac.lineJoin = 'round';
  kelimeDizgisi(kel, t, ALTYAZI_W, 62, (x, k, simdi, gecti, px, py) => {
    x.lineWidth = 14; x.strokeStyle = 'rgba(4,8,22,0.96)'; x.strokeText(k.w, px, py);
    x.fillStyle = simdi ? R.altin : '#FFFFFF'; x.fillText(k.w, px, py);
  }, ALTYAZI_X, ALTYAZI_Y, 76);
  ac.restore();
}
function soruPaneli(t, c) {
  if (c <= 0.01) return;
  const sc = sonSahne(), kel = T.kelimeler.slice(sc.k0, sc.k1 + 1);
  ac.font = `800 54px ${YAZI}`;
  const n = Math.min(4, satirla(ac, kel.map((k) => k.w).join(' '), 860).length);
  const x0 = 60, w = 960, y0 = 170, h = 74 + n * 70 + 40, pc = eBack(c);
  ac.save(); ac.translate(W / 2, y0 + h / 2); ac.scale(lerp(0.7, 1, pc), lerp(0.7, 1, pc)); ac.translate(-W / 2, -(y0 + h / 2));
  ac.shadowColor = 'rgba(0,0,0,0.45)'; ac.shadowBlur = 30; ac.fillStyle = '#fff'; ac.fillRect(x0, y0, w, h); ac.shadowBlur = 0;
  ac.fillStyle = R.kirmizi; ac.fillRect(x0, y0, w, 74);
  ac.font = `900 36px ${YAZI}`; ac.fillStyle = '#fff'; ac.textBaseline = 'middle'; ac.fillText('SİZE SORUYORUZ', x0 + 28, y0 + 39);
  amblem(ac, x0 + w - 50, y0 + 37, 0.42, '#fff', R.kirmizi);
  kelimeDizgisi(kel, t, 860, 54, (x, k, simdi, gecti, px, py) => { x.fillStyle = simdi ? R.kirmizi : gecti ? R.gece : 'rgba(11,20,48,0.45)'; x.fillText(k.w, px, py); },
    W / 2, y0 + 74 + 20 + n * 35, 70);
  ac.restore();
  if (t > sc.ses_son) {
    const p = eBack(clamp((t - sc.ses_son) / 0.3, 0, 1)), nb = 1 + 0.05 * Math.sin(t * 8);
    ac.save(); ac.translate(ALTYAZI_X, ALTYAZI_Y); ac.scale(p * nb, p * nb);
    ac.font = `900 60px ${YAZI}`; const y = 'Yorumlara yaz 👇', w2 = ac.measureText(y).width + 64;
    ac.fillStyle = R.kirmizi; ac.fillRect(-w2 / 2, -50, w2, 100); ac.lineWidth = 6; ac.strokeStyle = '#fff'; ac.strokeRect(-w2 / 2, -50, w2, 100);
    ac.fillStyle = '#fff'; ac.textAlign = 'center'; ac.textBaseline = 'middle'; ac.fillText(y, 0, 4);
    ac.restore();
  }
}

// ------------------------------------------------------------ kare
function ciz(t, k) {
  const sc = T.sahneler[sahneNo(t)], g = duzenG(t), c = kapanisC(t);
  kameraCiz(t, k, sc);
  ac.save();
  ac.fillStyle = '#000'; ac.fillRect(0, 0, W, H);
  if (g > 0.001) { ac.drawImage(arka, 0, 0); broll(t, g); kunye(t, g, sc); }
  kameraYerlestir(t, g, c, sc);
  ust(t);
  altBant(t, sc);
  if (c < 0.5) altyazi(t);
  kayanBant(t);
  soruPaneli(t, c);
  ac.restore();
}

// ------------------------------------------------------------ YouTube kapağı
// kapakCiz({w, h, src, buyuk, orta, alt, ifade, marka}) → JPEG data URL. Spiker, videodaki çizim koduyla
// yüksek çözünürlükte yeniden çizilir; arka plan resmî haber görseli (yoksa stüdyo).
async function kapakCiz(v) {
  T = { fps: 30, sure: 1, marka: v.marka, gorseller: {}, gorsel_olaylari: [], pencereler: [], kelimeler: [], altyazi: [],
        agiz: [[26, 40, 0.9, 0]], genlik: [0.5], kirpmalar: [], kulaklar: [],
        sahneler: [{ bas: 0, son: 1, ses_bas: 0, ses_son: 1, duzen: 'studyo', ifade: v.ifade || 'saskin', jest: '', zoom: 1, k0: 0, k1: 0 }] };
  for (const f of ['900 60px Inter', '800 60px Inter', '60px "Noto Color Emoji"']) { try { await document.fonts.load(f, 'AaÇğİşÖü'); } catch (e) { /* */ } }
  const yatay = v.w > v.h, c = document.createElement('canvas'); c.width = v.w; c.height = v.h; const x = c.getContext('2d');
  // arka plan
  if (v.src) {
    const im = await new Promise((ok, red) => { const i = new Image(); i.onload = () => ok(i); i.onerror = red; i.src = v.src; });
    const k = Math.max(v.w / im.width, v.h / im.height), dw = im.width * k, dh = im.height * k;
    x.drawImage(im, (v.w - dw) / 2, yatay ? (v.h - dh) / 2 : 0, dw, dh);
  } else { x.drawImage(statik, 0, 0, v.w, v.h); }
  let g = yatay ? x.createLinearGradient(0, 0, v.w, 0) : x.createLinearGradient(0, 0, 0, v.h);
  if (yatay) { g.addColorStop(0, 'rgba(6,12,34,0.94)'); g.addColorStop(0.55, 'rgba(6,12,34,0.55)'); g.addColorStop(1, 'rgba(6,12,34,0.15)'); }
  else { g.addColorStop(0, 'rgba(6,12,34,0.85)'); g.addColorStop(0.38, 'rgba(6,12,34,0.35)'); g.addColorStop(0.62, 'rgba(6,12,34,0.45)'); g.addColorStop(1, 'rgba(6,12,34,0.97)'); }
  x.fillStyle = g; x.fillRect(0, 0, v.w, v.h);
  // spiker: şaşkın, yazıyı işaret ediyor
  const f = document.createElement('canvas'); f.width = W; f.height = H; const fx = f.getContext('2d');
  const P = IFADE[v.ifade || 'saskin'] || IFADE.saskin;
  const d = { t: 0.4, m: [26, 42, 0.9, 0.1], a: 0.5, P, bx: yatay ? -0.5 : 0.1, by: -0.6, kirp: 0,
    kasSol: { y: P.kasY - 6, r: P.kasR }, kasSag: { y: P.kasY - 6, r: P.kasR }, kulakSol: P.kulak, kulakSag: P.kulak,
    x: 540, y: 600, s: 1.25, egim: yatay ? 0.06 : -0.05, bas: 0, govdeEgim: 0, kuyruk: 0.1,
    el: { L: { x: -150, y: 444, s: 1, p: 'masa' }, R: { x: 300, y: -40, s: 1.15, p: 'isaret' } } };
  if (yatay) { d.el = { L: { x: -300, y: -40, s: 1.15, p: 'isaret' }, R: { x: 150, y: 444, s: 1, p: 'masa' } }; }
  spiker(fx, d); spikerKollar(fx, d);
  const kx = 90, ky = 150, kw = 900, kh = 1000;                   // baş, omuzlar ve kalkık el
  x.save(); x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 40;
  if (yatay) x.drawImage(f, kx, ky, kw, kh, v.w - 640, 40, 640, 640 * kh / kw);
  else x.drawImage(f, kx, ky, kw, kh, 40, 880, 1040, 1040 * kh / kw);
  x.restore();
  // logo
  const L = yatay ? 0.75 : 1, lx = yatay ? 36 : 44, ly = yatay ? 30 : 64;
  x.save(); x.translate(lx, ly); x.scale(L, L);
  x.fillStyle = R.kirmizi; x.fillRect(0, 0, 96, 96); amblem(x, 48, 52, 0.7, '#fff', R.kirmizi);
  x.font = `900 44px ${YAZI}`; const mw = x.measureText(v.marka).width + 44;
  x.fillStyle = 'rgba(8,16,40,0.94)'; x.fillRect(96, 0, mw, 96); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(v.marka, 118, 50);
  x.restore();
  // yazılar
  const sol = yatay ? 44 : 60, maxW = yatay ? 700 : 960;
  let y = yatay ? 175 : 300;
  x.save(); x.translate(sol, y); x.rotate(-0.035);
  const fb = sigdir(x, v.buyuk, 900, yatay ? 190 : 270, 90, maxW, 1);
  x.font = `900 ${fb.boyut}px ${YAZI}`; x.textBaseline = 'top'; x.lineJoin = 'round';
  x.lineWidth = yatay ? 16 : 22; x.strokeStyle = '#0A0F24'; x.strokeText(v.buyuk, 0, 0);
  x.fillStyle = R.altin; x.shadowColor = 'rgba(255,194,51,0.5)'; x.shadowBlur = 30; x.fillText(v.buyuk, 0, 0);
  x.restore();
  y += fb.boyut * 1.05 + (yatay ? 10 : 24);
  const bant = (metin, zemin, renk, boy, yy) => {
    const fz = sigdir(x, metin.toLocaleUpperCase('tr-TR'), 900, boy, Math.round(boy * 0.55), maxW - 40, 1);
    x.font = `900 ${fz.boyut}px ${YAZI}`; const bw = x.measureText(fz.satir[0]).width + 44, bh = fz.boyut * 1.32;
    x.save(); x.translate(sol, yy); x.rotate(-0.02); x.fillStyle = zemin; x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 24; x.fillRect(0, 0, bw, bh);
    x.shadowBlur = 0; x.fillStyle = renk; x.textBaseline = 'middle'; x.fillText(fz.satir[0], 22, bh / 2 + 3); x.restore();
    return bh;
  };
  if (v.orta) y += bant(v.orta, R.kirmizi, '#fff', yatay ? 64 : 92, y) + (yatay ? 12 : 18);
  if (v.alt) bant(v.alt, '#FFFFFF', R.gece, yatay ? 46 : 66, y);
  return c.toDataURL('image/jpeg', 0.93);
}
