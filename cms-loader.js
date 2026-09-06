// SVIE CMS Content Loader — applies saved CMS content to the live website
(function () {

  /* ── Call float ──
        One number  → the button dials it directly (original behaviour).
        Two numbers → tapping the button opens a small chooser (Primary /
        Alternate) so a visitor can try the backup if the first is busy or
        unanswered. A website tap-to-call cannot detect "busy", so it can't
        auto-forward — true failover is a carrier / virtual-number setting. ── */
  function callTel(n) { return 'tel:' + String(n).replace(/[^0-9+]/g, ''); }
  function applyCallChooser(site) {
    if (!site) return;
    var btn = document.getElementById('callFloat');
    if (!btn) return;
    var p1 = (site.phone1 || '').trim();
    var p2 = (site.phone2 || '').trim();
    if (p1) {
      btn.href = callTel(p1);
      var tip = btn.querySelector('.call-float-tooltip');
      if (tip) tip.textContent = 'Call Us · ' + p1;
    }
    var pop = document.getElementById('callChooser');
    // Only one usable number → keep the plain direct-dial link, no chooser.
    if (!p2 || p2 === p1) { if (pop) pop.style.display = 'none'; return; }

    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'callChooser';
      pop.style.cssText = 'position:fixed;z-index:9999;display:none;min-width:236px;background:#123524;border:1px solid rgba(201,160,90,.5);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:8px;font-family:inherit';
      document.body.appendChild(pop);
    }
    function row(label, num) {
      return '<a href="' + callTel(num) + '" data-callnum="' + label.toLowerCase() + '" ' +
        'style="display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:8px;text-decoration:none;color:#F5EFE6" ' +
        'onmouseover="this.style.background=\'rgba(201,160,90,.15)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<span style="width:34px;height:34px;flex:0 0 34px;border-radius:50%;border:1px solid rgba(201,160,90,.5);display:flex;align-items:center;justify-content:center;color:#E0C07E">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 19z"/></svg></span>' +
        '<span><span style="display:block;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9FB6A6">' + label + '</span>' +
        '<span style="display:block;font-size:15px;font-weight:600;color:#fff;margin-top:1px">' + num + '</span></span></a>';
    }
    pop.innerHTML =
      '<div style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#E0C07E;padding:7px 12px 6px">Call SVIE</div>' +
      row('Primary', p1) + row('Alternate', p2);

    if (btn.getAttribute('data-chooser') === '1') return;   // handlers already bound
    btn.setAttribute('data-chooser', '1');
    btn.setAttribute('aria-haspopup', 'menu');

    function place() {
      var r = btn.getBoundingClientRect(), m = 8;
      pop.style.display = 'block';
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = (r.left < window.innerWidth / 2) ? r.left : r.right - pw;
      if (left < m) left = m;
      if (left + pw > window.innerWidth - m) left = window.innerWidth - m - pw;
      var top = r.top - ph - 10;
      if (top < m) top = r.bottom + 10;
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }
    function onDoc(e) { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu(); }
    function onKey(e) { if (e.key === 'Escape') closeMenu(); }
    function closeMenu() { pop.style.display = 'none'; document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); }
    function openMenu() { place(); document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (pop.style.display === 'block') closeMenu(); else openMenu();
    });
    pop.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="tel:"]');
      if (a) {
        if (typeof gtag !== 'undefined') gtag('event', 'click', { event_category: 'conversion', event_label: 'phone_click_' + (a.getAttribute('data-callnum') || '') });
        setTimeout(closeMenu, 60);
      }
    });
    window.addEventListener('resize', function () { if (pop.style.display === 'block') place(); });
  }

  /* ── Contact form: apply form settings from CMS ── */
  function applyFormSettings() {
    var DEFAULT_SERVICES = [
      'Interior Design & Decor','Construction Management',
      'Modular Furniture (Green Nest)','Multiple Services','General Enquiry'
    ];
    var DEFAULT_BUDGETS = [
      'Under ₹2 Lakhs','₹2–5 Lakhs','₹5–10 Lakhs',
      '₹10–25 Lakhs','₹25 Lakhs+','Prefer not to say'
    ];

    try {
      var fs  = JSON.parse(localStorage.getItem('svie_form_settings') || 'null') || {};
      var cfg = JSON.parse(localStorage.getItem('svie_form_config')   || 'null') || {};

      // Form title & subtitle
      var headEl = document.querySelector('.form-head');
      var subEl  = document.querySelector('.form-sub');
      if (headEl && fs.title)    headEl.textContent = fs.title;
      if (subEl  && fs.subtitle) subEl.textContent  = fs.subtitle;

      // Submit button text — use textContent to prevent XSS
      var btnEl = document.querySelector('.form-submit');
      if (btnEl && fs.btn) {
        var svg  = btnEl.querySelector('svg');
        var span = document.createElement('span');
        span.textContent = fs.btn;
        btnEl.innerHTML  = '';
        btnEl.appendChild(span);
        if (svg) btnEl.appendChild(svg);
      }

      // Service dropdown
      var svcSel = document.getElementById('service');
      if (svcSel) {
        var svcOpts = fs.services || DEFAULT_SERVICES;
        var svcVal  = svcSel.value;
        svcSel.innerHTML = '<option value="">Select a service…</option>' +
          svcOpts.map(function(s){ return '<option'+(s===svcVal?' selected':'')+'>'+s.replace(/&/g,'&amp;')+'</option>'; }).join('');
        if (cfg.show_service === false) {
          var wrap = svcSel.closest('.fg');
          if (wrap) wrap.style.display = 'none';
        }
      }

      // Budget dropdown
      var bgtSel = document.getElementById('budget');
      if (bgtSel) {
        var bgtOpts = fs.budgets || DEFAULT_BUDGETS;
        var bgtVal  = bgtSel.value;
        bgtSel.innerHTML = '<option value="">Select a range…</option>' +
          bgtOpts.map(function(b){ return '<option'+(b===bgtVal?' selected':'')+'>'+b.replace(/&/g,'&amp;')+'</option>'; }).join('');
        if (cfg.show_budget === false) {
          var wrapB = bgtSel.closest('.fg');
          if (wrapB) wrapB.style.display = 'none';
        }
      }

      // Phone required toggle
      var phoneEl = document.getElementById('phone');
      if (phoneEl && cfg.require_phone === false) phoneEl.removeAttribute('required');

    } catch {}
  }

  /* ── Footer social links from CMS (site.facebook / instagram / twitter / whatsapp) ── */
  function isSafeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
  function applySocials(site) {
    var map = { facebook:'Facebook', instagram:'Instagram', twitter:'Twitter / X', whatsapp:'WhatsApp' };
    var enabledKey = { facebook:'facebook_enabled', instagram:'instagram_enabled', twitter:'twitter_enabled', whatsapp:'wa_enabled' };
    Object.keys(map).forEach(function (k) {
      var url = site[k];
      var enabled = site[enabledKey[k]] !== false;
      document.querySelectorAll('.footer-soc[aria-label="' + map[k] + '"]').forEach(function (a) {
        if (enabled && isSafeUrl(url)) { a.href = url; a.style.display = ''; }
        else { a.style.display = 'none'; } // hidden if disabled or the link is cleared
      });
    });
  }

  /* ── Footer action links: keep tel:/mailto:/maps hrefs in sync with edited
        site info. Targets only the <a> that wraps a known data-cms span (the
        footer "Get In Touch" items), so dedicated phone2/body links elsewhere
        are left untouched. ── */
  function applyContactLinks(site) {
    function linkFor(key) {
      var span = document.querySelector('[data-cms="' + key + '"]');
      return span ? span.closest('a') : null;
    }
    if (site.phone1) {
      var a = linkFor('site.phone1');
      if (a && /^tel:/i.test(a.getAttribute('href') || ''))
        a.href = 'tel:' + site.phone1.replace(/[^0-9+]/g, '');
    }
    if (site.email) {
      var e = linkFor('site.email');
      if (e && /^mailto:/i.test(e.getAttribute('href') || ''))
        e.href = 'mailto:' + site.email;
    }
    if (site.address) {
      var ad = linkFor('site.address');
      if (ad && /^https?:/i.test(ad.getAttribute('href') || ''))
        ad.href = 'https://maps.google.com/?q=' + encodeURIComponent(site.address);
    }
  }

  /* ── WhatsApp float button: number (from site.whatsapp), enable/disable, position ── */
  function applyWhatsApp(site) {
    var fl = document.querySelector('.wa-float');
    if (!fl) return;
    if (site.wa_enabled === false) { fl.style.display = 'none'; return; }
    fl.style.display = '';
    if (isSafeUrl(site.whatsapp)) fl.href = site.whatsapp;
    if (site.wa_position === 'left') { fl.style.right = 'auto'; fl.style.left = '24px'; }
    else { fl.style.left = 'auto'; fl.style.right = ''; }
  }

  /* ── Logo cache-bust: append ?v=version so a replaced logo.png refreshes instantly ── */
  function applyLogo(site) {
    if (!site.logoVersion) return;
    document.querySelectorAll('img[src*="logo.png"]').forEach(function (img) {
      img.src = img.getAttribute('src').split('?')[0] + '?v=' + site.logoVersion;
    });
  }

  /* ── Navigation menu: rebuild nav + mobile drawer + CTA from CMS `nav` ──
        Defensive: only runs when nav.items is a valid non-empty array; on any
        error the original hard-coded nav markup is left untouched. ── */
  var NAV_ICONS = {
    box:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    sofa: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 4v9"/></svg>',
    tv:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
    'default': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
  };
  var NAV_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-left:3px"><polyline points="6 9 12 15 18 9"/></svg>';
  var NAV_ARROW   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  function navEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function navHref(h) {
    h = String(h == null ? '' : h).trim();
    if (/^https?:\/\/[^\s"'<>]+$/i.test(h)) return h;          // external
    if (/^(tel:|mailto:)[^\s"'<>]+$/i.test(h)) return h;       // tel / mailto
    if (/^[A-Za-z0-9_./#?=&%+-]+$/.test(h)) return h;          // relative path / anchor
    return '#';
  }
  function navPageFile(h) {
    h = String(h == null ? '' : h);
    if (/^(https?:|tel:|mailto:)/i.test(h)) return '';
    return h.split('#')[0].split('?')[0].split('/').pop();
  }
  function navIcon(key) { return NAV_ICONS[key] || NAV_ICONS['default']; }

  function applyNav(nav) {
    try {
      if (!nav || !Array.isArray(nav.items) || !nav.items.length) return;
      var page = location.pathname.split('/').pop() || 'index.html';

      // Desktop links
      var links = document.querySelector('.nav-links');
      if (links) {
        links.innerHTML = nav.items.map(function (it) {
          if (it.children && it.children.length) {
            var panel = it.children.map(function (ch) {
              return '<a href="' + navHref(ch.href) + '" class="nav-drop-a">' + navIcon(ch.icon) + navEsc(ch.label) + '</a>';
            }).join('');
            return '<div class="nav-drop"><a href="' + navHref(it.href) + '" class="nav-a">' + navEsc(it.label) + NAV_CHEVRON +
                   '</a><div class="nav-drop-panel">' + panel + '</div></div>';
          }
          var pf = navPageFile(it.href);
          var on = (pf && pf === page) ? ' on' : '';
          return '<a href="' + navHref(it.href) + '" class="nav-a' + on + '"' + (pf ? ' data-page="' + navEsc(pf) + '"' : '') + '>' + navEsc(it.label) + '</a>';
        }).join('');
      }

      // Desktop CTA
      if (nav.cta) {
        var ctaBtn = document.querySelector('.nav-cta .btn');
        if (ctaBtn) { ctaBtn.href = navHref(nav.cta.href); ctaBtn.innerHTML = navEsc(nav.cta.label) + NAV_ARROW; }
      }

      // Mobile drawer
      var drawer = document.querySelector('.nav-drawer');
      if (drawer) {
        drawer.querySelectorAll('a.nav-drawer-link, a.nav-drawer-sub').forEach(function (a) { a.remove(); });
        var html = nav.items.map(function (it) {
          var pf = navPageFile(it.href);
          var on = (pf && pf === page) ? ' on' : '';
          var s = '<a href="' + navHref(it.href) + '" class="nav-drawer-link' + on + '"' + (pf ? ' data-page="' + navEsc(pf) + '"' : '') + '>' + navEsc(it.label) + '</a>';
          if (it.children && it.children.length) {
            s += it.children.map(function (ch) {
              return '<a href="' + navHref(ch.href) + '" class="nav-drawer-sub">↳ ' + navEsc(ch.label) + '</a>';
            }).join('');
          }
          return s;
        }).join('');
        var gold = drawer.querySelector('.btn-gold');
        var anchor = gold ? gold.closest('div') : drawer.querySelector('div');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
        else drawer.insertAdjacentHTML('beforeend', html);
        if (nav.cta && gold) { gold.href = navHref(nav.cta.href); gold.textContent = nav.cta.label; }
        // Re-bind: clicking any drawer link closes the drawer (script.js bound the originals)
        drawer.querySelectorAll('a').forEach(function (a) {
          a.addEventListener('click', function () { drawer.classList.remove('open'); document.body.style.overflow = ''; });
        });
      }
    } catch (e) { /* keep the hard-coded nav on any failure */ }
  }

  /* ── Deep key resolver: "furniture_page.images.hero_bg" → value ── */
  function resolve(data, keyPath) {
    return keyPath.split('.').reduce(function (o, k) { return o && o[k]; }, data);
  }

  /* ── Apply a content object to all [data-cms], [data-cms-src], [data-cms-bg] ── */
  function applyContent(data) {
    if (!data) return;

    // Text content
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      var val = resolve(data, el.getAttribute('data-cms'));
      if (val != null && val !== '') el.textContent = val;
    });

    // Image src attributes  (data-cms-src="furniture_page.images.kitchen")
    document.querySelectorAll('[data-cms-src]').forEach(function (el) {
      var val = resolve(data, el.getAttribute('data-cms-src'));
      if (val) el.src = val;
    });

    // CSS background-image  (data-cms-bg="furniture_page.images.hero_bg")
    document.querySelectorAll('[data-cms-bg]').forEach(function (el) {
      var val = resolve(data, el.getAttribute('data-cms-bg'));
      // Only allow relative paths and https URLs to prevent CSS injection
      if (val && typeof val === 'string' && /^(images\/|https:\/\/)/.test(val) && !val.includes('"') && !val.includes("'") && !val.includes(')')) {
        el.style.backgroundImage = "url('" + val + "')";
      }
    });

    if (data.site) {
      applyCallChooser(data.site);
      applySocials(data.site);
      applyContactLinks(data.site);
      applyWhatsApp(data.site);
      applyLogo(data.site);
    }

    if (data.nav) applyNav(data.nav);
  }

  // ── 1. Apply from localStorage immediately (no network delay) ──
  try {
    var stored = JSON.parse(localStorage.getItem('svie_site') || 'null');
    if (stored) {
      applyCallChooser(stored);
      applyContent({ site: stored });
    }
  } catch {}

  applyFormSettings();

  // ── 2. Apply CMS page content saved from the dashboard (localStorage) ──
  try {
    var lsContent = {
      services_page:    JSON.parse(localStorage.getItem('svie_content_services_page')    || 'null'),
      products_page:    JSON.parse(localStorage.getItem('svie_content_products_page')    || 'null'),
      furniture_page:   JSON.parse(localStorage.getItem('svie_content_furniture_page')   || 'null'),
      electronics_page: JSON.parse(localStorage.getItem('svie_content_electronics_page') || 'null'),
    };
    applyContent(lsContent);
  } catch {}

  // ── 3. Also fetch from CMS backend if available (overrides localStorage) ──
  fetch('/api/site-content')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { applyContent(data); })
    .catch(function () {});

})();
