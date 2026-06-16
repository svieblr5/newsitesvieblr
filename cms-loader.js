// SVIE CMS Content Loader — applies saved CMS content to the live website
(function () {

  /* ── Call float: update href from CMS phone ── */
  function applyPhone(phone1) {
    if (!phone1) return;
    var btn = document.getElementById('callFloat');
    if (btn) {
      btn.href = 'tel:' + phone1.replace(/[^0-9+]/g, '');
      var tip = btn.querySelector('.call-float-tooltip');
      if (tip) tip.textContent = 'Call Us · ' + phone1;
    }
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

    if (data.site && data.site.phone1) applyPhone(data.site.phone1);
  }

  // ── 1. Apply from localStorage immediately (no network delay) ──
  try {
    var stored = JSON.parse(localStorage.getItem('svie_site') || 'null');
    if (stored) {
      applyPhone(stored.phone1);
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
