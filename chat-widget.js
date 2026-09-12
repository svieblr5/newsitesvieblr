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
  // A per-tab id so the server can group a visitor's turns into one conversation.
  var SESSION_ID = (function () {
    try {
      var k = 'svieChatSession', v = sessionStorage.getItem(k);
      if (!v) { v = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 's' + Date.now().toString(36); }
  })();
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
  /* ── Proactive invite bubble (teaser that nudges the visitor to chat) ── */
  '.svie-chat-invite{position:fixed;bottom:100px;right:94px;max-width:250px;background:#fff;color:#2b2b2b;border:1px solid #eae4dc;' +
    'border-radius:14px;border-bottom-right-radius:4px;box-shadow:0 10px 34px rgba(0,0,0,.18);padding:13px 32px 13px 15px;z-index:939;' +
    'font:400 .84rem/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;opacity:0;transform:translateY(10px) scale(.96);' +
    'transition:opacity .3s,transform .3s;pointer-events:none}' +
  '.svie-chat-invite.show{opacity:1;transform:none;pointer-events:auto}' +
  '.svie-chat-invite b{display:block;color:#b3894a;font-size:.8rem;margin-bottom:2px}' +
  '.svie-chat-invite .svie-invite-x{position:absolute;top:5px;right:6px;width:20px;height:20px;border:none;background:none;color:#b0a89b;' +
    'cursor:pointer;font-size:15px;line-height:1;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0}' +
  '.svie-chat-invite .svie-invite-x:hover{background:#f0ece5;color:#6b6155}' +
  '.svie-chat-invite::after{content:"";position:absolute;bottom:14px;right:-7px;width:0;height:0;border:7px solid transparent;' +
    'border-left-color:#fff;border-right:0}' +
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
  '.svie-chat-note .svie-cb{color:#b3894a;font-weight:700;cursor:pointer;text-decoration:underline}' +
  /* ── Enquiry / callback form card (rendered inside the chat body) ── */
  '.svie-form{align-self:stretch;background:#fff;border:1px solid #eae4dc;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:9px}' +
  '.svie-form h4{margin:0;font-size:.9rem;color:#2b2b2b}' +
  '.svie-form p{margin:0;font-size:.74rem;color:#8a8073;line-height:1.4}' +
  '.svie-form label{font-size:.7rem;font-weight:600;color:#6b6155;display:block;margin-bottom:3px}' +
  '.svie-form input,.svie-form select{width:100%;box-sizing:border-box;border:1px solid #ddd4c8;border-radius:9px;padding:9px 10px;' +
    'font:inherit;font-size:.82rem;color:#2b2b2b;outline:none;background:#fff}' +
  '.svie-form input:focus,.svie-form select:focus{border-color:#C9A05A}' +
  '.svie-form .svie-form-err{color:#b3261e;font-size:.72rem;margin:0}' +
  '.svie-form .svie-form-actions{display:flex;gap:8px;margin-top:2px}' +
  '.svie-form button.svie-form-submit{flex:1;border:none;border-radius:10px;background:linear-gradient(135deg,#C9A05A,#b3894a);color:#fff;' +
    'font:inherit;font-weight:700;font-size:.82rem;padding:10px;cursor:pointer}' +
  '.svie-form button.svie-form-submit:disabled{opacity:.55;cursor:not-allowed}' +
  '.svie-form button.svie-form-cancel{border:1px solid #ddd4c8;border-radius:10px;background:#fff;color:#8a8073;font:inherit;font-size:.82rem;' +
    'padding:10px 14px;cursor:pointer}' +
  '@media(max-width:768px){' +
    '.svie-chat-launch{bottom:138px;right:18px;width:50px;height:50px}' +
    '.svie-chat-panel{bottom:0;right:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}' +
    '.svie-chat-invite{bottom:196px;right:18px;left:auto;max-width:220px}' +
    '.svie-chat-invite::after{display:none}' +
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

  // Proactive invite bubble — appears a few seconds after load to nudge the
  // visitor to start a chat. Text is overridden by the admin greeting/config.
  var INVITE_TITLE = 'SVIE Assistant';
  var INVITE_TEXT  = 'Hi there! 👋 Looking for interior design, construction or modular furniture? Chat with us — we’re here to help.';
  var invite = document.createElement('div');
  invite.className = 'svie-chat-invite';
  invite.setAttribute('role', 'button');
  invite.setAttribute('tabindex', '0');
  invite.setAttribute('aria-label', 'Open chat with SVIE Assistant');

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
    '<div class="svie-chat-note">AI assistant · <span class="svie-cb" role="button" tabindex="0">Request a callback</span> · call +91 95139 61740</div>';

  var body     = panel.querySelector('.svie-chat-body');
  var input    = panel.querySelector('textarea');
  var sendBtn  = panel.querySelector('.svie-chat-send');
  var closeBtn = panel.querySelector('.svie-chat-close');
  var cbLink   = panel.querySelector('.svie-cb');
  var formOpen = false;                            // an enquiry form is on screen
  var leadSent = false;                            // a lead was already submitted this session

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

  /* ── Enquiry / callback form ─────────────────────────────────────────────
     Renders a small form card inside the chat so a visitor can always leave
     their details — name, phone, email, type of query — and it drops straight
     into the CMS Enquiries inbox (POST /api/enquiries), even when the AI can't
     reply. `intro` lets the caller tailor the heading (e.g. after an error). */
  function showEnquiryForm(intro) {
    if (formOpen || leadSent) return;
    formOpen = true;
    var card = document.createElement('form');
    card.className = 'svie-form';
    card.setAttribute('novalidate', '');
    card.innerHTML =
      '<h4>Request a callback</h4>' +
      '<p>' + escapeHTML(intro || 'Share your details and our team will get back to you shortly on phone / email / WhatsApp.') + '</p>' +
      '<div><label>Name</label><input type="text" name="name" autocomplete="name" placeholder="Your full name" maxlength="100"></div>' +
      '<div><label>Phone</label><input type="tel" name="phone" autocomplete="tel" inputmode="numeric" placeholder="10-digit mobile number" maxlength="20"></div>' +
      '<div><label>Email</label><input type="email" name="email" autocomplete="email" placeholder="you@example.com" maxlength="200"></div>' +
      '<div><label>Type of query</label><select name="service">' +
        '<option value="Interior Design">Interior Design</option>' +
        '<option value="Construction">Construction</option>' +
        '<option value="Modular Furniture">Modular Furniture</option>' +
        '<option value="Other">Other / General enquiry</option>' +
      '</select></div>' +
      '<p class="svie-form-err" style="display:none"></p>' +
      '<div class="svie-form-actions">' +
        '<button type="button" class="svie-form-cancel">Cancel</button>' +
        '<button type="submit" class="svie-form-submit">Send</button>' +
      '</div>';
    body.appendChild(card);
    body.scrollTop = body.scrollHeight;

    var errEl  = card.querySelector('.svie-form-err');
    var subBtn = card.querySelector('.svie-form-submit');
    var fName  = card.querySelector('[name=name]');
    var fPhone = card.querySelector('[name=phone]');
    var fEmail = card.querySelector('[name=email]');
    var fSvc   = card.querySelector('[name=service]');
    setTimeout(function () { fName.focus(); }, 60);

    function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }

    card.querySelector('.svie-form-cancel').addEventListener('click', function () {
      card.remove();
      formOpen = false;
    });

    card.addEventListener('submit', async function (e) {
      e.preventDefault();
      var name  = fName.value.trim();
      var phone = fPhone.value.trim();
      var email = fEmail.value.trim();
      var svc   = fSvc.value;
      if (name.length < 2)                          return showErr('Please enter your name.');
      if (phone.replace(/\D/g, '').length !== 10)   return showErr('Please enter a valid 10-digit mobile number.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Please enter a valid email address.');
      errEl.style.display = 'none';
      subBtn.disabled = true; subBtn.textContent = 'Sending…';
      try {
        var res = await fetch('/api/enquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name, phone: phone, email: email, service: svc,
            message: '📋 Callback request via chat assistant (page: ' + location.pathname + ')',
          }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.success) {
          leadSent = true; formOpen = false;
          card.remove();
          addMsg('Thanks, ' + name + '! ✅ We’ve received your details and our team will reach out to you shortly. For anything urgent, call us at +91 95139 61740.', 'bot');
          if (typeof gtag !== 'undefined')
            gtag('event', 'generate_lead', { event_category: 'engagement', event_label: 'chat_callback', value: 1 });
        } else {
          subBtn.disabled = false; subBtn.textContent = 'Send';
          showErr(data.error || 'Could not send. Please try again or call +91 95139 61740.');
        }
      } catch (err) {
        subBtn.disabled = false; subBtn.textContent = 'Send';
        showErr('Network error. Please check your connection or call +91 95139 61740.');
      }
    });
  }

  /* ── Proactive invite bubble ─────────────────────────────────────────────
     Pops up after a short delay to invite the visitor into a chat. Shown once
     per browsing session (sessionStorage) so it doesn't nag on every page. */
  var inviteTimer = null;
  function inviteDismissed() {
    try { return sessionStorage.getItem('svieChatInvite') === 'done'; } catch (e) { return false; }
  }
  function markInviteDone() {
    try { sessionStorage.setItem('svieChatInvite', 'done'); } catch (e) {}
  }
  function hideInvite() {
    invite.classList.remove('show');
    setTimeout(function () { if (invite.parentNode) invite.parentNode.removeChild(invite); }, 320);
  }
  function scheduleInvite() {
    if (inviteDismissed()) return;
    inviteTimer = setTimeout(function () {
      if (opened || panel.classList.contains('open') || inviteDismissed()) return;
      invite.innerHTML =
        '<button type="button" class="svie-invite-x" aria-label="Dismiss">&times;</button>' +
        '<b>' + escapeHTML(INVITE_TITLE) + '</b>' + render(INVITE_TEXT);
      invite.querySelector('.svie-invite-x').addEventListener('click', function (e) {
        e.stopPropagation();
        markInviteDone();
        hideInvite();
      });
      document.body.appendChild(invite);
      requestAnimationFrame(function () { invite.classList.add('show'); });
    }, 3500);
  }

  function openPanel() {
    markInviteDone();
    hideInvite();
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
        body: JSON.stringify({ messages: history.slice(-MAX_TURNS), sessionId: SESSION_ID, page: location.pathname }),
      });
      var data = await res.json().catch(function () { return {}; });
      typing.remove();
      if (res.ok && data.reply) {
        addMsg(data.reply, 'bot');
        history.push({ role: 'model', text: data.reply });
      } else {
        addMsg(data.error || 'Sorry, something went wrong. Please call us at +91 95139 61740.', 'err');
        // The AI couldn't reply — offer the callback form so the lead isn't lost.
        showEnquiryForm('Leave your details below and we’ll get back to you shortly.');
      }
    } catch (e) {
      typing.remove();
      addMsg('Network error. Please check your connection or call +91 95139 61740.', 'err');
      showEnquiryForm('Leave your details below and we’ll get back to you shortly.');
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
  invite.addEventListener('click', openPanel);
  invite.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(); }
  });
  closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', send);
  cbLink.addEventListener('click', function () {
    if (leadSent) { addMsg('You’ve already shared your details — thanks! Our team will be in touch. 🙏', 'bot'); return; }
    showEnquiryForm();
  });
  cbLink.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cbLink.click(); }
  });
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
    scheduleInvite();                                    // proactive nudge after a short delay
  }
  fetch('/api/chat/config')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (cfg && cfg.enabled === false) return;         // admin turned it off / no key
      if (cfg && typeof cfg.greeting === 'string' && cfg.greeting.trim()) GREETING = cfg.greeting;
      // Let the admin tailor the proactive invite text too (optional config key).
      if (cfg && typeof cfg.inviteText === 'string' && cfg.inviteText.trim()) INVITE_TEXT = cfg.inviteText;
      mount();
    })
    .catch(function () { mount(); });                    // network hiccup → still show
})();
