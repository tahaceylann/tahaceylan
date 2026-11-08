// YouTube kapakları: node kapak.mjs <istek.json> <cikti_klasoru>
// istek.json: {marka, buyuk, orta, alt, ifade, src(data URL ya da boş)}
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const [, , istekYolu, klasor] = process.argv;
const istek = JSON.parse(fs.readFileSync(istekYolu, 'utf8'));
const sayfa = url.pathToFileURL(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'sahne.html')).href;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const hatalar = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto(sayfa);
  await page.evaluate(() => { statik = statikStudyo(); });
  for (const [ad, w, h] of [['kapak-dikey.jpg', 1080, 1920], ['kapak-yatay.jpg', 1280, 720]]) {
    const d = await page.evaluate((v) => kapakCiz(v), { ...istek, w, h });
    if (hatalar.length) throw new Error(hatalar.join(' | '));
    fs.writeFileSync(path.join(klasor, ad), Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
    console.log('   ' + path.join(klasor, ad));
  }
} finally {
  await browser.close();
}
