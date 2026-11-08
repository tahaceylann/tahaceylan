// Zaman çizelgesini (zaman.json) Chromium'da kare kare çizer, işçi başına bir H.264 parçası üretir.
// Kullanım: node kaydet.mjs <zaman.json> <calisma_klasoru> [isci]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Playwright ortamda global kurulu (NODE_PATH); ESM import onu görmediği için require ile yüklenir.
const { chromium } = createRequire(import.meta.url)('playwright');
const [, , zamanYolu, klasor, isciArg] = process.argv;
const T = JSON.parse(fs.readFileSync(zamanYolu, 'utf8'));
const N = T.kareler;
const isciSayisi = Math.max(1, Math.min(6, parseInt(isciArg || '3', 10)));
const sayfa = url.pathToFileURL(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'sahne.html')).href;

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
const parca = Math.ceil(N / isciSayisi);
const araliklar = [];
for (let i = 0; i < isciSayisi; i++) {
  const a = i * parca, b = Math.min(N, (i + 1) * parca);
  if (a < b) araliklar.push([i, a, b]);
}
let bitti = 0;
const ilerleme = setInterval(() => process.stdout.write(`\r   kare ${bitti}/${N}`), 2000);

async function isci([i, a, b]) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const hatalar = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
  await page.goto(sayfa);
  await page.evaluate((t) => hazirla(t), T);
  const hedef = path.join(klasor, `parca${String(i).padStart(2, '0')}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(T.fps),
    '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-r', String(T.fps), '-g', String(T.fps * 2), hedef],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const kapandi = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg çıkış ' + c)))));
  for (let k = a; k < b; k++) {
    const d = await page.evaluate((kk) => kare(kk), k);
    if (hatalar.length) throw new Error('Sayfa hatası: ' + hatalar.join(' | '));
    const buf = Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    bitti++;
  }
  ff.stdin.end();
  await kapandi;
  await page.close();
  return hedef;
}

try {
  const dosyalar = await Promise.all(araliklar.map(isci));
  fs.writeFileSync(path.join(klasor, 'parcalar.txt'), dosyalar.map((f) => `file '${path.basename(f)}'`).join('\n') + '\n');
  process.stdout.write(`\r   kare ${N}/${N}\n`);
} catch (e) {
  console.error('\nRender hatası:', e.message);
  process.exitCode = 1;
} finally {
  clearInterval(ilerleme);
  await browser.close();
}
