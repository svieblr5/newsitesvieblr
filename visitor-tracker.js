/* SVIE Visitor Tracker
 * Collects, after consent: IP address, precise device location (if the
 * visitor's browser grants the geolocation permission prompt), country,
 * city, browser type, device type, and page visited. No cookies.
 * Requires explicit analytics consent via banner.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'svie_analytics_consent_v1';
  var PINGED_KEY  = 'svie_pinged_' + Math.round(Date.now() / 1800000); // new key every 30 min

  function getConsent() {
    try { var s = localStorage.getItem(CONSENT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }

  function setConsent(val) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ val: val, ts: Date.now() })); } catch {}
  }

  function alreadyPinged() {
    try { return !!sessionStorage.getItem(PINGED_KEY); } catch { return false; }
  }

  function markPinged() {
    try { sessionStorage.setItem(PINGED_KEY, '1'); } catch {}
  }

  function send(gps) {
    fetch('/api/visitor-ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page:     window.location.pathname,
        referrer: document.referrer,
        consent:  true,
        gps:      gps || null
      }),
      keepalive: true
    }).catch(function () {});
  }

  function ping() {
    if (alreadyPinged()) return;
    markPinged();
    if (!navigator.geolocation) { send(null); return; }
    var settled = false;
    var finish = function (gps) { if (settled) return; settled = true; send(gps); };
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        finish({
          lat:      pos.coords.latitude,
          lon:      pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      function () { finish(null); },
      { timeout: 5000, maximumAge: 300000 }
    );
    // Don't block the ping indefinitely on a slow/ignored permission prompt.
    setTimeout(function () { finish(null); }, 6000);
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = '#svie-consent{position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#0C2C1B;color:#F5EFE6;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 22px;border-top:2px solid #C9A05A;box-shadow:0 -6px 28px rgba(0,0,0,.25);font-family:Jost,sans-serif;font-size:13.5px;line-height:1.5;transform:translateY(100%);transition:transform .35s ease}#svie-consent.show{transform:translateY(0)}#svie-consent p{flex:1;min-width:220px;margin:0}#svie-consent-title{font-family:Cormorant,serif;font-size:15px;color:#C9A05A;display:block;margin-bottom:3px;font-weight:600}#svie-consent a{color:#C9A05A;text-underline-offset:3px}#svie-consent-btns{display:flex;gap:9px;flex-shrink:0}#svie-decline{padding:8px 16px;border-radius:6px;border:1.5px solid rgba(245,239,230,.35);background:transparent;color:#F5EFE6;font-family:Raleway,sans-serif;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;transition:all .2s}#svie-decline:hover{border-color:#F5EFE6}#svie-accept{padding:8px 16px;border-radius:6px;border:none;background:linear-gradient(135deg,#C9A05A,#E0C07E);color:#0C2C1B;font-family:Raleway,sans-serif;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;transition:all .2s}#svie-accept:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(201,160,90,.4)}';
    document.head.appendChild(style);
  }

  function createBanner() {
    var b = document.createElement('div');
    b.id = 'svie-consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Analytics consent');
    b.innerHTML =
      '<p>' +
        '<span id="svie-consent-title">Analytics Notice</span>' +
        'We collect your IP address, browser and device type, and pages visited to improve this website. ' +
        'Your browser may also ask permission to share your precise location, which we use to better understand where our visitors are. ' +
        'See our <a href="/privacy-policy.html">Privacy Policy</a>.' +
      '</p>' +
      '<div id="svie-consent-btns">' +
        '<button id="svie-decline">Decline</button>' +
        '<button id="svie-accept">Accept</button>' +
      '</div>';
    return b;
  }

  function showBanner() {
    injectStyles();
    var banner = createBanner();
    document.body.appendChild(banner);
    // Slide up after paint
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('show'); });
    });

    document.getElementById('svie-accept').onclick = function () {
      setConsent(true);
      banner.style.transform = 'translateY(100%)';
      setTimeout(function () { banner.remove(); }, 400);
      ping();
    };
    document.getElementById('svie-decline').onclick = function () {
      setConsent(false);
      banner.style.transform = 'translateY(100%)';
      setTimeout(function () { banner.remove(); }, 400);
    };
  }

  function init() {
    // Don't run on admin pages
    if (window.location.pathname.startsWith('/admin')) return;
    var c = getConsent();
    if (c === null) {
      setTimeout(showBanner, 2000);
    } else if (c && c.val === true) {
      ping();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
