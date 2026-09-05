// Generate .webp twins for content images so Apache can serve them via
// content negotiation (see .htaccess). Icons / OG / logo are excluded so
// social scrapers and favicons always get the original PNG/JPG bytes.
//
//   node scripts/convert-webp.js
//
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'images');
const QUALITY = 80;

// Files that must keep their original format for scrapers / favicons.
const EXCLUDE = new Set([
  'logo.png',
  'icon-192.png',
  'icon-512.png',
  'og-default.jpg',
  'favicon.ico',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

(async () => {
  const files = walk(IMAGES_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  let made = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const src of files) {
    const base = path.basename(src);
    if (EXCLUDE.has(base)) { skipped++; continue; }

    const webp = src.replace(/\.(jpe?g|png)$/i, '.webp');

    // Skip if an up-to-date webp already exists.
    if (fs.existsSync(webp) && fs.statSync(webp).mtimeMs >= fs.statSync(src).mtimeMs) {
      skipped++;
      continue;
    }

    try {
      await sharp(src).webp({ quality: QUALITY }).toFile(webp);
      const before = fs.statSync(src).size;
      const after = fs.statSync(webp).size;
      // Only keep the webp when it is actually smaller — otherwise content
      // negotiation would hand the browser a heavier file.
      if (after >= before) {
        fs.unlinkSync(webp);
        skipped++;
        continue;
      }
      savedBytes += before - after;
      made++;
      console.log(
        `✓ ${path.relative(IMAGES_DIR, webp)}  ` +
        `${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
      );
    } catch (e) {
      console.error(`✗ ${src}: ${e.message}`);
    }
  }

  console.log(
    `\nDone. ${made} converted, ${skipped} skipped, ` +
    `~${(savedBytes / 1024 / 1024).toFixed(2)}MB saved.`
  );
})();
