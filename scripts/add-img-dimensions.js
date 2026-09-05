// Inject intrinsic width/height into <img> tags that lack them, using each
// image's real pixel dimensions. This reserves layout space and eliminates
// cumulative layout shift (CLS). CSS still controls the rendered size.
//
//   node scripts/add-img-dimensions.js
//
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  let totalAdded = 0;

  for (const file of htmlFiles) {
    const full = path.join(ROOT, file);
    let html = fs.readFileSync(full, 'utf8');

    const tags = html.match(/<img\b[^>]*>/gi) || [];
    let added = 0;

    for (const tag of tags) {
      // Already sized? leave it.
      if (/\swidth\s*=/i.test(tag) || /\sheight\s*=/i.test(tag)) continue;

      const srcMatch = tag.match(/\ssrc\s*=\s*"([^"]*)"/i);
      if (!srcMatch) continue;
      const src = srcMatch[1].trim();
      if (!src || src.startsWith('data:') || /^https?:\/\//i.test(src)) continue;

      const imgPath = path.join(ROOT, src.replace(/^\//, ''));
      if (!fs.existsSync(imgPath)) continue;

      let meta;
      try {
        meta = await sharp(imgPath).metadata();
      } catch {
        continue;
      }
      if (!meta.width || !meta.height) continue;

      const newTag = tag.replace(
        /^<img\b/i,
        `<img width="${meta.width}" height="${meta.height}"`
      );
      html = html.replace(tag, newTag);
      added++;
    }

    if (added) {
      fs.writeFileSync(full, html);
      console.log(`${file}: +${added} sized`);
      totalAdded += added;
    }
  }

  console.log(`\nDone. ${totalAdded} <img> tags given width/height.`);
})();
