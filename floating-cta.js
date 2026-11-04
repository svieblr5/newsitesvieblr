/* ============================================================================
 * SVIE Floating CTA — Call Now + WhatsApp + one-click Callback
 * ----------------------------------------------------------------------------
 * Site-wide lead-capture buttons. Pinned bottom-LEFT so they never collide with
 * the AI chat widget (bottom-right). Phone/WhatsApp are read from the CMS
 * (/api/site-content → site.phone1 / site.whatsapp) so the number is managed in
 * one place. Every tap is logged to /api/event for the marketing dashboard
 * (calls / WhatsApp inquiries per day & by source).
 *
 * WhatsApp uses a free click-to-chat link today. When the WhatsApp Business API
 * is set up later, only the sendWhatsApp() path needs to change — the button,
 * tracking and dashboard stay the same.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__svieCTALoaded) return;
  window.__svieCTALoaded = true;

  var DEFAULT_TEL  = '918310543477';                       // fallback until config loads
  var DEFAULT_WA   = 'https://wa.me/919513961740';
  var WA_TEXT      = 'Hi SVIE, I would like to know more about your renovation & interior services.';

  // ── UTM source (persisted for the session) so events/leads are attributable ──
  var source = '';
  try {
    var qs = new URLSearchParams(location.search);
    source = qs.get('utm_source') || sessionStorage.getItem('svie_src') || '';
    if (qs.get('utm_source')) sessionStorage.setItem('svie_src', qs.get('utm_source'));
  } catch (e) { /* ignore */ }

  // ── Fire-and-forget event beacon ──
  function track(type) {
    try {
      var body = JSON.stringify({ type: type, page: location.pathname, source: source });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
      }
    } catch (e) { /* never block the click */ }
  }

  // ── Styles ──
  var css =
    '.svie-cta{position:fixed;left:20px;bottom:24px;z-index:938;display:flex;flex-direction:column;gap:12px}' +
    '.svie-cta a,.svie-cta button{display:flex;align-items:center;gap:9px;border:none;cursor:pointer;' +
      'font:600 14px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-decoration:none;' +
      'padding:12px 16px;border-radius:50px;box-shadow:0 8px 24px rgba(0,0,0,.22);transition:transform .15s,box-shadow .15s}' +
    '.svie-cta a:hover,.svie-cta button:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,0,0,.28)}' +
    '.svie-cta .svie-cta-call{background:linear-gradient(135deg,#1e8e3e,#167a33)}' +
    '.svie-cta .svie-cta-wa{background:linear-gradient(135deg,#25D366,#1ebe5a)}' +
    '.svie-cta .svie-cta-cb{background:linear-gradient(135deg,#C9A05A,#b3894a)}' +
    '.svie-cta svg{width:20px;height:20px;flex:0 0 auto;fill:currentColor}' +
    // Callback popover
    '.svie-cb-pop{position:fixed;left:20px;bottom:200px;z-index:939;width:270px;max-width:calc(100vw - 40px);' +
      'background:#fff;border:1px solid #eae4dc;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);' +
      'padding:16px 16px 14px;display:none;color:#2b2b2b}' +
    '.svie-cb-pop.open{display:block}' +
    '.svie-cb-pop h4{margin:0 0 3px;font:700 15px/1.2 system-ui,sans-serif;color:#7a5c26}' +
    '.svie-cb-pop p{margin:0 0 10px;font:400 12px/1.4 system-ui,sans-serif;color:#6b6155}' +
    '.svie-cb-pop input{width:100%;box-sizing:border-box;margin-bottom:8px;padding:10px 11px;border:1px solid #ddd6cc;' +
      'border-radius:9px;font:400 14px system-ui,sans-serif}' +
    '.svie-cb-pop input:focus{outline:none;border-color:#C9A05A}' +
    '.svie-cb-pop .svie-cb-go{width:100%;justify-content:center;padding:11px;border-radius:9px;background:linear-gradient(135deg,#C9A05A,#b3894a)}' +
    '.svie-cb-pop .svie-cb-x{position:absolute;top:8px;right:9px;width:22px;height:22px;border:none;background:none;' +
      'color:#b0a89b;font-size:19px;line-height:1;cursor:pointer;padding:0;box-shadow:none}' +
    '.svie-cb-pop .svie-cb-x:hover{transform:none;box-shadow:none;color:#7a5c26}' +
    '.svie-cb-msg{font:600 13px/1.4 system-ui,sans-serif;text-align:center;padding:6px 0}' +
    '.svie-cb-msg.ok{color:#167a33}.svie-cb-msg.err{color:#c62828}' +
    '@media(max-width:600px){' +
      '.svie-cta{left:14px;bottom:16px;gap:10px}' +
      '.svie-cta a,.svie-cta button{padding:11px 14px;font-size:13px}' +
      '.svie-cta .svie-cta-label{display:none}' +            /* icons only on small screens */
      '.svie-cta a,.svie-cta button{border-radius:50%;width:48px;height:48px;justify-content:center;padding:0}' +
      '.svie-cb-pop{bottom:186px;left:14px}' +
    '}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // SVG icons
  var icoPhone = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/></svg>';
  var icoWa    = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.8.8.8-2.7-.2-.3A8 8 0 0 1 12 4zm4.6 10.3c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.5.1-1.3-.5-2.2-1.4-2.9-2.6-.2-.3 0-.5.1-.6l.5-.6c.1-.2.1-.3 0-.5l-.7-1.6c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.8.9-.8 2.1-.1 3.3 1 1.9 2.4 3.2 4.4 4 .6.3 1.1.4 1.5.3.5-.1 1.5-.6 1.7-1.2.2-.6.2-1 .1-1.1l-.5-.2z"/></svg>';
  var icoCb    = '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v3.5A2.5 2.5 0 0 0 5.5 18H7a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5.1a7 7 0 0 1 13.8 0H17a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.5c.3 0 .6-.1.9-.2a3.5 3.5 0 0 1-3.4 2.7h-2.2a1.5 1.5 0 1 0 0 2h2.2a5.5 5.5 0 0 0 5.4-4.6c.2-.4.3-.9.3-1.4V12a9 9 0 0 0-9-9z"/></svg>';

  // ── Build DOM ──
  var bar = document.createElement('div');
  bar.className = 'svie-cta';
  bar.innerHTML =
    '<a class="svie-cta-call" href="tel:+' + DEFAULT_TEL + '" aria-label="Call SVIE now">' +
      icoPhone + '<span class="svie-cta-label">Call Now</span></a>' +
    '<a class="svie-cta-wa" target="_blank" rel="noopener" href="' + DEFAULT_WA +
      '?text=' + encodeURIComponent(WA_TEXT) + '" aria-label="Chat on WhatsApp">' +
      icoWa + '<span class="svie-cta-label">WhatsApp</span></a>' +
    '<button type="button" class="svie-cta-cb" aria-label="Request a callback">' +
      icoCb + '<span class="svie-cta-label">Call Me Back</span></button>';
  document.body.appendChild(bar);

  var pop = document.createElement('div');
  pop.className = 'svie-cb-pop';
  pop.innerHTML =
    '<button type="button" class="svie-cb-x" aria-label="Close">&times;</button>' +
    '<h4>Request a callback</h4>' +
    '<p>Leave your number — our team will call you shortly.</p>' +
    '<form>' +
      '<input type="text" name="name" placeholder="Your name" maxlength="100" autocomplete="name" required>' +
      '<input type="tel" name="phone" placeholder="10-digit mobile" maxlength="15" autocomplete="tel" required>' +
      '<button type="submit" class="svie-cb-go">Request Callback</button>' +
    '</form>' +
    '<div class="svie-cb-msg" hidden></div>';
  document.body.appendChild(pop);

  var elCall = bar.querySelector('.svie-cta-call');
  var elWa   = bar.querySelector('.svie-cta-wa');
  var elCb   = bar.querySelector('.svie-cta-cb');
  var form   = pop.querySelector('form');
  var msg    = pop.querySelector('.svie-cb-msg');

  elCall.addEventListener('click', function () { track('call'); });
  elWa.addEventListener('click',   function () { track('whatsapp'); });
  elCb.addEventListener('click',   function () {
    pop.classList.toggle('open');
    if (pop.classList.contains('open')) { track('callback_open'); form.name.focus(); }
  });
  pop.querySelector('.svie-cb-x').addEventListener('click', function () { pop.classList.remove('open'); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    var name = form.name.value.trim(), phone = form.phone.value.trim();
    showMsg('', '');
    btn.disabled = true; btn.querySelector ? null : null;
    fetch('/api/callback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, page: location.pathname })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.ok && res.j.success) {
          track('callback_submit');
          form.reset();
          showMsg('✓ Thank you! We will call you shortly.', 'ok');
          setTimeout(function () { pop.classList.remove('open'); showMsg('', ''); }, 3500);
        } else {
          showMsg(res.j.error || 'Something went wrong. Please try again.', 'err');
        }
      }).catch(function () { btn.disabled = false; showMsg('Network error. Please try again.', 'err'); });
  });

  function showMsg(text, kind) {
    msg.textContent = text; msg.className = 'svie-cb-msg ' + (kind || '');
    msg.hidden = !text;
  }

  // ── Pull the live phone / WhatsApp number from the CMS ──
  fetch('/api/site-content').then(function (r) { return r.json(); }).then(function (c) {
    var s = (c && c.site) || {};
    if (s.phone1) {
      var tel = String(s.phone1).replace(/[^\d]/g, '');
      if (tel) { if (tel.length === 10) tel = '91' + tel; elCall.setAttribute('href', 'tel:+' + tel); }
    }
    if (s.whatsapp) {
      var wa = String(s.whatsapp);
      if (!/text=/.test(wa)) wa += (wa.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(WA_TEXT);
      elWa.setAttribute('href', wa);
    }
  }).catch(function () { /* keep defaults */ });
})();
