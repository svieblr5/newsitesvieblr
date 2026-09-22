// Mobile Lighthouse runner. Usage: node scripts/lh.mjs [url]
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.argv[2] || 'https://www.svie5.com/';
const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  chromePath: process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const runnerResult = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
  }); // default config = mobile Moto-G + simulated slow 4G
  const lhr = runnerResult.lhr;
  console.log('URL:', url, '| finalUrl:', lhr.finalDisplayedUrl);
  if (lhr.runtimeError) console.log('RUNTIME ERROR:', lhr.runtimeError.code, lhr.runtimeError.message);
  if (lhr.runWarnings && lhr.runWarnings.length) console.log('WARNINGS:', lhr.runWarnings.join(' | '));
  console.log('PERFORMANCE:', Math.round((lhr.categories.performance.score ?? 0) * 100));
  const a = lhr.audits;
  for (const k of ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'])
    console.log('  ' + a[k].title + ':', a[k].displayValue, '(score ' + Math.round((a[k].score ?? 0) * 100) + ')');
  const lcpEl = a['largest-contentful-paint-element'];
  if (lcpEl && lcpEl.details && lcpEl.details.items) {
    const node = (lcpEl.details.items[0]?.items?.[0]?.node) || lcpEl.details.items[0]?.node;
    if (node) console.log('LCP element:', node.snippet || node.selector);
  }
  const rb = a['render-blocking-resources'];
  if (rb && rb.details && rb.details.items && rb.details.items.length) {
    console.log('Render-blocking:');
    rb.details.items.forEach(i => console.log('  ', i.url, Math.round(i.wastedMs) + 'ms'));
  }
  console.log('--- opportunities/diagnostics (>50ms or notable) ---');
  Object.values(a)
    .filter(x => x.details && x.details.overallSavingsMs > 50)
    .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs)
    .slice(0, 12)
    .forEach(x => console.log('  +' + Math.round(x.details.overallSavingsMs) + 'ms', x.id, '—', x.title));
} finally {
  try { await chrome.kill(); } catch (e) { /* windows temp cleanup EPERM — ignore */ }
}
