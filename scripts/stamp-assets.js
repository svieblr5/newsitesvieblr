#!/usr/bin/env node
/*
 * stamp-assets.js — cache-busting for un-fingerprinted static assets.
 *
 * Appends a short content hash (?v=<md5-8>) to references of the local CSS/JS
 * assets in every top-level *.html file. Because the URL changes whenever the
 * file's contents change, the server can safely serve these with a long,
 * immutable Cache-Control (see STATIC_CODE_MAX_AGE in server.js) without users
 * getting stale code after a deploy.
 *
 * Idempotent: an existing ?v=<hash> is replaced with the current one.
 * Run it after changing any of the assets below, before committing/deploying:
 *   node scripts/stamp-assets.js   (or: npm run stamp)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const ASSETS = ['styles.css', 'fonts.css', 'script.js', 'cms-loader.js', 'chat-widget.js'];

const hash = {};
for (const a of ASSETS) {
  const fp = path.join(root, a);
  if (fs.existsSync(fp)) {
    hash[a] = crypto.createHash('md5').update(fs.readFileSync(fp)).digest('hex').slice(0, 8);
  }
}

const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
let changed = 0;
for (const f of htmlFiles) {
  const fp = path.join(root, f);
  let src = fs.readFileSync(fp, 'utf8');
  const before = src;
  for (const a of ASSETS) {
    if (!hash[a]) continue;
    // Match the asset name (in href="", src="", or a JS string) with an
    // optional existing ?v=<hex>, and rewrite it to the current hash.
    const re = new RegExp(a.replace(/\./g, '\\.') + '(\\?v=[0-9a-f]+)?', 'g');
    src = src.replace(re, a + '?v=' + hash[a]);
  }
  if (src !== before) {
    const crlf = /\r\n/.test(before);                 // preserve the file's original EOL
    src = src.replace(/\r\n/g, '\n');
    if (crlf) src = src.replace(/\n/g, '\r\n');
    fs.writeFileSync(fp, src);
    changed++;
    console.log('stamped', f);
  }
}
console.log('hashes:', hash);
console.log('files changed:', changed);
