/* ============================================================================
   SVIE AI Chat Assistant — front-end widget
   ----------------------------------------------------------------------------
   Self-contained: injects its own styles, a floating launcher and a chat panel,
   and talks to the server-side proxy at POST /api/chat (which holds the Gemini
   API key). Include once per page: <script src="chat-widget.js" defer></script>
   Powered by Google Gemini (free tier). No third-party scripts, no cookies.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__svieChatLoaded) return;          // guard against double-include
  window.__svieChatLoaded = true;

  var ENDPOINT   = '/api/chat';
  var GREETING   = 'Hi! 👋 I’m the SVIE Assistant. Ask me about our interior design, construction or modular furniture services — or how to get a free quote.';
  var MAX_TURNS  = 12;                            // history sent to the server
  var history    = [];                            // [{role:'user'|'model', text}]
  var sending    = false;
  var opened     = false;

  /* ── Styles ─────────────────────────────────────────────────────────── */
  var css = '' +
  '.svie-chat-launch{position:fixed;bottom:94px;right:30px;width:54px;height:54px;border:none;border-radius:50%;' +
    'background:linear-gradient(135deg,#C9A05A,#b3894a);color:#fff;cursor:pointer;z-index:940;display:flex;' +
    'align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(201,160,90,.5);transition:transform .25s,box-shadow .25s}' +
  '.svie-chat-launch:hover{transform:scale(1.1);box-shadow:0 8px 32px rgba(201,160,90,.6)}' +
  '.svie-chat-launch svg{width:26px;height:26px}' +
  '.svie-chat-launch .svie-chat-badge{position:absolute;top:-3px;right:-3px;background:#e53935;color:#fff;font:700 10px/1 system-ui,sans-serif;' +
    'padding:3px 5px;border-radius:10px;border:2px solid #fff}' +
  '.svie-chat-panel{position:fixed;bottom:30px;right:30px;width:370px;max-width:calc(100vw - 40px);height:540px;max-height:calc(100vh - 60px);' +
    'background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.28);z-index:950;display:none;flex-direction:column;overflow:hidden;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;transform:translateY(20px) scale(.98);transition:opacity .22s,transform .22s}' +
  '.svie-chat-panel.open{display:flex;opacity:1;transform:none}' +
  '.svie-chat-head{background:linear-gradient(135deg,#1a1a1a,#2b2b2b);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:11px}' +
  '.svie-chat-head .dot{width:9px;height:9px;border-radius:50%;background:#3ddc84;box-shadow:0 0 0 3px rgba(61,220,132,.25);flex:none}' +
  '.svie-chat-head .tt{flex:1;min-width:0}' +
  '.svie-chat-head .tt b{display:block;font-size:.92rem;letter-spacing:.2px}' +
  '.svie-chat-head .tt span{display:block;font-size:.68rem;color:#b9b0a4;margin-top:1px}' +
  '.svie-chat-head button{background:none;border:none;color:#cfc7ba;cursor:pointer;padding:4px;line-height:0;border-radius:6px}' +
  '.svie-chat-head button:hover{background:rgba(255,255,255,.12);color:#fff}' +
  '.svie-chat-body{flex:1;overflow-y:auto;padding:16px 14px;background:#f6f4f1;display:flex;flex-direction:column;gap:10px}' +
  '.svie-msg{max-width:82%;padding:10px 13px;border-radius:14px;font-size:.86rem;line-height:1.45;word-wrap:break-word;white-space:pre-wrap}' +
  '.svie-msg.bot{background:#fff;color:#2b2b2b;align-self:flex-start;border:1px solid #eae4dc;border-bottom-left-radius:4px}' +
  '.svie-msg.user{background:linear-gradient(135deg,#C9A05A,#b3894a);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
  '.svie-msg.err{background:#fff4f4;color:#b3261e;border:1px solid #f3c9c6;align-self:flex-start}' +
  '.svie-msg a{color:inherit;text-decoration:underline}' +
  '.svie-typing{align-self:flex-start;background:#fff;border:1px solid #eae4dc;border-radius:14px;border-bottom-left-radius:4px;padding:12px 14px;display:flex;gap:4px}' +
  '.svie-typing i{width:7px;height:7px;border-radius:50%;background:#c3b8a8;animation:svieBlink 1.2s infinite both}' +
  '.svie-typing i:nth-child(2){animation-delay:.2s}.svie-typing i:nth-child(3){animation-delay:.4s}' +
  '@keyframes svieBlink{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
  '.svie-chat-foot{border-top:1px solid #eae4dc;background:#fff;padding:10px;display:flex;gap:8px;align-items:flex-end}' +
  '.svie-chat-foot textarea{flex:1;resize:none;border:1px solid #ddd4c8;border-radius:12px;padding:10px 12px;font:inherit;font-size:.86rem;' +
    'max-height:96px;outline:none;color:#2b2b2b}' +
  '.svie-chat-foot textarea:focus{border-color:#C9A05A}' +
  '.svie-chat-foot button{flex:none;width:40px;height:40px;border:none;border-radius:12px;background:#C9A05A;color:#fff;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;transition:background .2s}' +
  '.svie-chat-foot button:hover:not(:disabled){background:#b3894a}' +
  '.svie-chat-foot button:disabled{opacity:.5;cursor:not-allowed}' +
  '.svie-chat-note{font-size:.6rem;color:#9a8f80;text-align:center;padding:0 0 7px}' +
  '@media(max-width:768px){' +
    '.svie-chat-launch{bottom:138px;right:18px;width:50px;height:50px}' +
    '.svie-chat-panel{bottom:0;right:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}' +
  '}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Elements ───────────────────────────────────────────────────────── */
  var launch = document.createElement('button');
  launch.className = 'svie-chat-launch';
  launch.setAttribute('aria-label', 'Chat with SVIE Assistant');
  launch.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
    '<span class="svie-chat-badge">AI</span>';

  var panel = document.createElement('div');
  panel.className = 'svie-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'SVIE Assistant chat');
  panel.innerHTML =
    '<div class="svie-chat-head">' +
      '<span class="dot"></span>' +
      '<span class="tt"><b>SVIE Assistant</b><span>Typically replies instantly</span></span>' +
      '<button type="button" class="svie-chat-close" aria-label="Close chat">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="svie-chat-body" aria-live="polite"></div>' +
    '<div class="svie-chat-foot">' +
      '<textarea rows="1" placeholder="Type your message…" aria-label="Message" maxlength="2000"></textarea>' +
      '<button type="button" class="svie-chat-send" aria-label="Send message">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="svie-chat-note">AI assistant · for exact quotes call +91 95139 61740</div>';

  var body     = panel.querySelector('.svie-chat-body');
  var input    = panel.querySelector('textarea');
  var sendBtn  = panel.querySelector('.svie-chat-send');
  var closeBtn = panel.querySelector('.svie-chat-close');

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Turn plain text into safe HTML: escape, linkify URLs and the phone number,
  // preserve line breaks.
  function render(text) {
    var h = escapeHTML(text);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/(\+?91[\s-]?\d{5}[\s-]?\d{5})/g, function (m) {
      return '<a href="tel:' + m.replace(/[\s-]/g, '') + '">' + m + '</a>';
    });
    return h.replace(/\n/g, '<br>');
  }
  function addMsg(text, cls) {
    var el = document.createElement('div');
    el.className = 'svie-msg ' + cls;
    el.innerHTML = render(text);
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function showTyping() {
    var t = document.createElement('div');
    t.className = 'svie-typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
    return t;
  }

  function openPanel() {
    panel.classList.add('open');
    var badge = launch.querySelector('.svie-chat-badge');
    if (badge) badge.style.display = 'none';
    if (!opened) {
      opened = true;
      addMsg(GREETING, 'bot');
      if (typeof gtag !== 'undefined')
        gtag('event', 'click', { event_category: 'engagement', event_label: 'chat_open', value: 1 });
    }
    setTimeout(function () { input.focus(); }, 250);
  }
  function closePanel() { panel.classList.remove('open'); }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }

  async function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = '';
    autoGrow();

    addMsg(text, 'user');
    history.push({ role: 'user', text: text });
    var typing = showTyping();

    try {
      var res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_TURNS) }),
      });
      var data = await res.json().catch(function () { return {}; });
      typing.remove();
      if (res.ok && data.reply) {
        addMsg(data.reply, 'bot');
        history.push({ role: 'model', text: data.reply });
      } else {
        addMsg(data.error || 'Sorry, something went wrong. Please call us at +91 95139 61740.', 'err');
      }
    } catch (e) {
      typing.remove();
      addMsg('Network error. Please check your connection or call +91 95139 61740.', 'err');
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  launch.addEventListener('click', function () {
    panel.classList.contains('open') ? closePanel() : openPanel();
  });
  closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', send);
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });

  /* ── Init: ask the server whether the assistant is on, then mount ─────── */
  function mount() {
    document.body.appendChild(launch);
    document.body.appendChild(panel);
  }
  fetch('/api/chat/config')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (cfg && cfg.enabled === false) return;         // admin turned it off / no key
      if (cfg && typeof cfg.greeting === 'string' && cfg.greeting.trim()) GREETING = cfg.greeting;
      mount();
    })
    .catch(function () { mount(); });                    // network hiccup → still show
})();
