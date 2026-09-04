// Renders each brochure page -> web-optimized JPG for the flipbook. Usage: node flipbook/build-pages.mjs
import { chromium } from 'playwright';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';

const htmlPath = pathToFileURL(resolve('brochure/svie-brochure.html')).href;
const outDir = resolve('flipbook/pages');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await p.goto(htmlPath, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);

const pages = await p.$$('.page');
for (let i = 0; i < pages.length; i++) {
  const png = await pages[i].screenshot({ type: 'png' });
  const name = `p${String(i + 1).padStart(2, '0')}.jpg`;
  await sharp(png).resize({ width: 2000 }).jpeg({ quality: 86, mozjpeg: true }).toFile(resolve(outDir, name));
  console.log('wrote', name);
}
await b.close();
console.log('pages:', pages.length);
