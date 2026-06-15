require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SALT_ROUNDS = 12;

// ── File paths ──
const CONTENT_FILE  = path.join(ROOT, 'data', 'content.json');
const ENQUIRY_FILE  = path.join(ROOT, 'data', 'enquiries.json');
const ACTIVITY_FILE = path.join(ROOT, 'data', 'activity.json');
const CONFIG_FILE   = path.join(ROOT, 'data', 'config.json');
const VISITORS_FILE = path.join(ROOT, 'data', 'visitors.json');

// ── Geo-IP in-memory cache (ip → {data, ts}) ──
const GEO_CACHE = new Map();
const GEO_TTL   = 3600000; // 1 hour

// ── Config helpers ──
const ADMIN_USER = 'admin';
const getConfig  = () => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8')); } catch { return {}; } };
const saveConfig = d  => fs.writeFileSync(CONFIG_FILE, JSON.stringify(d,null,2));

// ── Password: bcrypt-based with auto-migration from plaintext ──
async function verifyPassword(input) {
  const cfg = getConfig();
  if (cfg.passwordHash) {
    return bcrypt.compare(input, cfg.passwordHash);
  }
  // Legacy plaintext — compare then migrate automatically
  const plain = cfg.password || 'svie@2024';
  if (input === plain) {
    const hash = await bcrypt.hash(plain, SALT_ROUNDS);
    cfg.passwordHash = hash;
    delete cfg.password;
    saveConfig(cfg);
    return true;
  }
  return false;
}

async function hashAndSavePassword(newPlain) {
  const hash = await bcrypt.hash(newPlain, SALT_ROUNDS);
  const cfg  = getConfig();
  cfg.passwordHash = hash;
  delete cfg.password;
  saveConfig(cfg);
}

// ═══════════════════════════════════════════
//  SECURITY HEADERS — Helmet
// ═══════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc:     ["'self'", 'https://www.google-analytics.com', 'https://region1.google-analytics.com'],
      frameSrc:       ["'self'", 'https://www.openstreetmap.org'],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff:          true,
  frameguard:       { action: 'deny' },
  xssFilter:        true,
  hidePoweredBy:    true,
  permissionsPolicy: {
    features: {
      camera:           [],
      microphone:       [],
      geolocation:      [],
      interestCohort:   [],
    }
  }
}));

// ── Block direct access to /data/ directory ──
app.use('/data', (req,res) => res.status(403).json({ error: 'Forbidden' }));

// ═══════════════════════════════════════════
//  FONT CATALOG — used by /fonts.css + API
// ═══════════════════════════════════════════
const FONT_CATALOG = {
  // Heading / display serifs
  'Cormorant':         { gf:'Cormorant:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600',      css:"'Cormorant', Georgia, serif" },
  'Playfair Display':  { gf:'Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,700',                        css:"'Playfair Display', Georgia, serif" },
  'Lora':              { gf:'Lora:ital,wght@0,400;0,600;0,700;1,400;1,700',                                    css:"'Lora', Georgia, serif" },
  'EB Garamond':       { gf:'EB+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,700',                             css:"'EB Garamond', Georgia, serif" },
  'Libre Baskerville': { gf:'Libre+Baskerville:ital,wght@0,400;0,700;1,400',                                   css:"'Libre Baskerville', Georgia, serif" },
  'Spectral':          { gf:'Spectral:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600',                          css:"'Spectral', Georgia, serif" },
  // Body / UI sans-serifs
  'Jost':              { gf:'Jost:wght@300;400;500;600',                                                        css:"'Jost', system-ui, sans-serif" },
  'Raleway':           { gf:'Raleway:wght@300;400;500;600;700;800',                                             css:"'Raleway', system-ui, sans-serif" },
  'Inter':             { gf:'Inter:wght@300;400;500;600;700',                                                   css:"'Inter', system-ui, sans-serif" },
  'Poppins':           { gf:'Poppins:wght@300;400;500;600;700',                                                 css:"'Poppins', system-ui, sans-serif" },
  'Montserrat':        { gf:'Montserrat:wght@300;400;500;600;700',                                              css:"'Montserrat', system-ui, sans-serif" },
  'DM Sans':           { gf:'DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400',                                 css:"'DM Sans', system-ui, sans-serif" },
};
const VALID_FONTS = new Set(Object.keys(FONT_CATALOG));

// ── GET /fonts.css — dynamic font stylesheet for all public pages ──
app.get('/fonts.css', (req, res) => {
  const cfg  = getConfig();
  const dFont = VALID_FONTS.has(cfg.fontDisplay) ? cfg.fontDisplay : 'Cormorant';
  const sFont = VALID_FONTS.has(cfg.fontSans)    ? cfg.fontSans    : 'Raleway';
  const bFont = VALID_FONTS.has(cfg.fontBody)    ? cfg.fontBody    : 'Jost';
  const fSize = Math.min(Math.max(parseInt(cfg.fontSize) || 16, 12), 24);

  const gfParts = [...new Set([dFont, sFont, bFont])].map(n => 'family=' + FONT_CATALOG[n].gf);
  const importUrl = `https://fonts.googleapis.com/css2?${gfParts.join('&')}&display=swap`;

  const css = [
    `@import url('${importUrl}');`,
    `:root{`,
    `  --font-display:${FONT_CATALOG[dFont].css};`,
    `  --font-sans:${FONT_CATALOG[sFont].css};`,
    `  --font-body:${FONT_CATALOG[bFont].css};`,
    `}`,
    `html{font-size:${fSize}px}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.send(css);
});

// ── Middleware ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(ROOT));
app.use('/admin', express.static(path.join(ROOT,'admin')));

if (!process.env.SESSION_SECRET) {
  console.warn('  ⚠  SESSION_SECRET env var not set — sessions will be lost on restart. Set it in production.');
}

app.use(session({
  secret:            process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex'),
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   8 * 60 * 60 * 1000,  // 8 hours
    httpOnly: true,                  // no JS access to cookie
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',              // CSRF defence
  },
}));

// ═══════════════════════════════════════════
//  RATE LIMITERS
// ═══════════════════════════════════════════
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      10,                 // max 10 attempts per window
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max:      200,                // 200 requests per minute for authenticated API
  standardHeaders: true,
  legacyHeaders:   false,
});

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      5,                  // max 5 enquiry submissions per IP per window
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many enquiries submitted. Please try again later.' },
});

app.use('/api/', apiLimiter);

// ── Multer: gallery uploads ──
const galleryStorage = multer.diskStorage({
  destination: (req,file,cb) => {
    const d = path.join(ROOT,'images','gallery');
    if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
    cb(null, d);
  },
  filename: (req,file,cb) => {
    const ext  = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g,'');
    const base = crypto.randomBytes(8).toString('hex');
    cb(null, Date.now() + '-' + base + ext);
  }
});
const ALLOWED_IMG_MIME = new Set(['image/jpeg','image/jpg','image/png','image/webp','image/gif']);
const upload = multer({
  storage: galleryStorage,
  limits:  { fileSize: 10*1024*1024 },
  fileFilter: (req,file,cb) => {
    const ok = ALLOWED_IMG_MIME.has(file.mimetype);
    cb(ok ? null : new Error('Images only (JPEG, PNG, WebP, GIF)'), ok);
  },
});

// ── Multer: team photo uploads ──
const teamStorage = multer.diskStorage({
  destination: (req,file,cb) => {
    const d = path.join(ROOT,'images','team');
    if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
    cb(null, d);
  },
  filename: (req,file,cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g,'');
    cb(null, 'team-' + parseInt(req.params.index||0) + '-' + Date.now() + ext);
  }
});
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg','image/jpg','image/png','image/webp']);
const uploadTeam = multer({
  storage: teamStorage,
  limits:  { fileSize: 5*1024*1024 },
  fileFilter: (req,file,cb) => {
    const ok = ALLOWED_PHOTO_MIME.has(file.mimetype);
    cb(ok ? null : new Error('Images only (JPEG, PNG, WebP)'), ok);
  },
});

// ── Multer: restore backup ──
const restoreStorage = multer.diskStorage({
  destination: (req,file,cb) => cb(null, path.join(ROOT,'data')),
  filename:    (req,file,cb) => cb(null, '_restore-tmp.json')
});
const uploadRestore = multer({
  storage: restoreStorage,
  limits:  { fileSize: 5*1024*1024 },
  fileFilter: (req,file,cb) => {
    const ok = file.mimetype === 'application/json' || file.originalname.endsWith('.json');
    cb(ok ? null : new Error('JSON files only'), ok);
  },
});

// ── Auth middleware ──
const requireAuth = (req,res,next) => req.session?.loggedIn ? next() : res.status(401).json({ error:'Unauthorized' });

// ── CSRF middleware — validates X-CSRF-Token on all state-changing API calls ──
const csrfProtect = (req,res,next) => {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    const token = req.headers['x-csrf-token'];
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
  }
  next();
};

// ── JSON helpers ──
const readJSON  = (file, def) => { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return def; } };
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data,null,2));
const readContent  = ()   => readJSON(CONTENT_FILE, {});
const writeContent = data => writeJSON(CONTENT_FILE, data);

// ── Activity log ──
const logActivity = (action, user='admin') => {
  const log = readJSON(ACTIVITY_FILE, []);
  log.unshift({ action, user, time: new Date().toISOString() });
  writeJSON(ACTIVITY_FILE, log.slice(0,100));
};

// ── Robots.txt — block admin/api from crawlers ──
app.get('/robots.txt', (req,res) => {
  res.type('text/plain');
  res.send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /admin/\n' +
    'Disallow: /api/\n' +
    'Disallow: /data/\n\n' +
    'Sitemap: https://svie5.com/sitemap.xml\n'
  );
});

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
app.post('/api/auth/login', loginLimiter, async (req,res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error:'Missing credentials' });

    if (username === ADMIN_USER && await verifyPassword(password)) {
      // Regenerate session to prevent session fixation
      req.session.regenerate(err => {
        if (err) return res.status(500).json({ error:'Session error' });
        req.session.loggedIn   = true;
        req.session.user       = username;
        req.session.csrfToken  = crypto.randomBytes(32).toString('hex');
        logActivity('Signed in', username);
        res.json({ success:true, csrfToken: req.session.csrfToken });
      });
    } else {
      res.status(401).json({ error:'Invalid username or password' });
    }
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/auth/logout', (req,res) => {
  if (req.session?.loggedIn) logActivity('Signed out', req.session.user);
  req.session.destroy(() => res.json({ success:true }));
});

app.get('/api/auth/check', (req,res) => res.json({ loggedIn:!!req.session.loggedIn, user:req.session.user||null }));

// CSRF token endpoint — called by dashboard on load
app.get('/api/csrf-token', requireAuth, (req,res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.json({ token: req.session.csrfToken });
});

app.post('/api/auth/change-password', requireAuth, csrfProtect, async (req,res) => {
  try {
    const { current, newPass } = req.body;
    if (!current || !newPass) return res.status(400).json({ error:'Missing fields' });
    if (!await verifyPassword(current)) return res.status(401).json({ error:'Current password is incorrect' });
    if (newPass.length < 8) return res.status(400).json({ error:'New password must be at least 8 characters' });
    await hashAndSavePassword(newPass);
    // Rotate CSRF token after password change
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    logActivity('Changed admin password', req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

// ═══════════════════════════════════════════
//  PUBLIC CONTENT — no auth, read-only, for cms-loader.js on frontend
// ═══════════════════════════════════════════
app.get('/api/site-content', (req,res) => res.json(readContent()));

// ═══════════════════════════════════════════
//  CONTENT — generic section CRUD
// ═══════════════════════════════════════════
app.get('/api/content',           requireAuth, (req,res) => res.json(readContent()));
app.get('/api/content/:section',  requireAuth, (req,res) => {
  const c = readContent();
  const s = c[req.params.section];
  if (s === undefined) return res.status(404).json({ error:'Section not found' });
  res.json(s);
});

app.post('/api/content/:section', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    c[req.params.section] = { ...c[req.params.section], ...req.body };
    writeContent(c);
    logActivity('Saved '+req.params.section, req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/content/:section/:sub', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    if (!c[req.params.section]) c[req.params.section] = {};
    c[req.params.section][req.params.sub] = req.body;
    writeContent(c);
    logActivity(`Saved ${req.params.section}.${req.params.sub}`, req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Backup ──
app.get('/api/backup', requireAuth, (req,res) => {
  const data  = fs.readFileSync(CONTENT_FILE);
  const fname = 'svie-backup-' + new Date().toISOString().slice(0,10) + '.json';
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(data);
  logActivity('Downloaded content backup', req.session.user);
});

// ── Restore ──
app.post('/api/restore', requireAuth, csrfProtect, uploadRestore.single('file'), (req,res) => {
  try {
    const tmpPath = path.join(ROOT,'data','_restore-tmp.json');
    const data    = JSON.parse(fs.readFileSync(tmpPath,'utf8'));
    writeContent(data);
    fs.unlinkSync(tmpPath);
    logActivity('Restored content from backup', req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(400).json({ error:'Invalid backup file: '+e.message }); }
});

// ═══════════════════════════════════════════
//  TEAM PHOTO UPLOAD
// ═══════════════════════════════════════════
app.post('/api/team/upload/:index', requireAuth, csrfProtect, uploadTeam.single('photo'), (req,res) => {
  try {
    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx > 20) return res.status(400).json({ error:'Invalid index' });
    const src = 'images/team/' + req.file.filename;
    const c   = readContent();
    if (!c.about)       c.about      = {};
    if (!c.about.team)  c.about.team = [];
    while (c.about.team.length <= idx) c.about.team.push({});
    c.about.team[idx].photo = src;
    writeContent(c);
    logActivity('Uploaded team photo for member '+idx, req.session.user);
    res.json({ success:true, src });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/team/photo/:index', requireAuth, csrfProtect, (req,res) => {
  try {
    const idx    = parseInt(req.params.index);
    const c      = readContent();
    const member = (c.about?.team||[])[idx];
    if (member?.photo) {
      const fp = path.join(ROOT, member.photo);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      member.photo = '';
      writeContent(c);
    }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ═══════════════════════════════════════════
//  GALLERY
// ═══════════════════════════════════════════
app.get('/api/gallery', requireAuth, (req,res) => res.json(readContent().gallery||[]));

app.post('/api/gallery/upload', requireAuth, csrfProtect, upload.single('image'), (req,res) => {
  try {
    const c    = readContent();
    const item = { id:'g'+Date.now(), src:'images/gallery/'+req.file.filename, title:req.body.title||'New Project', tag:req.body.tag||'Design', category:req.body.category||'interior' };
    (c.gallery = c.gallery||[]).push(item);
    writeContent(c);
    logActivity('Uploaded image: '+req.file.filename, req.session.user);
    res.json({ success:true, item });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/api/gallery/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    const i = (c.gallery||[]).findIndex(g=>g.id===req.params.id);
    if (i===-1) return res.status(404).json({ error:'Not found' });
    c.gallery[i] = { ...c.gallery[i], ...req.body };
    writeContent(c);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/gallery/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c    = readContent();
    const item = (c.gallery||[]).find(g=>g.id===req.params.id);
    if (!item) return res.status(404).json({ error:'Not found' });
    if (item.src && !/g\d{2}\.(jpg|webp|jpeg|png)/.test(item.src)) {
      const fp = path.join(ROOT, item.src);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    c.gallery = c.gallery.filter(g=>g.id!==req.params.id);
    writeContent(c);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/gallery/reorder', requireAuth, csrfProtect, (req,res) => {
  try {
    const c   = readContent();
    c.gallery = req.body.order.map(id=>c.gallery.find(g=>g.id===id)).filter(Boolean);
    writeContent(c);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ═══════════════════════════════════════════
//  TESTIMONIALS
// ═══════════════════════════════════════════
app.get('/api/testimonials',     requireAuth, (req,res) => res.json(readContent().testimonials||[]));

app.post('/api/testimonials',    requireAuth, csrfProtect, (req,res) => {
  try {
    const c    = readContent();
    const item = { id:'t'+Date.now(), name:'', role:'', text:'', rating:5, project:'', date:new Date().toISOString().slice(0,7), ...req.body };
    (c.testimonials = c.testimonials||[]).push(item);
    writeContent(c);
    logActivity('Added testimonial from '+item.name, req.session.user);
    res.json({ success:true, item });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/api/testimonials/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    const i = (c.testimonials||[]).findIndex(t=>t.id===req.params.id);
    if (i===-1) return res.status(404).json({ error:'Not found' });
    c.testimonials[i] = { ...c.testimonials[i], ...req.body };
    writeContent(c);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/testimonials/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    c.testimonials = (c.testimonials||[]).filter(t=>t.id!==req.params.id);
    writeContent(c);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ═══════════════════════════════════════════
//  BLOG / NEWS
// ═══════════════════════════════════════════
app.get('/api/blog',     requireAuth, (req,res) => res.json(readContent().blog||[]));

app.post('/api/blog',    requireAuth, csrfProtect, (req,res) => {
  try {
    const c    = readContent();
    const post = { id:'b'+Date.now(), title:'', excerpt:'', content:'', image:'', status:'draft', date:new Date().toISOString().slice(0,10), tags:'', ...req.body };
    (c.blog = c.blog||[]).unshift(post);
    writeContent(c);
    logActivity('Created blog post: '+post.title, req.session.user);
    res.json({ success:true, post });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/api/blog/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c = readContent();
    const i = (c.blog||[]).findIndex(p=>p.id===req.params.id);
    if (i===-1) return res.status(404).json({ error:'Not found' });
    c.blog[i] = { ...c.blog[i], ...req.body };
    writeContent(c);
    logActivity('Updated post: '+c.blog[i].title, req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/blog/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const c    = readContent();
    const post = (c.blog||[]).find(p=>p.id===req.params.id);
    c.blog     = (c.blog||[]).filter(p=>p.id!==req.params.id);
    writeContent(c);
    logActivity('Deleted post: '+(post?.title||req.params.id), req.session.user);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ═══════════════════════════════════════════
//  ENQUIRIES  (public POST — no auth needed)
// ═══════════════════════════════════════════
app.get('/api/enquiries', requireAuth, (req,res) => res.json(readJSON(ENQUIRY_FILE,[])));

app.post('/api/enquiries', enquiryLimiter, (req,res) => {
  try {
    const { name, email, phone, service, budget, message } = req.body;
    // Basic validation
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
      return res.status(400).json({ error: 'Valid name is required (2–100 characters).' });
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ error: 'Valid email address is required.' });
    if (phone && (typeof phone !== 'string' || phone.trim().length > 20))
      return res.status(400).json({ error: 'Phone number too long.' });
    if (message && typeof message === 'string' && message.trim().length > 2000)
      return res.status(400).json({ error: 'Message must be under 2000 characters.' });

    const safe = {
      name:    name.trim().slice(0,100),
      email:   email.trim().toLowerCase().slice(0,200),
      phone:   (phone||'').toString().trim().slice(0,20),
      service: (service||'').toString().trim().slice(0,100),
      budget:  (budget||'').toString().trim().slice(0,50),
      message: (message||'').toString().trim().slice(0,2000),
    };
    const list = readJSON(ENQUIRY_FILE,[]);
    list.unshift({ id:'e'+Date.now(), ...safe, status:'new', date:new Date().toISOString() });
    writeJSON(ENQUIRY_FILE, list);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/enquiries/:id',  requireAuth, csrfProtect, (req,res) => {
  try {
    const list = readJSON(ENQUIRY_FILE,[]);
    const i    = list.findIndex(e=>e.id===req.params.id);
    if (i===-1) return res.status(404).json({ error:'Not found' });
    list[i] = { ...list[i], ...req.body };
    writeJSON(ENQUIRY_FILE, list);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/enquiries/:id', requireAuth, csrfProtect, (req,res) => {
  try {
    const list = readJSON(ENQUIRY_FILE,[]).filter(e=>e.id!==req.params.id);
    writeJSON(ENQUIRY_FILE, list);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ═══════════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════════
app.get('/api/activity', requireAuth, (req,res) => res.json(readJSON(ACTIVITY_FILE,[]).slice(0,50)));

// ═══════════════════════════════════════════
//  MEDIA LIBRARY
// ═══════════════════════════════════════════
app.get('/api/media', requireAuth, (req,res) => {
  const dirs  = [path.join(ROOT,'images','gallery'), path.join(ROOT,'images','brands')];
  const files = [];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      if (!/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)) return;
      const stat = fs.statSync(path.join(dir,f));
      files.push({ name:f, src:`images/${path.basename(dir)}/${f}`, size:Math.round(stat.size/1024), folder:path.basename(dir) });
    });
  });
  res.json(files);
});

// ═══════════════════════════════════════════
//  FONT SETTINGS API
// ═══════════════════════════════════════════
app.get('/api/font-settings', requireAuth, (req, res) => {
  const cfg = getConfig();
  res.json({
    fontDisplay: VALID_FONTS.has(cfg.fontDisplay) ? cfg.fontDisplay : 'Cormorant',
    fontSans:    VALID_FONTS.has(cfg.fontSans)    ? cfg.fontSans    : 'Raleway',
    fontBody:    VALID_FONTS.has(cfg.fontBody)    ? cfg.fontBody    : 'Jost',
    fontSize:    Math.min(Math.max(parseInt(cfg.fontSize) || 16, 12), 24),
  });
});

app.patch('/api/font-settings', requireAuth, csrfProtect, (req, res) => {
  try {
    const cfg = getConfig();
    if (VALID_FONTS.has(req.body.fontDisplay)) cfg.fontDisplay = req.body.fontDisplay;
    if (VALID_FONTS.has(req.body.fontSans))    cfg.fontSans    = req.body.fontSans;
    if (VALID_FONTS.has(req.body.fontBody))    cfg.fontBody    = req.body.fontBody;
    if (req.body.fontSize) cfg.fontSize = Math.min(Math.max(parseInt(req.body.fontSize) || 16, 12), 24);
    saveConfig(cfg);
    logActivity('Updated typography settings', req.session.user);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════
app.get('/api/stats', requireAuth, (req,res) => {
  const c       = readContent();
  const gallDir = path.join(ROOT,'images','gallery');
  const images  = fs.existsSync(gallDir) ? fs.readdirSync(gallDir).filter(f=>/\.(jpg|jpeg|png|webp)$/i.test(f)).length : 0;
  const enqs    = readJSON(ENQUIRY_FILE,[]);
  res.json({
    pages:            8,
    gallery_items:    (c.gallery||[]).length,
    images,
    testimonials:     (c.testimonials||[]).length,
    blog_published:   (c.blog||[]).filter(p=>p.status==='published').length,
    blog_total:       (c.blog||[]).length,
    enquiries_new:    enqs.filter(e=>e.status==='new').length,
    enquiries_total:  enqs.length,
    brands:           28,
    last_updated:     (() => { try { return fs.statSync(CONTENT_FILE).mtime.toISOString(); } catch { return null; } })()
  });
});

// ═══════════════════════════════════════════
//  VISITOR ANALYTICS
// ═══════════════════════════════════════════

function maskIP(ip) {
  if (!ip) return 'anon';
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1] + '.0';
  if (ip.includes(':')) {
    const parts = ip.replace(/^::ffff:/, '').split(':');
    return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
  }
  return 'anon';
}

function isPrivateIP(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '');
  return clean === '::1' || clean === '127.0.0.1' ||
    /^10\./.test(clean) || /^192\.168\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean) || clean === 'localhost';
}

async function geoIP(ip) {
  if (isPrivateIP(ip)) {
    return { country: 'Local Network', countryCode: 'LH', region: 'Dev', city: 'Localhost', lat: 0, lon: 0, isp: 'Local' };
  }
  const now = Date.now();
  const hit = GEO_CACHE.get(ip);
  if (hit && now - hit.ts < GEO_TTL) return hit.data;

  const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org&lang=en`;

  // Use native fetch (Node 18+) or http fallback
  let raw = null;
  try {
    if (typeof fetch !== 'undefined') {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 3000);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        raw = await r.json();
      } finally { clearTimeout(tid); }
    } else {
      raw = await new Promise((resolve) => {
        const http = require('http');
        const req  = http.get(url, { timeout: 3000 }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
    }
  } catch (_) { raw = null; }

  if (raw && raw.status === 'success') {
    const data = {
      country: raw.country || 'Unknown', countryCode: raw.countryCode || '??',
      region:  raw.regionName || '',     city: raw.city || 'Unknown',
      lat:     raw.lat || 0,             lon:  raw.lon || 0,
      isp:     raw.isp || raw.org || '',
    };
    GEO_CACHE.set(ip, { data, ts: now });
    return data;
  }
  return { country: 'Unknown', countryCode: '??', region: '', city: 'Unknown', lat: 0, lon: 0, isp: '' };
}

function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', device: 'Desktop', os: 'Unknown' };
  let browser = 'Other', device = 'Desktop', os = 'Unknown';
  if (/Windows/.test(ua))                              os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua))              os = 'macOS';
  else if (/Android/.test(ua))                         os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua))                 os = 'iOS';
  else if (/Linux/.test(ua))                           os = 'Linux';
  if (/Edg\//.test(ua))                                browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua))                     browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua))                       browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/.test(ua))                    browser = 'IE';
  if (/iPad/.test(ua))                                 device = 'Tablet';
  else if (/Mobile|Android/.test(ua))                  device = 'Mobile';
  return { browser, device, os };
}

async function sendTelegramAlert(visitor, token, chatId) {
  const ist  = new Date(visitor.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const text = `🌐 SVIE — New Visitor\n📍 ${visitor.city}, ${visitor.country}\n📄 ${visitor.page}\n📱 ${visitor.device} / ${visitor.browser}\n🕐 ${ist} IST`;

  if (typeof fetch !== 'undefined') {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text }),
        signal:  ctrl.signal,
      });
    } finally { clearTimeout(tid); }
  } else {
    const https = require('https');
    const body  = JSON.stringify({ chat_id: chatId, text });
    await new Promise(resolve => {
      const r = https.request({
        hostname: 'api.telegram.org', method: 'POST',
        path:     `/bot${token}/sendMessage`,
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  5000,
      }, res => { res.on('data', () => {}); res.on('end', resolve); });
      r.on('error', resolve);
      r.on('timeout', () => { r.destroy(); resolve(); });
      r.write(body); r.end();
    });
  }
}

async function sendEmailAlert(visitor, cfg) {
  const ist = new Date(visitor.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  try {
    const nodemailer  = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.emailHost || 'smtp.gmail.com',
      port: Number(cfg.emailPort) || 587,
      secure: false,
      auth: { user: cfg.emailFrom, pass: cfg.emailPass },
    });
    await transporter.sendMail({
      from:    `"SVIE Visitor Alert" <${cfg.emailFrom}>`,
      to:      cfg.emailTo,
      subject: `New Visitor — ${visitor.city}, ${visitor.country}`,
      text:    `New visitor on SVIE website\n\nLocation: ${visitor.city}, ${visitor.region}, ${visitor.country}\nPage: ${visitor.page}\nDevice: ${visitor.device} / ${visitor.browser}\nTime: ${ist} IST`,
    });
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') console.warn('[Visitor] nodemailer not installed — run: npm install nodemailer');
    else console.error('[Visitor Email]', e.message);
  }
}

async function sendNotification(visitor) {
  const cfg = getConfig();
  if (cfg.telegramEnabled && cfg.telegramToken && cfg.telegramChatId) {
    sendTelegramAlert(visitor, cfg.telegramToken, cfg.telegramChatId).catch(e => console.error('[Visitor Telegram]', e.message));
  }
  if (cfg.emailEnabled && cfg.emailFrom && cfg.emailPass && cfg.emailTo) {
    sendEmailAlert(visitor, cfg).catch(e => console.error('[Visitor Email]', e.message));
  }
}

const visitorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  skipFailedRequests: true,
});

// ── POST /api/visitor-ping — public, called from frontend ──
app.post('/api/visitor-ping', visitorLimiter, async (req, res) => {
  try {
    const { page, referrer, consent } = req.body;
    if (!consent) return res.json({ ok: false });

    const rawIP = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) ||
                  (req.socket?.remoteAddress || '');
    const { browser, device, os } = parseUA(req.headers['user-agent'] || '');
    const geo = await geoIP(rawIP);
    const isNewSession = !req.session.svie_visit_counted;
    req.session.svie_visit_counted = true;

    const record = {
      id:           'v' + Date.now() + Math.random().toString(36).slice(2, 5),
      timestamp:    new Date().toISOString(),
      ip_masked:    maskIP(rawIP),
      ...geo,
      page:         String(page || '/').slice(0, 200),
      referrer:     String(referrer || '').slice(0, 500),
      browser, device, os,
      isNewSession,
    };

    const list = readJSON(VISITORS_FILE, []);
    list.unshift(record);
    writeJSON(VISITORS_FILE, list.slice(0, 15000));

    const cfg = getConfig();
    if (isNewSession && (cfg.telegramEnabled || cfg.emailEnabled)) {
      sendNotification(record).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/visitors — paginated raw records (auth required) ──
app.get('/api/visitors', requireAuth, (req, res) => {
  const days  = Math.min(parseInt(req.query.days) || 30, 365);
  const pg    = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const all   = readJSON(VISITORS_FILE, []).filter(v => !cutoff || v.timestamp >= cutoff);
  const start = (pg - 1) * limit;
  res.json({ total: all.length, page: pg, pages: Math.ceil(all.length / limit), data: all.slice(start, start + limit) });
});

// ── GET /api/visitor-stats — aggregated analytics ──
app.get('/api/visitor-stats', requireAuth, (req, res) => {
  const days   = Math.min(parseInt(req.query.days) || 30, 400);
  const cutoff = days < 400 ? new Date(Date.now() - days * 86400000).toISOString() : '';
  const all    = readJSON(VISITORS_FILE, []).filter(v => !cutoff || v.timestamp >= cutoff);

  const byCountry = {}, byCity = {}, byDate = {}, byPage = {}, byDevice = {}, byBrowser = {}, bySrc = {}, mapPts = {};
  let newSessions = 0;

  all.forEach(v => {
    byCountry[v.country || 'Unknown'] = (byCountry[v.country || 'Unknown'] || 0) + 1;
    const ck = `${v.city}||${v.region}||${v.country}||${v.countryCode}||${v.lat}||${v.lon}`;
    byCity[ck] = (byCity[ck] || 0) + 1;
    const d = (v.timestamp || '').slice(0, 10);
    if (d) byDate[d] = (byDate[d] || 0) + 1;
    byPage[v.page || '/'] = (byPage[v.page || '/'] || 0) + 1;
    byDevice[v.device || 'Unknown'] = (byDevice[v.device || 'Unknown'] || 0) + 1;
    byBrowser[v.browser || 'Unknown'] = (byBrowser[v.browser || 'Unknown'] || 0) + 1;
    const ref = v.referrer || '';
    let src = 'Direct';
    if (/google\.|bing\.|yahoo\.|duckduckgo\./.test(ref)) src = 'Search';
    else if (/facebook\.|instagram\.|twitter\.|x\.com|linkedin\.|whatsapp\.|t\.co/.test(ref)) src = 'Social';
    else if (ref && !/svie5\.com|localhost/.test(ref)) src = 'Referral';
    bySrc[src] = (bySrc[src] || 0) + 1;
    if (v.isNewSession) newSessions++;
    const latR = Math.round((v.lat || 0) * 10) / 10;
    const lonR = Math.round((v.lon || 0) * 10) / 10;
    const mk = `${latR}|${lonR}`;
    if (!mapPts[mk]) mapPts[mk] = { lat: v.lat, lon: v.lon, city: v.city, country: v.country, countryCode: v.countryCode, count: 0 };
    mapPts[mk].count++;
  });

  const dateRange = {};
  const actualDays = Math.min(days, 90);
  for (let i = actualDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dateRange[d] = byDate[d] || 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const cfg   = getConfig();

  res.json({
    total:      all.length,
    newSessions,
    countries:  Object.keys(byCountry).filter(c => c !== 'Unknown' && c !== 'Local Network').length,
    today:      byDate[today] || 0,
    byCountry:  Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count })),
    byCity:     Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, count]) => {
      const [city, region, country, countryCode, lat, lon] = k.split('||');
      return { city, region, country, countryCode, lat: parseFloat(lat) || 0, lon: parseFloat(lon) || 0, count };
    }),
    byDate:     Object.entries(dateRange).map(([date, count]) => ({ date, count })),
    byPage:     Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([page, count]) => ({ page, count })),
    byDevice:   Object.entries(byDevice).map(([name, count]) => ({ name, count })),
    byBrowser:  Object.entries(byBrowser).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count })),
    bySource:   Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    mapPoints:  Object.values(mapPts),
    telegramEnabled: !!cfg.telegramEnabled,
    telegramToken:   cfg.telegramToken  || '',
    telegramChatId:  cfg.telegramChatId || '',
    emailEnabled:    !!cfg.emailEnabled,
    emailTo:         cfg.emailTo   || 'svie.blr5@gmail.com',
    emailFrom:       cfg.emailFrom || '',
    emailHost:       cfg.emailHost || 'smtp.gmail.com',
    emailPort:       cfg.emailPort || 587,
  });
});

// ── PATCH /api/visitor-settings ──
app.patch('/api/visitor-settings', requireAuth, csrfProtect, (req, res) => {
  try {
    const cfg = getConfig();
    const b   = req.body;
    const str = (k, max) => b[k] !== undefined ? String(b[k]).slice(0, max) : undefined;
    if (b.telegramEnabled !== undefined) cfg.telegramEnabled = !!b.telegramEnabled;
    if (str('telegramToken',  200) !== undefined) cfg.telegramToken  = str('telegramToken',  200);
    if (str('telegramChatId',  50) !== undefined) cfg.telegramChatId = str('telegramChatId',  50);
    if (b.emailEnabled    !== undefined) cfg.emailEnabled    = !!b.emailEnabled;
    if (str('emailTo',   200) !== undefined) cfg.emailTo   = str('emailTo',   200);
    if (str('emailFrom', 200) !== undefined) cfg.emailFrom = str('emailFrom', 200);
    if (str('emailPass', 200) !== undefined) cfg.emailPass = str('emailPass', 200);
    if (str('emailHost', 100) !== undefined) cfg.emailHost = str('emailHost', 100);
    if (b.emailPort !== undefined) cfg.emailPort = parseInt(b.emailPort) || 587;
    saveConfig(cfg);
    logActivity('Updated visitor notification settings', req.session.user);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/visitor-notify-test ──
app.post('/api/visitor-notify-test', requireAuth, csrfProtect, async (req, res) => {
  try {
    await sendNotification({
      timestamp: new Date().toISOString(),
      city: 'Test City', region: 'Test State', country: 'India', countryCode: 'IN',
      page: '/test', device: 'Desktop', browser: 'Chrome',
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/visitors — wipe visitor data ──
app.delete('/api/visitors', requireAuth, csrfProtect, (req, res) => {
  try {
    writeJSON(VISITORS_FILE, []);
    GEO_CACHE.clear();
    logActivity('Cleared all visitor analytics data', req.session.user);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/visitor-export — CSV download ──
app.get('/api/visitor-export', requireAuth, (req, res) => {
  const days   = Math.min(parseInt(req.query.days) || 30, 400);
  const cutoff = days < 400 ? new Date(Date.now() - days * 86400000).toISOString() : '';
  const all    = readJSON(VISITORS_FILE, []).filter(v => !cutoff || v.timestamp >= cutoff);
  const hdr    = ['Timestamp','Country','Region','City','Browser','Device','OS','Page','Referrer','New Session'];
  const rows   = all.map(v => [
    v.timestamp, v.country, v.region, v.city, v.browser, v.device, v.os,
    v.page, v.referrer, v.isNewSession ? 'Yes' : 'No',
  ].map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(','));
  const csv = [hdr.join(','), ...rows].join('\n');
  const fname = `svie-visitors-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
  logActivity('Exported visitor analytics CSV', req.session.user);
});

// ═══════════════════════════════════════════
//  ADMIN PAGE ROUTES
// ═══════════════════════════════════════════
app.get('/admin',                    (req,res) => res.sendFile(path.join(ROOT,'admin','index.html')));
app.get('/admin/dashboard',          (req,res) => res.sendFile(path.join(ROOT,'admin','dashboard.html')));
app.get('/admin/visitor-dashboard',  (req,res) => res.sendFile(path.join(ROOT,'admin','visitor-dashboard.html')));
app.get('/admin/visitor-guide',      (req,res) => res.sendFile(path.join(ROOT,'admin','visitor-dashboard-guide.html')));

// ═══════════════════════════════════════════
//  START
// ═══════════════════════════════════════════
app.listen(PORT, async () => {
  // Auto-migrate plaintext password to bcrypt on first start
  const cfg = getConfig();
  if (!cfg.passwordHash && cfg.password) {
    const hash = await bcrypt.hash(cfg.password, SALT_ROUNDS);
    cfg.passwordHash = hash;
    delete cfg.password;
    saveConfig(cfg);
    console.log('  ✓ Password auto-migrated to bcrypt hash');
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║      SVIE CMS — Server Running       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Website : http://localhost:${PORT}       ║`);
  console.log(`║  Admin   : http://localhost:${PORT}/admin ║`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Username : admin                    ║');
  console.log('║  Password : (stored as bcrypt hash)  ║');
  console.log('╚══════════════════════════════════════╝\n');
});
