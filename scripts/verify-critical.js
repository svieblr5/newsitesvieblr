#!/usr/bin/env node
/*
 * verify-critical.js — confirm the inlined critical CSS matches the final render.
 * Renders each page twice per viewport: (A) full CSS, (B) styles.css blocked
 * (i.e. only the inline critical CSS = what the user sees at first paint), then
 * reports the % of differing pixels above the fold. Low % = no FOUC.
 */
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:4321';
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['index.html'];
const VIEWPORTS = [
  { name: 'mobile',  width: 412, height: 915 },
  { name: 'desktop', width: 1366, height: 900 },
];

async function shoot(browser, page, vp, block) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const p = await ctx.newPage();
  // Block images in BOTH renders so image-load timing can't create false diffs;
  // we're comparing CSS layout/styling, not media.
  await p.route(/\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i, r => r.abort());
  if (block) await p.route(/styles\.css/, r => r.abort());   // critical-only render
  await p.goto(`${BASE}/${page}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  if (!block) {
    // Full render: ensure the async-loaded styles.css has actually applied.
    await p.waitForFunction(() =>
      [...document.styleSheets].some(s => s.href && /styles\.css/.test(s.href) && s.cssRules && s.cssRules.length > 50),
      { timeout: 6000 }).catch(()=>{});
  }
  await p.evaluate(() => document.fonts && document.fonts.ready).catch(()=>{});
  // Settle scroll-reveal animations so we compare final layout, not animation state.
  await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important} .reveal{opacity:1!important;transform:none!important}' });
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
  await p.waitForTimeout(500);
  const buf = await p.screenshot();                    // viewport only = above the fold
  await ctx.close();
  return buf;
}

async function diffPct(a, b) {
  const A = await sharp(a).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).resize(A.info.width, A.info.height).raw().ensureAlpha().toBuffer();
  const px = A.data; let diff = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.abs(px[i]-B[i]) + Math.abs(px[i+1]-B[i+1]) + Math.abs(px[i+2]-B[i+2]) > 45) diff++;
  }
  return (diff / (A.info.width * A.info.height) * 100);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() =>
    chromium.launch({ channel: 'msedge' }));
  let worst = 0;
  for (const page of pages) {
    for (const vp of VIEWPORTS) {
      const full = await shoot(browser, page, vp, false);
      const crit = await shoot(browser, page, vp, true);
      const pct = await diffPct(full, crit);
      worst = Math.max(worst, pct);
      const flag = pct < 1.5 ? 'OK' : pct < 4 ? 'CHECK' : 'FAIL';
      console.log(`${page.padEnd(16)} ${vp.name.padEnd(8)} first-paint vs full diff: ${pct.toFixed(2)}%  ${flag}`);
    }
  }
  await browser.close();
  console.log(`\nworst: ${worst.toFixed(2)}%  → ${worst < 1.5 ? 'PASS (no meaningful FOUC)' : worst < 4 ? 'REVIEW screenshots' : 'FAIL (critical CSS incomplete)'}`);
  process.exit(worst < 4 ? 0 : 1);
})();
