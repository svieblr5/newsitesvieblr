// Renders svie-brochure.html to two PDFs using Chromium (Playwright):
//   1) SVIE-Brochure-2026.pdf        -> screen/web, A4 trim (210x297mm)
//   2) SVIE-Brochure-2026-PRINT.pdf  -> press-ready, 3mm bleed + crop marks (226x313mm)
// Text stays live/selectable (editable). Usage: node brochure/render.js
const { chromium } = require('playwright');
const path = require('path');

const htmlPath = 'file://' + path.resolve(__dirname, 'svie-brochure.html').replace(/\\/g, '/');
const root = path.resolve(__dirname, '..');

async function render(browser, { print, out, w, h }) {
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: 'networkidle', timeout: 60000 });
  if (print) await page.evaluate(() => document.body.classList.add('print'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.pdf({
    path: out, width: w, height: h, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: false,
  });
  await page.close();
  console.log('PDF written ->', out);
}

(async () => {
  const browser = await chromium.launch();
  await render(browser, { print: false, out: path.join(root, 'SVIE-Brochure-2026.pdf'),       w: '210mm', h: '297mm' });
  await render(browser, { print: true,  out: path.join(root, 'SVIE-Brochure-2026-PRINT.pdf'), w: '226mm', h: '313mm' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
