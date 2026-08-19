const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const root = __dirname;
  const url = 'file:///' + path.join(root, 'svie-flyer.html').replace(/\\/g, '/');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  // A4 @96dpi = 794 x 1123 css px
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600); // let webfonts settle

  const poster = page.locator('.poster');

  // High-res JPEG
  await poster.screenshot({
    path: path.join(root, 'SVIE-Flyer-2026.jpg'),
    type: 'jpeg',
    quality: 95,
  });

  // Print-ready PDF (A4, backgrounds on)
  await page.pdf({
    path: path.join(root, 'SVIE-Flyer-2026.pdf'),
    width: '210mm',
    height: '297mm',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });

  await browser.close();
  console.log('Rendered SVIE-Flyer-2026.jpg and SVIE-Flyer-2026.pdf');
})().catch((e) => { console.error(e); process.exit(1); });
