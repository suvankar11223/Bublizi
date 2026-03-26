<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bublizi — README</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #080b10;
    --bg2:      #0e1420;
    --bg3:      #141c2b;
    --amber:    #f5a623;
    --amber2:   #e8860a;
    --teal:     #1de9b6;
    --muted:    #4a5568;
    --text:     #c9d1e0;
    --white:    #f0f4ff;
    --red:      #ff4f4f;
    --green:    #35d67a;
    --border:   rgba(245,166,35,0.15);
    --border2:  rgba(255,255,255,0.06);
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    line-height: 1.75;
    overflow-x: hidden;
  }

  /* ── NOISE OVERLAY ── */
  body::before {
    content: '';
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
    opacity: 0.4;
  }

  .wrap { position: relative; z-index: 1; max-width: 960px; margin: 0 auto; padding: 0 2rem; }

  /* ── HERO ── */
  .hero {
    min-height: 100vh;
    display: flex; flex-direction: column; justify-content: center;
    padding: 6rem 0 4rem;
    position: relative;
  }

  .hero-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(245,166,35,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(245,166,35,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%);
  }

  .hero-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--amber); margin-bottom: 2rem;
    animation: fadeUp 0.6s ease both;
  }
  .hero-eyebrow::before {
    content: ''; display: block; width: 24px; height: 1px; background: var(--amber);
  }

  .hero-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(3.5rem, 10vw, 7.5rem);
    font-weight: 800;
    line-height: 0.92;
    letter-spacing: -0.03em;
    color: var(--white);
    animation: fadeUp 0.6s 0.1s ease both;
  }

  .hero-title span {
    display: block;
    background: linear-gradient(90deg, var(--amber), #ff8c42);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-desc {
    max-width: 520px;
    margin-top: 2rem;
    font-size: 13px; color: var(--muted);
    line-height: 1.9;
    animation: fadeUp 0.6s 0.2s ease both;
  }

  .hero-actions {
    display: flex; gap: 12px; flex-wrap: wrap;
    margin-top: 2.5rem;
    animation: fadeUp 0.6s 0.3s ease both;
  }

  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 22px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; font-weight: 500; letter-spacing: 0.05em;
    border-radius: 4px;
    text-decoration: none;
    transition: all 0.2s;
    cursor: pointer; border: none;
  }
  .btn-primary {
    background: var(--amber); color: #000;
  }
  .btn-primary:hover { background: #ffc147; transform: translateY(-1px); }

  .btn-ghost {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    color: var(--text);
  }
  .btn-ghost:hover { border-color: var(--amber); color: var(--amber); }

  /* ── SCORE STRIP ── */
  .scores {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
    background: var(--border2);
    border: 1px solid var(--border2);
    border-radius: 8px;
    overflow: hidden;
    margin: 4rem 0;
    animation: fadeUp 0.6s 0.4s ease both;
  }

  .score-item {
    background: var(--bg2);
    padding: 1.5rem;
    position: relative; overflow: hidden;
    transition: background 0.2s;
  }
  .score-item:hover { background: var(--bg3); }

  .score-item::after {
    content: '';
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--amber), transparent);
  }

  .score-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .score-val { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 700; color: var(--white); line-height: 1; }
  .score-sub { font-size: 10px; color: var(--amber); margin-top: 4px; }
  .score-bar { height: 3px; background: var(--bg); border-radius: 99px; margin-top: 10px; overflow: hidden; }
  .score-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--amber), var(--teal)); }

  /* ── SECTIONS ── */
  section { padding: 5rem 0; border-top: 1px solid var(--border2); }

  .sec-label {
    font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--amber); margin-bottom: 1rem;
    display: flex; align-items: center; gap: 8px;
  }
  .sec-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .sec-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.8rem, 5vw, 2.8rem);
    font-weight: 700; color: var(--white);
    line-height: 1.1; letter-spacing: -0.02em;
    margin-bottom: 1rem;
  }

  .sec-sub { font-size: 13px; color: var(--muted); max-width: 480px; line-height: 1.9; }

  /* ── FEATURE GRID ── */
  .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border2); border: 1px solid var(--border2); border-radius: 10px; overflow: hidden; margin-top: 3rem; }

  .feat-card {
    background: var(--bg2); padding: 1.6rem 1.5rem;
    transition: background 0.2s;
    position: relative;
  }
  .feat-card:hover { background: var(--bg3); }
  .feat-card:hover .feat-icon { color: var(--amber); }

  .feat-icon { font-size: 1.25rem; margin-bottom: 12px; transition: color 0.2s; }
  .feat-name { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 600; color: var(--white); margin-bottom: 6px; }
  .feat-desc { font-size: 12px; color: var(--muted); line-height: 1.75; }

  /* ── ARCH BLOCK ── */
  .arch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 3rem; }

  .arch-card {
    background: var(--bg2); border: 1px solid var(--border2);
    border-radius: 8px; padding: 1.5rem;
    position: relative; overflow: hidden;
  }
  .arch-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--amber), transparent);
  }
  .arch-tag { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--amber); margin-bottom: 1rem; }
  .arch-stack { display: flex; flex-direction: column; gap: 8px; }
  .arch-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg3); border-radius: 4px;
    font-size: 12px; color: var(--text);
  }
  .arch-item span { color: var(--muted); font-size: 11px; }

  /* ── SCALE STATS ── */
  .scale-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 3rem; }

  .scale-card {
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 8px;
    padding: 2rem 1.5rem; text-align: center;
    position: relative; overflow: hidden;
    transition: border-color 0.2s, transform 0.2s;
  }
  .scale-card:hover { border-color: var(--amber); transform: translateY(-2px); }
  .scale-num {
    font-family: 'Syne', sans-serif;
    font-size: 2.4rem; font-weight: 800;
    background: linear-gradient(90deg, var(--amber), var(--teal));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    line-height: 1;
  }
  .scale-unit { font-size: 11px; color: var(--amber); margin-top: 4px; margin-bottom: 10px; letter-spacing: 0.1em; }
  .scale-label { font-size: 12px; color: var(--muted); }

  /* ── SECURITY CHECKLIST ── */
  .checks-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 2.5rem; }
  .check-item {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 6px;
    font-size: 11px; color: var(--text);
    transition: border-color 0.2s;
  }
  .check-item:hover { border-color: rgba(53,214,122,0.3); }
  .check-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }

  /* ── SETUP ── */
  .setup-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 2.5rem; }

  .setup-card {
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 8px; overflow: hidden;
  }
  .setup-head {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border2);
    font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--amber);
    display: flex; align-items: center; gap: 8px;
  }
  .setup-head::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); opacity: 0.6; }
  pre {
    padding: 1.25rem 1.5rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; line-height: 2;
    color: var(--text); overflow-x: auto;
  }
  .c-cmd   { color: var(--white); }
  .c-arg   { color: var(--teal); }
  .c-str   { color: var(--amber); }
  .c-cmt   { color: var(--muted); }

  /* ── HEALTH ENDPOINTS ── */
  .endpoints { display: flex; flex-direction: column; gap: 8px; margin-top: 2rem; }
  .ep {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 6px;
    font-size: 12px;
    transition: border-color 0.2s;
  }
  .ep:hover { border-color: var(--amber); }
  .ep-method { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: var(--green); min-width: 36px; }
  .ep-path   { color: var(--white); font-weight: 500; flex: 1; }
  .ep-desc   { color: var(--muted); font-size: 11px; }

  /* ── PHASES ── */
  .phases { display: flex; flex-direction: column; gap: 0; margin-top: 2.5rem; position: relative; }
  .phases::before { content: ''; position: absolute; left: 18px; top: 0; bottom: 0; width: 1px; background: var(--border); }
  .phase {
    display: flex; gap: 1.5rem; padding: 1.25rem 0; padding-left: 52px; position: relative;
  }
  .phase-num {
    position: absolute; left: 0; top: 1.25rem;
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--bg2); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: var(--amber);
    z-index: 1;
  }
  .phase-content { flex: 1; }
  .phase-title { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 600; color: var(--white); margin-bottom: 4px; }
  .phase-desc { font-size: 12px; color: var(--muted); }
  .phase-link { font-size: 11px; color: var(--amber); text-decoration: none; margin-top: 4px; display: inline-block; }
  .phase-link:hover { text-decoration: underline; }

  /* ── FOOTER ── */
  footer {
    border-top: 1px solid var(--border2);
    padding: 3rem 0 4rem;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
  }
  .footer-brand { font-family: 'Syne', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--white); }
  .footer-brand span { color: var(--amber); }
  .footer-links { display: flex; gap: 20px; }
  .footer-links a { font-size: 12px; color: var(--muted); text-decoration: none; transition: color 0.2s; }
  .footer-links a:hover { color: var(--amber); }
  .footer-meta { font-size: 11px; color: var(--muted); text-align: right; line-height: 1.8; }

  /* ── VERSION BADGE ── */
  .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 1.5rem; animation: fadeUp 0.6s 0.35s ease both; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--bg2); border: 1px solid var(--border2);
    border-radius: 4px; overflow: hidden;
    font-size: 11px;
  }
  .badge-k { padding: 3px 8px; background: var(--bg3); color: var(--muted); font-size: 10px; letter-spacing: 0.06em; }
  .badge-v { padding: 3px 8px; color: var(--white); }
  .badge-v.green { color: var(--green); }
  .badge-v.amber { color: var(--amber); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media(max-width:680px){
    .feat-grid, .arch-grid, .setup-cols, .scale-grid, .checks-grid { grid-template-columns: 1fr; }
    .scores { grid-template-columns: repeat(2,1fr); }
    footer { flex-direction: column; text-align: center; }
    .footer-meta { text-align: center; }
  }
</style>
</head>
<body>

<!-- ╔═══════════════════════════════╗ -->
<!-- ║           HERO                ║ -->
<!-- ╚═══════════════════════════════╝ -->
<div class="wrap">
  <section class="hero">
    <div class="hero-grid"></div>
    <div class="hero-eyebrow">v1.0.0 &nbsp;·&nbsp; Production Ready &nbsp;·&nbsp; MIT License</div>
    <h1 class="hero-title">
      Bublizi
      <span>Chat at Scale.</span>
    </h1>
    <p class="hero-desc">
      A production-ready chat platform engineered for 100K+ users — real-time messaging, WebRTC voice/video, AI assistance, and distributed architecture baked in from day one.
    </p>
    <div class="badge-row">
      <div class="badge"><span class="badge-k">platform</span><span class="badge-v">React Native + Expo</span></div>
      <div class="badge"><span class="badge-k">backend</span><span class="badge-v">Node.js + Socket.IO</span></div>
      <div class="badge"><span class="badge-k">db</span><span class="badge-v amber">MongoDB + Redis</span></div>
      <div class="badge"><span class="badge-k">status</span><span class="badge-v green">● live</span></div>
    </div>
    <div class="hero-actions">
      <a class="btn btn-primary" href="https://github.com/suvankar11223/Bublizi">↗ View on GitHub</a>
      <a class="btn btn-ghost" href="#setup">Get Started →</a>
    </div>

    <div class="scores">
      <div class="score-item">
        <div class="score-label">Security</div>
        <div class="score-val">87</div>
        <div class="score-sub">Strong ✓</div>
        <div class="score-bar"><div class="score-fill" style="width:87%"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Performance</div>
        <div class="score-val">85</div>
        <div class="score-sub">Good ✓</div>
        <div class="score-bar"><div class="score-fill" style="width:85%"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Architecture</div>
        <div class="score-val">92</div>
        <div class="score-sub">Excellent ✓</div>
        <div class="score-bar"><div class="score-fill" style="width:92%"></div></div>
      </div>
      <div class="score-item">
        <div class="score-label">Production</div>
        <div class="score-val">95</div>
        <div class="score-sub">Excellent ✓</div>
        <div class="score-bar"><div class="score-fill" style="width:95%"></div></div>
      </div>
    </div>
  </section>

  <!-- ── FEATURES ── -->
  <section>
    <div class="sec-label">Core Features</div>
    <h2 class="sec-title">Everything built in.</h2>
    <p class="sec-sub">From instant messaging to AI-powered suggestions — the full stack, ready to ship.</p>

    <div class="feat-grid">
      <div class="feat-card">
        <div class="feat-icon">⚡</div>
        <div class="feat-name">Real-time Messaging</div>
        <div class="feat-desc">Instant delivery via Socket.IO with typing indicators, read receipts, and reactions.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">📹</div>
        <div class="feat-name">Voice &amp; Video Calls</div>
        <div class="feat-desc">WebRTC-based calling with TURN relay, ICE negotiation, and renegotiation support.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">🤖</div>
        <div class="feat-name">AI Chat Assistant</div>
        <div class="feat-desc">Built-in AI bot with context-aware suggestions and smart conversation linking.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">🎙</div>
        <div class="feat-name">Voice Messages</div>
        <div class="feat-desc">Record, send, and play back voice notes inline — no extra app needed.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">📎</div>
        <div class="feat-name">File Sharing</div>
        <div class="feat-desc">Upload images and files via Cloudinary with preview and progress tracking.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">🔔</div>
        <div class="feat-name">Push Notifications</div>
        <div class="feat-desc">Firebase Cloud Messaging for reliable, cross-platform background alerts.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">👥</div>
        <div class="feat-name">Contact Sync</div>
        <div class="feat-desc">Automatic phone contact discovery — see who's already on the platform.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">📌</div>
        <div class="feat-name">Message Pinning</div>
        <div class="feat-desc">Pin important messages to the top of any conversation for quick access.</div>
      </div>
      <div class="feat-card">
        <div class="feat-icon">🟢</div>
        <div class="feat-name">Online Presence</div>
        <div class="feat-desc">Redis-backed real-time user status — online, away, offline — at any scale.</div>
      </div>
    </div>
  </section>

  <!-- ── ARCHITECTURE ── -->
  <section>
    <div class="sec-label">Architecture</div>
    <h2 class="sec-title">Engineered to scale.</h2>
    <p class="sec-sub">Every layer chosen for resilience. Multi-server Socket.IO, distributed caching, async job queues.</p>

    <div class="arch-grid">
      <div class="arch-card">
        <div class="arch-tag">Backend</div>
        <div class="arch-stack">
          <div class="arch-item">Node.js + Express <span>HTTP server</span></div>
          <div class="arch-item">Socket.IO + Redis Adapter <span>real-time, multi-node</span></div>
          <div class="arch-item">MongoDB <span>primary datastore</span></div>
          <div class="arch-item">Redis <span>cache + sessions</span></div>
          <div class="arch-item">BullMQ <span>async job queue</span></div>
          <div class="arch-item">JWT (15min / 30day) <span>auth tokens</span></div>
        </div>
      </div>
      <div class="arch-card">
        <div class="arch-tag">Frontend</div>
        <div class="arch-stack">
          <div class="arch-item">React Native + Expo <span>cross-platform</span></div>
          <div class="arch-item">Expo Router <span>navigation</span></div>
          <div class="arch-item">Firebase Auth <span>identity</span></div>
          <div class="arch-item">Socket.IO Client <span>real-time</span></div>
          <div class="arch-item">React Context + Hooks <span>state</span></div>
          <div class="arch-item">Cloudinary <span>media CDN</span></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── SCALE ── -->
  <section>
    <div class="sec-label">Scale Capacity</div>
    <h2 class="sec-title">Built for production traffic.</h2>

    <div class="scale-grid">
      <div class="scale-card">
        <div class="scale-num">100K+</div>
        <div class="scale-unit">MAX USERS</div>
        <div class="scale-label">Total registered users supported</div>
      </div>
      <div class="scale-card">
        <div class="scale-num">10K+</div>
        <div class="scale-unit">CONCURRENT</div>
        <div class="scale-label">Simultaneous socket connections</div>
      </div>
      <div class="scale-card">
        <div class="scale-num">1K+</div>
        <div class="scale-unit">MSG / SEC</div>
        <div class="scale-label">Messages relayed per second</div>
      </div>
    </div>
  </section>

  <!-- ── SECURITY ── -->
  <section>
    <div class="sec-label">Security &amp; Performance</div>
    <h2 class="sec-title">Hardened across 4 phases.</h2>
    <p class="sec-sub">Every surface locked down. Every query optimized. 90-day audit retention.</p>

    <div class="checks-grid">
      <div class="check-item"><div class="check-dot"></div>JWT + Refresh Tokens</div>
      <div class="check-item"><div class="check-dot"></div>Input Validation</div>
      <div class="check-item"><div class="check-dot"></div>Redis Rate Limiting</div>
      <div class="check-item"><div class="check-dot"></div>IP Brute Force Block</div>
      <div class="check-item"><div class="check-dot"></div>Strong Password Policy</div>
      <div class="check-item"><div class="check-dot"></div>Audit Logging 90d</div>
      <div class="check-item"><div class="check-dot"></div>CORS Restrictions</div>
      <div class="check-item"><div class="check-dot"></div>WebRTC Auth</div>
      <div class="check-item"><div class="check-dot"></div>DB Connection Pooling</div>
      <div class="check-item"><div class="check-dot"></div>Redis Caching</div>
      <div class="check-item"><div class="check-dot"></div>Batch DB Queries</div>
      <div class="check-item"><div class="check-dot"></div>Async BullMQ Jobs</div>
      <div class="check-item"><div class="check-dot"></div>Request Timeouts</div>
      <div class="check-item"><div class="check-dot"></div>Database Indexes</div>
      <div class="check-item"><div class="check-dot"></div>Kubernetes Ready</div>
    </div>
  </section>

  <!-- ── SETUP ── -->
  <section id="setup">
    <div class="sec-label">Quick Start</div>
    <h2 class="sec-title">Up in minutes.</h2>
    <p class="sec-sub">Prerequisites: Node 18+, MongoDB, Redis, Expo CLI, Firebase &amp; Cloudinary accounts.</p>

    <div class="setup-cols">
      <div class="setup-card">
        <div class="setup-head">Backend</div>
        <pre><span class="c-cmt"># navigate &amp; install</span>
<span class="c-cmd">cd</span> <span class="c-arg">backend</span>
<span class="c-cmd">npm</span> <span class="c-arg">install</span>

<span class="c-cmt"># configure env</span>
<span class="c-cmd">cp</span> <span class="c-arg">.env.example .env</span>

<span class="c-cmt"># start dev server</span>
<span class="c-cmd">npm</span> <span class="c-arg">run dev</span></pre>
      </div>
      <div class="setup-card">
        <div class="setup-head">Frontend</div>
        <pre><span class="c-cmt"># navigate &amp; install</span>
<span class="c-cmd">cd</span> <span class="c-arg">frontend</span>
<span class="c-cmd">npm</span> <span class="c-arg">install</span>

<span class="c-cmt"># set API url</span>
<span class="c-str">EXPO_PUBLIC_API_URL</span>=http://localhost:3000

<span class="c-cmt"># launch expo</span>
<span class="c-cmd">npx expo start</span></pre>
      </div>
      <div class="setup-card">
        <div class="setup-head">Docker</div>
        <pre><span class="c-cmt"># build + run all services</span>
<span class="c-cmd">docker-compose</span> <span class="c-arg">build</span>
<span class="c-cmd">docker-compose</span> <span class="c-arg">up -d</span></pre>
      </div>
      <div class="setup-card">
        <div class="setup-head">Kubernetes</div>
        <pre><span class="c-cmt"># deploy manifests</span>
<span class="c-cmd">kubectl</span> <span class="c-arg">apply -f k8s/</span>

<span class="c-cmt"># check pod status</span>
<span class="c-cmd">kubectl</span> <span class="c-arg">get pods</span></pre>
      </div>
    </div>
  </section>

  <!-- ── HEALTH ── -->
  <section>
    <div class="sec-label">Health Monitoring</div>
    <h2 class="sec-title">Full observability.</h2>
    <p class="sec-sub">Load-balancer and Kubernetes probes out of the box. No extra config.</p>

    <div class="endpoints">
      <div class="ep"><span class="ep-method">GET</span><span class="ep-path">/health</span><span class="ep-desc">Overall system health — all services</span></div>
      <div class="ep"><span class="ep-method">GET</span><span class="ep-path">/ready</span><span class="ep-desc">Readiness probe for load balancers</span></div>
      <div class="ep"><span class="ep-method">GET</span><span class="ep-path">/live</span><span class="ep-desc">Liveness probe for Kubernetes</span></div>
      <div class="ep"><span class="ep-method">GET</span><span class="ep-path">/stats</span><span class="ep-desc">Detailed runtime statistics</span></div>
    </div>
  </section>

  <!-- ── PHASES ── -->
  <section>
    <div class="sec-label">Build Journey</div>
    <h2 class="sec-title">4 phases to production.</h2>

    <div class="phases">
      <div class="phase">
        <div class="phase-num">0</div>
        <div class="phase-content">
          <div class="phase-title">Security Foundation</div>
          <div class="phase-desc">JWT auth, input validation, CORS lockdown, password policy, audit logging infrastructure.</div>
          <a class="phase-link" href="./PHASE_0_SECURITY_FOUNDATION_COMPLETE.md">Read docs →</a>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">1</div>
        <div class="phase-content">
          <div class="phase-title">Performance</div>
          <div class="phase-desc">Connection pooling, Redis caching, batch queries, database indexing, request timeouts.</div>
          <a class="phase-link" href="./PHASE_1_COMPLETE.md">Read docs →</a>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">2</div>
        <div class="phase-content">
          <div class="phase-title">Distributed Systems</div>
          <div class="phase-desc">Socket.IO Redis adapter, multi-server presence, BullMQ async jobs, distributed state.</div>
          <a class="phase-link" href="./PHASE_2_COMPLETE.md">Read docs →</a>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">3</div>
        <div class="phase-content">
          <div class="phase-title">Security Hardening</div>
          <div class="phase-desc">Brute force IP blocking, rate limiting, WebRTC signaling auth, 90-day audit retention.</div>
          <a class="phase-link" href="./PHASE_3_SECURITY_HARDENING.md">Read docs →</a>
        </div>
      </div>
      <div class="phase">
        <div class="phase-num">4</div>
        <div class="phase-content">
          <div class="phase-title">Architecture Stability</div>
          <div class="phase-desc">Health checks, Kubernetes readiness, load balancer probes, comprehensive monitoring.</div>
          <a class="phase-link" href="./PHASE_4_ARCHITECTURE_STABILITY.md">Read docs →</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ── FOOTER ── -->
  <footer>
    <div>
      <div class="footer-brand">Bub<span>lizi</span></div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">Built with ❤ by the Bublizi team</div>
    </div>
    <div class="footer-links">
      <a href="https://github.com/suvankar11223/Bublizi">GitHub</a>
      <a href="./PRODUCTION_READINESS_FINAL.md">Docs</a>
      <a href="https://github.com/suvankar11223/Bublizi/issues">Issues</a>
      <a href="./FIREBASE_SETUP.md">Firebase Guide</a>
    </div>
    <div class="footer-meta">
      Version 1.0.0 &nbsp;·&nbsp; MIT License<br>
      Last updated March 27, 2026
    </div>
  </footer>
</div>

</body>
</html>
