/* =========================================
   SVIE — Global Script
   ========================================= */
(function(){
  'use strict';

  /* ── Custom Cursor ── */
  const cur = document.querySelector('.cursor');
  const ring = document.querySelector('.cursor-ring');
  if(cur && ring && matchMedia('(pointer:fine)').matches){
    let mx=0,my=0,rx=0,ry=0;
    document.addEventListener('mousemove',e=>{
      mx=e.clientX; my=e.clientY;
      cur.style.left=mx+'px'; cur.style.top=my+'px';
    },{passive:true});
    (function tick(){
      rx+=(mx-rx)*.12; ry+=(my-ry)*.12;
      ring.style.left=rx+'px'; ring.style.top=ry+'px';
      requestAnimationFrame(tick);
    })();
    const hovered=['a','button','.btn','.s-card','.team-card','.gal-item','.brand-tile','.prod-card'];
    document.querySelectorAll(hovered.join(',')).forEach(el=>{
      el.addEventListener('mouseenter',()=>{cur.classList.add('hov');ring.classList.add('hov')});
      el.addEventListener('mouseleave',()=>{cur.classList.remove('hov');ring.classList.remove('hov')});
    });
  }

  /* ── Navbar ── */
  const nav = document.querySelector('.nav');
  if(nav){
    const tick = ()=> nav.classList.toggle('stuck', scrollY > 50);
    addEventListener('scroll', tick, {passive:true});
    tick();
  }

  /* ── Burger / Mobile Drawer ── */
  const burger = document.querySelector('.nav-burger');
  const drawer = document.querySelector('.nav-drawer');
  const close  = document.querySelector('.nav-close');
  if(burger && drawer){
    const open  = ()=>{ drawer.classList.add('open'); document.body.style.overflow='hidden'; };
    const shut  = ()=>{ drawer.classList.remove('open'); document.body.style.overflow=''; };
    burger.addEventListener('click', open);
    if(close) close.addEventListener('click', shut);
    drawer.querySelectorAll('a').forEach(a=> a.addEventListener('click', shut));
  }

  /* ── Scroll Reveal ── */
  const els = document.querySelectorAll('.reveal');
  if(els.length){
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.1,rootMargin:'0px 0px -36px 0px'});
    els.forEach(el=> io.observe(el));
  }

  /* ── Number Counters ── */
  document.querySelectorAll('[data-count]').forEach(el=>{
    const io2 = new IntersectionObserver(entries=>{
      if(!entries[0].isIntersecting) return;
      io2.disconnect();
      const target = +el.dataset.count;
      const suf = el.dataset.suf||'';
      const pre = el.dataset.pre||'';
      let start, dur=1800;
      (function step(ts){
        if(!start) start=ts;
        const p = Math.min((ts-start)/dur,1);
        const e = 1-Math.pow(1-p,3);
        el.textContent = pre + Math.round(e*target) + suf;
        if(p<1) requestAnimationFrame(step);
      })(performance.now());
    },{threshold:.5});
    io2.observe(el);
  });

  /* ── Contact Form → saves to localStorage for CMS inbox ── */
  const form = document.querySelector('#contact-form');
  if(form){
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const btn = form.querySelector('.form-submit');
      const orig = btn.innerHTML;
      btn.innerHTML='<span style="display:flex;align-items:center;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Sending…</span>';
      btn.disabled=true;

      // Build enquiry object
      const data = {};
      new FormData(form).forEach((v,k)=>{ data[k]=v; });
      data.id     = 'enq_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      data.date   = new Date().toISOString();
      data.status = 'new';

      // ── Save to localStorage (primary — works on static sites) ──
      try {
        const existing = JSON.parse(localStorage.getItem('svie_enquiries')||'[]');
        existing.unshift(data);
        localStorage.setItem('svie_enquiries', JSON.stringify(existing));
      } catch {}

      // ── Also try backend API if server is running ──
      try {
        await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      } catch {}

      btn.innerHTML='<span>✓ Message Sent! We\'ll be in touch within 24 hrs.</span>';
      btn.style.background='#22c55e';
      setTimeout(()=>{ btn.innerHTML=orig; btn.disabled=false; btn.style.background=''; form.reset(); },4000);
    });
  }

  /* ── Click to Call — track clicks in localStorage for CMS ── */
  const callBtn = document.getElementById('callFloat');
  if (callBtn) {
    callBtn.addEventListener('click', () => {
      try {
        const clicks = JSON.parse(localStorage.getItem('svie_call_clicks')||'[]');
        clicks.unshift({ time: new Date().toISOString(), page: location.pathname.split('/').pop()||'index.html' });
        if (clicks.length > 200) clicks.length = 200; // keep last 200
        localStorage.setItem('svie_call_clicks', JSON.stringify(clicks));
      } catch {}
    });
  }

  /* ── Marquee clone ── */
  const track = document.querySelector('.marquee-track');
  if(track) track.innerHTML += track.innerHTML;

  /* ── Active page link ── */
  const page = location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-a[data-page],.nav-drawer-link[data-page]').forEach(a=>{
    if(a.dataset.page===page) a.classList.add('on');
  });

})();
