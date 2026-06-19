// SVIE — Dynamic testimonials + review structured data.
// Renders CMS testimonials on the homepage and emits a matching AggregateRating/Review
// JSON-LD ONLY when real testimonials exist and are shown on the page. Nothing is ever
// fabricated — no testimonials means no rating markup (and no star snippet).
(function () {
  var ORIGIN = 'https://svie5.com';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clampRating(r) {
    r = Math.round(Number(r));
    if (!isFinite(r)) r = 5;
    return Math.max(1, Math.min(5, r));
  }
  function stars(n) {
    n = clampRating(n);
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function render(testimonials) {
    var grid = document.getElementById('testimonialGrid');
    var sec  = document.getElementById('testimonials');
    if (!grid || !sec) return;

    grid.innerHTML = testimonials.map(function (t) {
      var role = [t.role, t.project].filter(Boolean).join(' · ');
      return '<div class="tst-card">' +
          '<div class="tst-stars" aria-label="' + clampRating(t.rating) + ' out of 5">' + stars(t.rating) + '</div>' +
          '<p class="tst-text">“' + esc(t.text) + '”</p>' +
          '<div class="tst-meta">' +
            '<div class="tst-name">' + esc(t.name || 'Client') + '</div>' +
            (role ? '<div class="tst-role">' + esc(role) + '</div>' : '') +
          '</div>' +
        '</div>';
    }).join('');
    sec.hidden = false;
  }

  function injectRating(testimonials) {
    var rated = testimonials.filter(function (t) { return Number(t.rating) > 0; });
    if (!rated.length) return;

    var sum = rated.reduce(function (a, t) { return a + clampRating(t.rating); }, 0);
    var avg = Math.round((sum / rated.length) * 10) / 10;

    // Visible aggregate label (so the markup matches on-page content)
    var agg = document.getElementById('tstAggregate');
    if (agg) {
      agg.textContent = '★ ' + avg.toFixed(1) + ' / 5 · based on ' +
        rated.length + ' client review' + (rated.length > 1 ? 's' : '');
      agg.style.display = 'block';
    }

    // Augment the existing LocalBusiness JSON-LD with a REAL rating + reviews
    var block = document.querySelector('script[type="application/ld+json"]');
    if (!block) return;
    var data;
    try { data = JSON.parse(block.textContent); } catch (e) { return; }

    var graph = (data && data['@graph']) || [];
    var biz = graph.filter(function (n) { return n && n['@id'] === ORIGIN + '/#business'; })[0];
    if (!biz) return;

    biz.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(avg),
      bestRating: '5', worstRating: '1',
      ratingCount: String(rated.length),
      reviewCount: String(rated.length)
    };
    biz.review = rated.slice(0, 20).map(function (t) {
      var rev = {
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: String(clampRating(t.rating)), bestRating: '5', worstRating: '1' },
        author: { '@type': 'Person', name: t.name || 'Client' },
        reviewBody: t.text || ''
      };
      if (t.date) rev.datePublished = t.date;
      return rev;
    });

    block.textContent = JSON.stringify(data);
  }

  fetch('/api/site-content')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var list = (d && Array.isArray(d.testimonials)) ? d.testimonials : [];
      list = list.filter(function (t) { return t && t.text; });
      if (!list.length) return;   // no real testimonials → no display, no rating markup
      render(list);
      injectRating(list);
    })
    .catch(function () {});
})();
