#!/usr/bin/env node
/*
 * build-critical.js — inline above-the-fold CSS, async-load the rest.
 *
 * Renders each page in headless Chrome (Playwright) at a mobile AND a desktop
 * viewport, collects the styles.css rules that apply to anything above the
 * fold (union of both viewports), plus all @font-face / @keyframes and the
 * whole (tiny) fonts.css, and inlines that as <style id="critical-css">.
 * The full styles.css is then loaded non-render-blocking via rel=preload swap
 * (with a <noscript> fallback).
 *
 * Idempotent: re-running replaces the previously injected block. Regenerate
 * after editing styles.css or above-the-fold markup:  npm run critical
 *
 * Requires the local server running (default http://localhost:4321).
 *   BASE=http://localhost:4321 node scripts/build-critical.js [page.html ...]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const BASE = process.env.BASE || 'http://localhost:4321';
const DEFAULT_PAGES = ['index.html','about.html','services.html','products.html',
  'furniture.html','electronics.html','gallery.html','contact.html'];
const pages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PAGES;

const VIEWPORTS = [
  { name: 'mobile',  width: 412, height: 915, isMobile: true,  deviceScaleFactor: 2 },
  { name: 'desktop', width: 1366, height: 900, isMobile: false, deviceScaleFactor: 1 },
];

// Runs in the browser: return critical rule texts for the given viewport.
function extractInPage() {
  const vh = window.innerHeight, buffer = 120;
  const out = [];
  const stripPseudo = (s) => s
    .replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop|file-selector-button)\b[^ ,>+~]*/gi, '')
    .replace(/:(hover|focus|active|visited|focus-within|focus-visible|target|checked|disabled|enabled)\b/gi, '');
  const aboveFold = (el) => {
    // Climb to the nearest ancestor that has a box: this keeps rules that hide
    // above-the-fold elements (e.g. display:none on the mobile nav links) which
    // themselves have no box but sit inside a visible, above-the-fold container.
    let node = el, hops = 0;
    while (node && node !== document.body && node !== document.documentElement && hops < 12) {
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r.top < vh + buffer && r.bottom > -buffer;
      node = node.parentElement; hops++;
    }
    return false;
  };
  const selMatches = (sel) => {
    for (let part of sel.split(',')) {
      let test = stripPseudo(part).trim();
      if (!test) return true;                                   // pure pseudo-element rule → keep
      if (/^(html|body|:root|\*)\b/i.test(test)) return true;   // document shell → always keep
      try {
        const els = document.querySelectorAll(test);
        for (const el of els) if (aboveFold(el)) return true;
      } catch (e) { return true; }                              // selector we can't test → keep to be safe
    }
    return false;
  };
  // A rule that hides/positions an element is critical if that element exists at
  // all — even when it has no box (dropdown panels, the mobile menu, toggled
  // states). Missing these makes hidden elements flash visible before styles.css
  // loads. Geometry can't detect them, so keep them whenever they're "used".
  const selUsed = (sel) => {
    for (let part of sel.split(',')) {
      let t = stripPseudo(part).trim();
      if (!t) return true;
      try { if (document.querySelectorAll(t).length) return true; } catch (e) { return true; }
    }
    return false;
  };
  const isHidingRule = (rule) =>
    /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|position\s*:\s*(absolute|fixed))/i.test(rule.cssText);
  const keepRule = (rule) => selMatches(rule.selectorText) || (isHidingRule(rule) && selUsed(rule.selectorText));
  const handle = (rules) => {
    for (const rule of rules) {
      switch (rule.type) {
        case 1:                                                 // CSSStyleRule
          if (keepRule(rule)) out.push(rule.cssText);
          break;
        case 4: {                                               // @media
          let mq = rule.media && rule.media.mediaText;
          if (window.matchMedia(mq).matches) {
            const inner = [];
            for (const r of rule.cssRules) {
              if (r.type === 1) { if (keepRule(r)) inner.push(r.cssText); }
              else inner.push(r.cssText);
            }
            if (inner.length) out.push('@media ' + mq + '{' + inner.join('') + '}');
          }
          break;
        }
        case 5:                                                 // @font-face
        case 7:                                                 // @keyframes
          out.push(rule.cssText);
          break;
        case 3:                                                 // @import → skip
          break;
        default:
          out.push(rule.cssText);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode && sheet.ownerNode.id === 'critical-css') continue; // don't re-absorb prior inline
    if (sheet.href && !/\/styles\.css/.test(sheet.href)) continue;  // only our styles.css
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    if (rules) handle(rules);
  }
  return out;
}

function injectCritical(html, criticalCss, stylesHref) {
  // strip a previously injected block so this is idempotent
  html = html.replace(/\n?[ \t]*<style id="critical-css">[\s\S]*?<\/style>/, '');
  html = html.replace(/\n?[ \t]*<link rel="preload" href="styles\.css[^>]*as="style"[^>]*>/, '');
  html = html.replace(/\n?[ \t]*<noscript><link rel="stylesheet" href="styles\.css[^>]*><\/noscript>/, '');
  // drop the separate fonts.css link (its @font-face is folded into critical)
  html = html.replace(/\n?[ \t]*<link rel="stylesheet" href="fonts\.css[^>]*>/, '');
  const block =
    `<style id="critical-css">${criticalCss}</style>\n` +
    `<link rel="preload" href="${stylesHref}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n` +
    `<noscript><link rel="stylesheet" href="${stylesHref}"></noscript>`;
  // replace the render-blocking styles.css link with the block
  return html.replace(/<link rel="stylesheet" href="styles\.css[^>]*>/, block);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() =>
    chromium.launch({ channel: 'msedge' }));
  const fontsCss = fs.existsSync(path.join(root, 'fonts.css'))
    ? fs.readFileSync(path.join(root, 'fonts.css'), 'utf8').trim() : '';

  for (const page of pages) {
    const filePath = path.join(root, page);
    if (!fs.existsSync(filePath)) { console.log('skip (missing):', page); continue; }
    let html = fs.readFileSync(filePath, 'utf8');
    const m = html.match(/href="(styles\.css\?v=[0-9a-f]+)"/);
    if (!m) { console.log('skip (no styles.css link):', page); continue; }
    const stylesHref = m[1];

    const ruleSet = new Set();
    if (fontsCss) ruleSet.add(fontsCss);
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile, deviceScaleFactor: vp.deviceScaleFactor });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/${page}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
      await p.waitForTimeout(400);
      const rules = await p.evaluate(extractInPage);
      rules.forEach(r => ruleSet.add(r));
      await ctx.close();
    }
    const criticalCss = [...ruleSet].join('');
    const crlf = /\r\n/.test(html);                    // preserve the file's original EOL
    html = injectCritical(html, criticalCss, stylesHref);
    html = html.replace(/\r\n/g, '\n');
    if (crlf) html = html.replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, html);
    console.log(`${page}: inlined ${(criticalCss.length/1024).toFixed(1)}KB critical CSS`);
  }
  await browser.close();
})();
