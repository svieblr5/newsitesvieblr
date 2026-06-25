// Converts SVIE-Brochure-2026.pdf -> one true-vector SVG per page (editable in CorelDRAW/Illustrator/Inkscape).
// Usage: node brochure/to-svg.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

const mod = (await import('mupdf')).default ?? (await import('mupdf'));
const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'SVIE-Brochure-SVG');
mkdirSync(outDir, { recursive: true });

const pdfBytes = readFileSync(resolve(root, 'SVIE-Brochure-2026.pdf'));
const doc = mod.Document.openDocument(pdfBytes, 'application/pdf');
const n = doc.countPages();
const ident = [1, 0, 0, 1, 0, 0]; // identity matrix (1pt = 1 user unit, keeps mm-accurate geometry)

for (let i = 0; i < n; i++) {
  const page = doc.loadPage(i);
  const bounds = page.getBounds();
  const buf = new mod.Buffer();
  // one DocumentWriter per page => each buffer is a self-contained single-page SVG
  const writer = new mod.DocumentWriter(buf, 'svg', 'text=path'); // text=path keeps fonts as outlines (no font deps)
  const dev = writer.beginPage(bounds);
  page.run(dev, ident);
  writer.endPage();
  writer.close();
  dev.close?.();

  const name = `SVIE-Brochure-p${String(i + 1).padStart(2, '0')}.svg`;
  writeFileSync(resolve(outDir, name), Buffer.from(buf.asUint8Array()));
  console.log('wrote', name, '(' + Math.round(buf.getLength() / 1024) + ' KB)');
}
console.log('\nDone -> ' + outDir + ' (' + readdirSync(outDir).length + ' files)');
