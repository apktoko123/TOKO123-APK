/* =============================================================================
 *  TOKO123 — APK DEVICE TRACKER + PUSH NOTIFICATION
 *  Cloudflare Worker (backend + panel admin)
 *  by SirX
 *
 *  ENDPOINT:
 *   POST /api/register    -> APK daftar (device_id + fcm_token + info HP)
 *   POST /api/heartbeat   -> denyut, tandai online
 *   POST /api/token       -> update FCM token kalau berubah
 *   GET  /api/stats       -> angka dashboard
 *   GET  /api/devices     -> list device (admin)
 *   POST /api/notify      -> KIRIM NOTIF PUSH (admin)
 *   GET  /api/notifs      -> riwayat notif (admin)
 *   GET  /api/config      -> APK cek link tujuan + versi terbaru
 *   GET  /download        -> hitung download lalu lempar ke APK
 *   GET  /admin           -> panel admin
 *
 *  BINDING (wrangler.toml):
 *   DB                 -> D1 database
 *  SECRET (wrangler secret put):
 *   FIREBASE_SA_JSON   -> isi file service-account.json dari Firebase (1 baris)
 * ========================================================================== */

// ============================== ⚙️ KONFIGURASI ==============================
const CONFIG = {
  BRAND_NAME: "TOKO123",

  // Kunci panel admin — WAJIB GANTI
  ADMIN_KEY: "sirx-toko123-2026",

  // Kunci ringan yang ditanam di APK (anti spam API)
  APP_KEY: "tk123-app-key-x9f2",

  // HP dianggap ONLINE kalau heartbeat < X menit
  ONLINE_WINDOW_MIN: 3,

  // Cache statistik (detik) biar hemat D1
  STATS_CACHE_SEC: 10,

  // 🔗 LINK TUJUAN APK — APK ambil dari sini tiap dibuka.
  // Ganti di sini = SEMUA APK langsung ikut, tanpa update APK.
  TARGET_URL: "https://cutt.ly/Toko123_Gacor",

  // Versi APK terbaru (buat notif "ada update")
  LATEST_VERSION: "1.0",
  LATEST_CODE: 1,
  UPDATE_URL: "https://cutt.ly/apptoko123",
  FORCE_UPDATE: false, // true = user wajib update baru bisa main

  // Download APK
  GITHUB_OWNER: "demonnlord3-cmd",
  GITHUB_REPO: "TOKO123",
  APK_FILE: "TOKO123.apk",
  DIRECT_APK_URL: "", // kalau diisi, ini yang dipakai

  // Berapa device dikirim per gelombang notif (batas waktu Worker)
  NOTIF_BATCH: 400,
};
// ===========================================================================

const ONLINE_MS = CONFIG.ONLINE_WINDOW_MIN * 60 * 1000;
let STATS_CACHE = { at: 0, data: null };
let TOKEN_CACHE = { at: 0, token: null }; // cache access token Google (1 jam)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const m = request.method.toUpperCase();

    if (m === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (path === "/api/register" && m === "POST") return cors(await apiRegister(request, env));
      if (path === "/api/heartbeat" && m === "POST") return cors(await apiHeartbeat(request, env));
      if (path === "/api/token" && m === "POST") return cors(await apiToken(request, env));
      if (path === "/api/config" && m === "GET") return cors(apiConfig());
      if (path === "/api/stats" && m === "GET") return cors(await apiStats(env));
      if (path === "/api/devices" && m === "GET") return cors(await apiDevices(request, env, url));
      if (path === "/api/notify" && m === "POST") return cors(await apiNotify(request, env, ctx));
      if (path === "/api/notifs" && m === "GET") return cors(await apiNotifs(request, env, url));
      if (path === "/download" && m === "GET") return await apiDownload(env);
      if (path === "/admin" && m === "GET") return html(ADMIN_HTML());
      if (path === "/" && m === "GET") return html(ROOT_HTML());

      return cors(json({ ok: false, error: "not_found" }, 404));
    } catch (err) {
      return cors(json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500));
    }
  },
};

/* ============================== ENDPOINTS ================================= */

// APK dibuka -> daftar / update data
async function apiRegister(request, env) {
  const b = await safeJson(request);
  if (!appKeyOK(request, b)) return json({ ok: false, error: "bad_app_key" }, 401);

  const id = clean(b.device_id, 80);
  if (!id) return json({ ok: false, error: "no_device_id" }, 400);

  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const country = request.cf?.country || "";

  const token = clean(b.fcm_token, 300);
  const ver = clean(b.apk_version, 20);
  const code = num(b.apk_code);
  const andro = clean(b.android_version, 20);
  const sdk = num(b.sdk_int);
  const brand = clean(b.brand, 40);
  const model = clean(b.model, 60);
  const notifOn = b.notif_enabled === false ? 0 : 1;

  await env.DB.prepare(
    `INSERT INTO devices
       (device_id, fcm_token, apk_version, apk_code, android_version, sdk_int,
        brand, model, country, ip, installed_at, last_online, open_count, notif_enabled, blocked)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11,1,?12,0)
     ON CONFLICT(device_id) DO UPDATE SET
       fcm_token       = CASE WHEN ?2 <> '' THEN ?2 ELSE devices.fcm_token END,
       apk_version     = ?3,
       apk_code        = ?4,
       android_version = CASE WHEN ?5 <> '' THEN ?5 ELSE devices.android_version END,
       sdk_int         = ?6,
       brand           = CASE WHEN ?7 <> '' THEN ?7 ELSE devices.brand END,
       model           = CASE WHEN ?8 <> '' THEN ?8 ELSE devices.model END,
       country         = ?9,
       ip              = ?10,
       last_online     = ?11,
       open_count      = devices.open_count + 1,
       notif_enabled   = ?12,
       blocked         = 0`
  ).bind(id, token, ver, code, andro, sdk, brand, model, country, ip, now, notifOn).run();

  return json({
    ok: true,
    heartbeat_sec: 60,
    target_url: CONFIG.TARGET_URL,
    latest_version: CONFIG.LATEST_VERSION,
    latest_code: CONFIG.LATEST_CODE,
    update_url: CONFIG.UPDATE_URL,
    force_update: CONFIG.FORCE_UPDATE,
  });
}

// Denyut -> update online terakhir (1 baris, murah)
async function apiHeartbeat(request, env) {
  const b = await safeJson(request);
  if (!appKeyOK(request, b)) return json({ ok: false, error: "bad_app_key" }, 401);
  const id = clean(b.device_id, 80);
  if (!id) return json({ ok: false, error: "no_device_id" }, 400);

  const r = await env.DB.prepare(
    `UPDATE devices SET last_online = ?1, blocked = 0 WHERE device_id = ?2`
  ).bind(Date.now(), id).run();

  return json({ ok: true, known: !!r.meta?.changes });
}

// FCM token berubah (Firebase kadang refresh token)
async function apiToken(request, env) {
  const b = await safeJson(request);
  if (!appKeyOK(request, b)) return json({ ok: false, error: "bad_app_key" }, 401);
  const id = clean(b.device_id, 80);
  const token = clean(b.fcm_token, 300);
  if (!id || !token) return json({ ok: false, error: "bad_input" }, 400);

  await env.DB.prepare(
    `UPDATE devices SET fcm_token = ?1, blocked = 0, last_online = ?2 WHERE device_id = ?3`
  ).bind(token, Date.now(), id).run();
  return json({ ok: true });
}

// APK cek link tujuan + versi terbaru
function apiConfig() {
  return json({
    ok: true,
    target_url: CONFIG.TARGET_URL,
    latest_version: CONFIG.LATEST_VERSION,
    latest_code: CONFIG.LATEST_CODE,
    update_url: CONFIG.UPDATE_URL,
    force_update: CONFIG.FORCE_UPDATE,
  });
}

// Statistik dashboard
async function apiStats(env) {
  const t = Date.now();
  if (STATS_CACHE.data && t - STATS_CACHE.at < CONFIG.STATS_CACHE_SEC * 1000) {
    return json({ ok: true, cached: true, ...STATS_CACHE.data });
  }
  const now = Date.now();
  const since = now - ONLINE_MS;
  const mid = startOfTodayWIB();

  const [tot, on, notif, ver, andro, brand, dl, today, d24] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) n FROM devices`),
    env.DB.prepare(`SELECT COUNT(*) n FROM devices WHERE last_online > ?1`).bind(since),
    env.DB.prepare(`SELECT COUNT(*) n FROM devices WHERE blocked=0 AND notif_enabled=1 AND fcm_token <> ''`),
    env.DB.prepare(`SELECT COALESCE(NULLIF(apk_version,''),'?') k, COUNT(*) n FROM devices GROUP BY k ORDER BY n DESC`),
    env.DB.prepare(`SELECT COALESCE(NULLIF(android_version,''),'?') k, COUNT(*) n FROM devices GROUP BY k ORDER BY n DESC`),
    env.DB.prepare(`SELECT COALESCE(NULLIF(brand,''),'?') k, COUNT(*) n FROM devices GROUP BY k ORDER BY n DESC LIMIT 12`),
    env.DB.prepare(`SELECT value n FROM counters WHERE name='download'`),
    env.DB.prepare(`SELECT COUNT(*) n FROM devices WHERE installed_at > ?1`).bind(mid),
    env.DB.prepare(`SELECT COUNT(*) n FROM devices WHERE last_online > ?1`).bind(now - 864e5),
  ]);

  const total = num(tot.results[0].n);
  const online = num(on.results[0].n);
  const data = {
    brand: CONFIG.BRAND_NAME,
    online_window_min: CONFIG.ONLINE_WINDOW_MIN,
    total_download: num(dl.results[0]?.n),
    total_install: total,
    online, offline: Math.max(0, total - online),
    reachable: num(notif.results[0].n),
    active_24h: num(d24.results[0].n),
    install_today: num(today.results[0].n),
    target_url: CONFIG.TARGET_URL,
    latest_version: CONFIG.LATEST_VERSION,
    by_version: ver.results.map(r => ({ key: r.k, count: num(r.n) })),
    by_android: andro.results.map(r => ({ key: r.k, count: num(r.n) })),
    by_brand: brand.results.map(r => ({ key: r.k, count: num(r.n) })),
    server_time: now,
  };
  STATS_CACHE = { at: t, data };
  return json({ ok: true, cached: false, ...data });
}

// List device
async function apiDevices(request, env, url) {
  if (!adminOK(request, url)) return json({ ok: false, error: "unauthorized" }, 401);

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const per = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per") || "25", 10)));
  const q = clean(url.searchParams.get("q") || "", 60);
  const f = url.searchParams.get("filter") || "all";
  const off = (page - 1) * per;
  const since = Date.now() - ONLINE_MS;

  const w = [], a = [];
  if (q) {
    const i = a.length + 1;
    w.push(`(device_id LIKE ?${i} OR model LIKE ?${i} OR brand LIKE ?${i} OR ip LIKE ?${i} OR country LIKE ?${i})`);
    a.push(`%${q}%`);
  }
  if (f === "online") { w.push(`last_online > ?${a.length + 1}`); a.push(since); }
  if (f === "offline") { w.push(`last_online <= ?${a.length + 1}`); a.push(since); }
  if (f === "notif") { w.push(`blocked=0 AND notif_enabled=1 AND fcm_token <> ''`); }
  const ws = w.length ? `WHERE ${w.join(" AND ")}` : "";

  const [c, l] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) n FROM devices ${ws}`).bind(...a),
    env.DB.prepare(
      `SELECT device_id, apk_version, android_version, brand, model, country, ip,
              installed_at, last_online, open_count, notif_enabled, blocked,
              CASE WHEN fcm_token <> '' THEN 1 ELSE 0 END AS has_token
         FROM devices ${ws} ORDER BY last_online DESC
         LIMIT ?${a.length + 1} OFFSET ?${a.length + 2}`
    ).bind(...a, per, off),
  ]);

  const total = num(c.results[0].n);
  return json({
    ok: true, page, per, total,
    pages: Math.max(1, Math.ceil(total / per)),
    devices: l.results.map(r => ({ ...r, online: num(r.last_online) > since })),
    server_time: Date.now(),
  });
}

// ============ 🔔 KIRIM NOTIF PUSH ============
async function apiNotify(request, env, ctx) {
  const url = new URL(request.url);
  if (!adminOK(request, url)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.FIREBASE_SA_JSON) {
    return json({ ok: false, error: "no_firebase", detail: "Secret FIREBASE_SA_JSON belum di-set. Jalankan: wrangler secret put FIREBASE_SA_JSON" }, 400);
  }

  const b = await safeJson(request);
  const title = clean(b.title, 100);
  const body = clean(b.body, 300);
  const image = clean(b.image_url, 400);
  const click = clean(b.click_url, 400);
  const target = clean(b.target, 40) || "all";
  if (!title || !body) return json({ ok: false, error: "title_body_required" }, 400);

  // Ambil token sesuai target
  const since = Date.now() - ONLINE_MS;
  let where = `blocked=0 AND notif_enabled=1 AND fcm_token <> ''`;
  const args = [];
  if (target === "online") { where += ` AND last_online > ?1`; args.push(since); }
  else if (target.startsWith("version:")) { where += ` AND apk_version = ?1`; args.push(target.slice(8)); }
  else if (target.startsWith("brand:")) { where += ` AND brand = ?1`; args.push(target.slice(6)); }

  const rows = await env.DB.prepare(
    `SELECT device_id, fcm_token FROM devices WHERE ${where} LIMIT ${CONFIG.NOTIF_BATCH}`
  ).bind(...args).all();

  const list = rows.results || [];
  if (!list.length) return json({ ok: false, error: "no_target", detail: "Tidak ada device yang cocok / belum ada yang install." });

  // Catat riwayat
  const rec = await env.DB.prepare(
    `INSERT INTO notifications (title, body, image_url, click_url, target, status, created_at)
     VALUES (?1,?2,?3,?4,?5,'sending',?6)`
  ).bind(title, body, image, click, target, Date.now()).run();
  const notifId = rec.meta.last_row_id;

  // Ambil access token Google (OAuth2 pakai service account)
  let access;
  try {
    access = await getGoogleToken(env);
  } catch (e) {
    await env.DB.prepare(`UPDATE notifications SET status='error', finished_at=?1 WHERE id=?2`)
      .bind(Date.now(), notifId).run();
    return json({ ok: false, error: "firebase_auth_failed", detail: String(e?.message || e) }, 500);
  }
  const projectId = JSON.parse(env.FIREBASE_SA_JSON).project_id;

  // Kirim paralel (batching biar gak nabrak limit)
  const send = async () => {
    let sent = 0, failed = 0;
    const dead = [];
    const chunks = chunk(list, 50);
    for (const c of chunks) {
      const res = await Promise.all(c.map(d =>
        fcmSend(projectId, access, d.fcm_token, { title, body, image, click })
          .then(ok => ({ ok, id: d.device_id }))
          .catch(() => ({ ok: false, id: d.device_id }))
      ));
      for (const r of res) { if (r.ok) sent++; else { failed++; dead.push(r.id); } }
    }
    // tandai token mati biar gak dikirim lagi
    if (dead.length) {
      const stmts = dead.map(id =>
        env.DB.prepare(`UPDATE devices SET blocked=1 WHERE device_id=?1`).bind(id));
      for (const g of chunk(stmts, 50)) await env.DB.batch(g);
    }
    await env.DB.prepare(
      `UPDATE notifications SET sent_count=?1, failed_count=?2, status='done', finished_at=?3 WHERE id=?4`
    ).bind(sent, failed, Date.now(), notifId).run();
  };

  // Jalan di background biar panel gak nunggu lama
  ctx.waitUntil(send());

  return json({ ok: true, notif_id: notifId, targeted: list.length, message: "Notif sedang dikirim…" });
}

// Riwayat notif
async function apiNotifs(request, env, url) {
  if (!adminOK(request, url)) return json({ ok: false, error: "unauthorized" }, 401);
  const r = await env.DB.prepare(
    `SELECT id,title,body,target,sent_count,failed_count,status,created_at
       FROM notifications ORDER BY id DESC LIMIT 20`
  ).all();
  return json({ ok: true, notifs: r.results || [] });
}

// Hitung download -> lempar ke APK
async function apiDownload(env) {
  await env.DB.prepare(
    `INSERT INTO counters (name,value) VALUES ('download',1)
     ON CONFLICT(name) DO UPDATE SET value = value + 1`
  ).run();
  const t = CONFIG.DIRECT_APK_URL ||
    `https://github.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/releases/latest/download/${CONFIG.APK_FILE}`;
  return Response.redirect(t, 302);
}

/* ========================= FIREBASE FCM (HTTP v1) ========================= */

// Kirim 1 notif ke 1 token. return true kalau sukses.
async function fcmSend(projectId, access, token, n) {
  const msg = {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      data: { click_url: n.click || "", image: n.image || "" },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "toko123_promo",
          sound: "default",
          click_action: "OPEN_MAIN",
          ...(n.image ? { image: n.image } : {}),
        },
      },
    },
  };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  return r.ok;
}

// Ambil access token Google via JWT service account (cache 55 menit)
async function getGoogleToken(env) {
  const now = Date.now();
  if (TOKEN_CACHE.token && now - TOKEN_CACHE.at < 55 * 60 * 1000) return TOKEN_CACHE.token;

  const sa = JSON.parse(env.FIREBASE_SA_JSON);
  const iat = Math.floor(now / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("no_access_token: " + JSON.stringify(d));
  TOKEN_CACHE = { at: now, token: d.access_token };
  return d.access_token;
}

async function importPrivateKey(pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const bin = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", bin.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
}
function b64url(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ============================== HELPERS ================================== */
function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function html(s, st = 200) {
  return new Response(s, { status: st, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
function cors(r) {
  const h = new Headers(r.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,X-Admin-Key,X-App-Key");
  return new Response(r.body, { status: r.status, headers: h });
}
async function safeJson(r) { try { return await r.json(); } catch { return {}; } }
function clean(v, max) { return v == null ? "" : String(v).trim().slice(0, max || 200); }
function num(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function appKeyOK(r, b) {
  if (!CONFIG.APP_KEY) return true;
  return (r.headers.get("X-App-Key") || b?.app_key || "") === CONFIG.APP_KEY;
}
function adminOK(r, u) {
  return (r.headers.get("X-Admin-Key") || u.searchParams.get("key") || "") === CONFIG.ADMIN_KEY;
}
function startOfTodayWIB() {
  const o = 7 * 3600 * 1000, d = new Date(Date.now() + o);
  d.setUTCHours(0, 0, 0, 0); return d.getTime() - o;
}

/* ============================== HALAMAN ================================== */
function ROOT_HTML() {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${CONFIG.BRAND_NAME}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#05070d;color:#c8d3e6;font-family:system-ui,sans-serif}
a{color:#3ef0c8;text-decoration:none;border:1px solid #163a34;padding:10px 16px;border-radius:10px}</style></head>
<body><div style="text-align:center"><h2 style="letter-spacing:.3em;color:#3ef0c8">${CONFIG.BRAND_NAME}</h2>
<p>APK Tracker + Push aktif ✅</p><a href="/admin">Buka Panel →</a></div></body></html>`;
}

function ADMIN_HTML() {
  return String.raw`<!doctype html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${CONFIG.BRAND_NAME} · Panel APK</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#04060c;--panel:#0a0f1c;--panel2:#0d1526;--line:#16233d;--ink:#dbe6fb;--muted:#7d8db0;--dim:#4a5878;
--cyan:#2ff3d0;--blue:#4d8dff;--amber:#ffb03a;--red:#ff5470;--purple:#a97bff;
--mono:'JetBrains Mono',ui-monospace,monospace;--sans:'Space Grotesk',system-ui,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#0a1730 0,transparent 60%),
radial-gradient(900px 500px at -10% 10%,#0a2020 0,transparent 55%),var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:22px 18px 60px}
header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.logo{font-weight:700;letter-spacing:.34em;font-size:15px;color:var(--cyan);text-shadow:0 0 18px rgba(47,243,208,.45)}
.logo small{display:block;letter-spacing:.2em;color:var(--dim);font-weight:500;font-size:10px;margin-top:3px}
.live{margin-left:auto;display:flex;align-items:center;gap:8px;font:600 12px var(--mono);color:var(--muted)}
.pulse{width:9px;height:9px;border-radius:50%;background:var(--cyan);animation:pp 1.8s infinite}
@keyframes pp{0%{box-shadow:0 0 0 0 rgba(47,243,208,.55)}70%{box-shadow:0 0 0 10px rgba(47,243,208,0)}100%{box-shadow:0 0 0 0 rgba(47,243,208,0)}}
.btn{font:600 12px var(--sans);border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:9px 14px;border-radius:9px;cursor:pointer;transition:.15s}
.btn:hover{border-color:#0f4d44;background:var(--panel2)}
.btn.ghost{background:transparent}
.btn.primary{background:var(--cyan);color:#04120f;border:none;font-weight:700}
.btn.primary:hover{filter:brightness(1.1)}
.btn:disabled{opacity:.5;cursor:not-allowed}
#gate{position:fixed;inset:0;display:grid;place-items:center;background:rgba(3,5,10,.94);backdrop-filter:blur(6px);z-index:50}
#gate .card{width:min(360px,92vw);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px}
#gate h1{margin:0 0 4px;font-size:16px;letter-spacing:.28em;color:var(--cyan)}
#gate p{margin:0 0 18px;color:var(--muted);font-size:13px}
input,textarea,select{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:500 13px var(--mono);outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--cyan)}
#gate .btn{width:100%;margin-top:12px}
#gerr{color:var(--red);font-size:12px;min-height:16px;margin-top:8px}
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
.card{position:relative;overflow:hidden;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:15px}
.card .lbl{font:600 10px var(--mono);letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
.card .val{font:700 30px/1 var(--sans);margin-top:11px;letter-spacing:-.02em}
.card .sub{font:500 10px var(--mono);color:var(--dim);margin-top:7px}
.card .edge{position:absolute;left:0;top:0;bottom:0;width:3px}
.c1 .edge{background:var(--blue)}.c1 .val{color:#bcd3ff}
.c2 .edge{background:var(--cyan)}.c2 .val{color:var(--ink)}
.c3 .edge{background:var(--cyan)}.c3 .val{color:var(--cyan)}
.c4 .edge{background:var(--dim)}.c4 .val{color:var(--muted)}
.c5 .edge{background:var(--purple)}.c5 .val{color:#d9c4ff}
.c3 .lbl::after{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--cyan);margin-left:7px;vertical-align:middle;animation:pp 1.8s infinite;box-shadow:0 0 8px var(--cyan)}
.tabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid var(--line)}
.tabs button{background:none;border:none;color:var(--muted);font:600 13px var(--sans);padding:11px 16px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs button.active{color:var(--cyan);border-bottom-color:var(--cyan)}
.pane{display:none}.pane.active{display:block}
.grid{display:grid;grid-template-columns:320px 1fr;gap:14px;align-items:start}
.box{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px}
.box h3{margin:0;padding:14px 16px;font:600 12px var(--mono);letter-spacing:.16em;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
.box .body{padding:14px 16px 16px}
.bar{margin:10px 0}
.bar .top{display:flex;justify-content:space-between;font:500 13px var(--sans);margin-bottom:6px}
.bar .top span{font:500 12px var(--mono);color:var(--muted)}
.track{height:8px;border-radius:6px;background:#0a1220;overflow:hidden;border:1px solid #0e1a2e}
.fill{height:100%;border-radius:6px;background:linear-gradient(90deg,var(--cyan),#1c7d70);box-shadow:0 0 12px rgba(47,243,208,.4);transition:width .5s}
.b2 .fill{background:linear-gradient(90deg,var(--blue),#254a8a);box-shadow:0 0 12px rgba(77,141,255,.35)}
.b3 .fill{background:linear-gradient(90deg,var(--amber),#8a5c1e);box-shadow:none}
.stack{margin-bottom:14px}.stack:last-child{margin-bottom:0}
.stack .h{font:500 11px var(--mono);letter-spacing:.14em;color:var(--dim);margin-bottom:6px}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.toolbar input{flex:1;min-width:150px}
.seg{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.seg button{background:none;border:none;color:var(--muted);font:600 12px var(--sans);padding:9px 12px;cursor:pointer}
.seg button.active{background:var(--cyan);color:#04120f}
table{width:100%;border-collapse:collapse;font-size:13px}
th{position:sticky;top:0;text-align:left;font:600 10px var(--mono);letter-spacing:.1em;color:var(--dim);text-transform:uppercase;padding:11px 13px;background:var(--panel);border-bottom:1px solid var(--line)}
td{padding:11px 13px;border-bottom:1px solid #0c1626;vertical-align:middle}
tr:hover td{background:#0a1424}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}
.dot.on{background:var(--cyan);box-shadow:0 0 8px var(--cyan);animation:pp 1.8s infinite}
.dot.off{background:#33405c}
.mono{font-family:var(--mono);color:var(--muted)}
.tag{font:600 10px var(--mono);padding:2px 7px;border-radius:6px;border:1px solid var(--line);color:var(--muted)}
.tag.ok{border-color:#0f4d44;color:var(--cyan)}
.id{font-family:var(--mono);color:var(--dim);font-size:11px}
.foot{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;gap:10px;flex-wrap:wrap}
.pg{display:flex;gap:6px;align-items:center;font:500 12px var(--mono);color:var(--muted)}
.empty{padding:40px;text-align:center;color:var(--dim);font-size:13px}
.field{margin-bottom:13px}
.field label{display:block;font:600 11px var(--mono);letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:6px}
.field .hint{font:400 11px var(--sans);color:var(--dim);margin-top:5px}
textarea{resize:vertical;min-height:76px;font-family:var(--sans);font-size:14px}
.preview{background:#0b1220;border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:4px}
.pv-head{display:flex;align-items:center;gap:8px;font:500 10px var(--mono);color:var(--dim);margin-bottom:9px}
.pv-ico{width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,var(--cyan),var(--blue))}
.pv-title{font:700 14px var(--sans);margin-bottom:3px}
.pv-body{font:400 13px var(--sans);color:var(--muted);white-space:pre-wrap;word-break:break-word}
#nres{font:500 12px var(--mono);margin-top:10px;min-height:16px}
.ok{color:var(--cyan)}.err{color:var(--red)}
@media(max-width:1000px){.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.hide-sm{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>

<div id="gate"><div class="card">
  <h1>${CONFIG.BRAND_NAME}</h1><p>Masukkan kunci admin untuk membuka panel.</p>
  <input id="gkey" type="password" placeholder="Admin key…" autocomplete="off">
  <div id="gerr"></div><button class="btn primary" onclick="doLogin()">Masuk</button>
</div></div>

<div class="wrap" id="app" style="display:none">
<header>
  <div class="logo">${CONFIG.BRAND_NAME}<small>APK TRACKER + PUSH</small></div>
  <div class="live"><span class="pulse"></span><span id="clock">live</span></div>
  <button class="btn ghost" onclick="refreshAll()">↻ Refresh</button>
  <button class="btn ghost" onclick="logout()">Keluar</button>
</header>

<div class="cards">
  <div class="card c1"><span class="edge"></span><div class="lbl">Total Download</div><div class="val" id="m_dl">—</div><div class="sub">klik tombol download</div></div>
  <div class="card c2"><span class="edge"></span><div class="lbl">Total Install</div><div class="val" id="m_inst">—</div><div class="sub" id="s_inst">device terdaftar</div></div>
  <div class="card c3"><span class="edge"></span><div class="lbl">Online</div><div class="val" id="m_on">—</div><div class="sub" id="s_on">aktif</div></div>
  <div class="card c4"><span class="edge"></span><div class="lbl">Offline</div><div class="val" id="m_off">—</div><div class="sub">tidak aktif</div></div>
  <div class="card c5"><span class="edge"></span><div class="lbl">Bisa Dinotif</div><div class="val" id="m_reach">—</div><div class="sub">izin notif ON</div></div>
</div>

<div class="tabs">
  <button class="active" onclick="tab('dash',this)">Dashboard</button>
  <button onclick="tab('notif',this)">🔔 Kirim Notif</button>
  <button onclick="tab('hist',this)">Riwayat Notif</button>
</div>

<!-- DASHBOARD -->
<div class="pane active" id="p_dash"><div class="grid">
  <div class="box"><h3>Rincian <span class="mono" id="s_today">today 0</span></h3><div class="body">
    <div class="stack"><div class="h">VERSI APK</div><div id="bd_ver"></div></div>
    <div class="stack"><div class="h">ANDROID</div><div id="bd_and"></div></div>
    <div class="stack"><div class="h">MERK HP</div><div id="bd_brand"></div></div>
  </div></div>
  <div class="box">
    <div class="toolbar">
      <input id="q" placeholder="cari device id / model / merk / IP…" oninput="dsearch()">
      <div class="seg">
        <button class="active" onclick="setF('all',this)">Semua</button>
        <button onclick="setF('online',this)">Online</button>
        <button onclick="setF('offline',this)">Offline</button>
        <button onclick="setF('notif',this)">Bisa Notif</button>
      </div>
    </div>
    <div style="overflow:auto;max-height:520px"><table>
      <thead><tr><th>Status</th><th>Device</th><th class="hide-sm">Merk / Model</th><th>APK</th>
      <th class="hide-sm">Android</th><th class="hide-sm">Negara</th><th>Terakhir</th><th class="hide-sm">Notif</th></tr></thead>
      <tbody id="rows"><tr><td colspan="8" class="empty">memuat…</td></tr></tbody>
    </table></div>
    <div class="foot"><div class="pg" id="pginfo">—</div>
      <div class="pg"><button class="btn ghost" onclick="pg(-1)">← Prev</button><span id="pgnum">1</span>
      <button class="btn ghost" onclick="pg(1)">Next →</button></div></div>
  </div>
</div></div>

<!-- KIRIM NOTIF -->
<div class="pane" id="p_notif"><div class="grid">
  <div class="box"><h3>Tulis Notifikasi</h3><div class="body">
    <div class="field"><label>Judul</label>
      <input id="n_title" maxlength="100" placeholder="🔥 MAXWIN LAGI GACOR!" oninput="pv()"></div>
    <div class="field"><label>Isi Pesan</label>
      <textarea id="n_body" maxlength="300" placeholder="Bonus New Member 100% cuma hari ini. Buruan klaim!" oninput="pv()"></textarea></div>
    <div class="field"><label>Link saat di-tap (opsional)</label>
      <input id="n_click" placeholder="https://cutt.ly/Toko123_Gacor">
      <div class="hint">Kosongkan = buka APK biasa</div></div>
    <div class="field"><label>Gambar (opsional)</label>
      <input id="n_img" placeholder="https://menu-gambar.com/toko123/promo.webp">
      <div class="hint">Gambar besar di dalam notif</div></div>
    <div class="field"><label>Kirim ke</label>
      <select id="n_target"><option value="all">Semua device</option><option value="online">Yang online saja</option></select>
      <div class="hint" id="t_hint">—</div></div>
    <button class="btn primary" id="n_send" onclick="sendNotif()" style="width:100%;padding:13px">🔔 Kirim Notifikasi</button>
    <div id="nres"></div>
  </div></div>
  <div class="box"><h3>Pratinjau di HP</h3><div class="body">
    <div class="preview">
      <div class="pv-head"><span class="pv-ico"></span>${CONFIG.BRAND_NAME} · sekarang</div>
      <div class="pv-title" id="pv_t">Judul notif</div>
      <div class="pv-body" id="pv_b">Isi pesan muncul di sini…</div>
    </div>
    <div style="margin-top:16px;font:400 13px var(--sans);color:var(--muted);line-height:1.7">
      <b style="color:var(--ink)">Cara kerjanya:</b><br>
      Notif ini nongol di HP user <b style="color:var(--cyan)">walau APK ketutup</b> — persis WhatsApp.
      Kalau HP mati atau tidak ada internet, notif <b>tetap masuk</b> begitu HP nyala/online lagi.<br><br>
      <b style="color:var(--ink)">Catatan:</b> user yang mematikan izin notif di HP tidak terhitung.
      Angka <b style="color:var(--purple)">Bisa Dinotif</b> di atas adalah jumlah yang beneran kena.
    </div>
  </div></div>
</div></div>

<!-- RIWAYAT -->
<div class="pane" id="p_hist"><div class="box"><h3>20 Notif Terakhir</h3>
  <div style="overflow:auto"><table>
    <thead><tr><th>Waktu</th><th>Judul</th><th class="hide-sm">Isi</th><th>Target</th><th>Terkirim</th><th>Gagal</th><th>Status</th></tr></thead>
    <tbody id="hrows"><tr><td colspan="7" class="empty">belum ada notif</td></tr></tbody>
  </table></div>
</div></div>
</div>

<script>
const KS='tk123_admin_key';
let AK=localStorage.getItem(KS)||'';
let st={page:1,per:25,q:'',filter:'all',pages:1};
let t1,t2,ts;

function doLogin(){const k=document.getElementById('gkey').value.trim();
  if(!k){ge('Kunci masih kosong');return}AK=k;verify()}
async function verify(){try{const r=await api('/api/devices?per=1');
  if(r.ok){localStorage.setItem(KS,AK);open_()}else ge('Kunci salah')}catch(e){ge('Kunci salah / server error')}}
function ge(m){document.getElementById('gerr').textContent=m}
function open_(){document.getElementById('gate').style.display='none';
  document.getElementById('app').style.display='block';clock();refreshAll();
  t1=setInterval(loadStats,15000);t2=setInterval(loadTable,20000)}
function logout(){localStorage.removeItem(KS);AK='';clearInterval(t1);clearInterval(t2);location.reload()}
async function api(p,o){return (await fetch(p,Object.assign({headers:{'X-Admin-Key':AK,'Content-Type':'application/json'}},o||{}))).json()}

function tab(n,b){document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
  document.getElementById('p_'+n).classList.add('active');if(n==='hist')loadHist()}

async function loadStats(){try{const d=await(await fetch('/api/stats')).json();if(!d.ok)return;
  sn('m_dl',d.total_download);sn('m_inst',d.total_install);sn('m_on',d.online);sn('m_off',d.offline);sn('m_reach',d.reachable);
  document.getElementById('s_on').textContent='aktif ≤ '+d.online_window_min+' menit';
  document.getElementById('s_inst').textContent='+'+f(d.install_today)+' hari ini';
  document.getElementById('s_today').textContent='today '+f(d.install_today);
  document.getElementById('t_hint').textContent=f(d.reachable)+' device siap terima notif';
  bars('bd_ver',d.by_version,'v','');bars('bd_and',d.by_android,'Android ','b2');bars('bd_brand',d.by_brand,'','b3');
  const sel=document.getElementById('n_target');const cur=sel.value;
  sel.innerHTML='<option value="all">Semua device ('+f(d.reachable)+')</option><option value="online">Yang online saja ('+f(d.online)+')</option>'+
    d.by_version.filter(v=>v.key!=='?').map(v=>'<option value="version:'+v.key+'">Versi v'+v.key+' ('+f(v.count)+')</option>').join('')+
    d.by_brand.filter(v=>v.key!=='?'&&v.key!=='Lainnya').map(v=>'<option value="brand:'+v.key+'">Merk '+v.key+' ('+f(v.count)+')</option>').join('');
  sel.value=cur||'all'}catch(e){}}
function bars(id,a,pre,cls){const el=document.getElementById(id);
  if(!a||!a.length){el.innerHTML='<div class="mono" style="font-size:12px;color:var(--dim)">belum ada data</div>';return}
  const mx=Math.max(...a.map(x=>x.count),1);
  el.innerHTML=a.slice(0,8).map(x=>{const l=x.key==='?'?'tidak diketahui':(pre+x.key);
    return '<div class="bar '+cls+'"><div class="top"><b>'+e(l)+'</b><span>'+f(x.count)+'</span></div><div class="track"><div class="fill" style="width:'+Math.round(x.count/mx*100)+'%"></div></div></div>'}).join('')}

async function loadTable(){try{const p=new URLSearchParams({page:st.page,per:st.per,q:st.q,filter:st.filter});
  const d=await api('/api/devices?'+p);if(!d.ok){if(d.error==='unauthorized')logout();return}
  const tb=document.getElementById('rows');
  tb.innerHTML=d.devices.length?d.devices.map(r=>'<tr>'+
    '<td class="mono">'+(r.online?'<span class="dot on"></span>ON':'<span class="dot off"></span>off')+'</td>'+
    '<td class="id">'+sid(r.device_id)+'</td>'+
    '<td class="hide-sm"><b>'+e(r.brand||'-')+'</b> <span class="mono">'+e(r.model||'')+'</span></td>'+
    '<td><span class="tag">v'+e(r.apk_version||'?')+'</span></td>'+
    '<td class="hide-sm mono">'+e(r.android_version||'-')+'</td>'+
    '<td class="hide-sm mono">'+fl(r.country)+' '+e(r.country||'-')+'</td>'+
    '<td class="mono">'+ago(r.last_online)+'</td>'+
    '<td class="hide-sm">'+(r.has_token&&r.notif_enabled&&!r.blocked?'<span class="tag ok">✓ ON</span>':'<span class="tag">off</span>')+'</td></tr>').join('')
    :'<tr><td colspan="8" class="empty">tidak ada device</td></tr>';
  st.pages=d.pages;document.getElementById('pgnum').textContent=d.page+' / '+d.pages;
  document.getElementById('pginfo').textContent='Total '+f(d.total)+' device'}catch(e){}}

async function loadHist(){try{const d=await api('/api/notifs');if(!d.ok)return;
  const tb=document.getElementById('hrows');
  tb.innerHTML=d.notifs.length?d.notifs.map(n=>'<tr>'+
    '<td class="mono">'+dt(n.created_at)+'</td><td><b>'+e(n.title)+'</b></td>'+
    '<td class="hide-sm mono" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(n.body)+'</td>'+
    '<td><span class="tag">'+e(n.target)+'</span></td>'+
    '<td class="mono" style="color:var(--cyan)">'+f(n.sent_count)+'</td>'+
    '<td class="mono" style="color:'+(n.failed_count?'var(--red)':'var(--dim)')+'">'+f(n.failed_count)+'</td>'+
    '<td class="mono">'+e(n.status)+'</td></tr>').join('')
    :'<tr><td colspan="7" class="empty">belum ada notif</td></tr>'}catch(e){}}

function pv(){const t=document.getElementById('n_title').value,b=document.getElementById('n_body').value;
  document.getElementById('pv_t').textContent=t||'Judul notif';
  document.getElementById('pv_b').textContent=b||'Isi pesan muncul di sini…'}

async function sendNotif(){
  const t=document.getElementById('n_title').value.trim(),b=document.getElementById('n_body').value.trim();
  const r=document.getElementById('nres'),btn=document.getElementById('n_send');
  if(!t||!b){r.className='err';r.textContent='Judul dan isi pesan wajib diisi.';return}
  const tg=document.getElementById('n_target');
  if(!confirm('Kirim notif ini ke: '+tg.options[tg.selectedIndex].text+'?\n\nNotif langsung nongol di HP user.'))return;
  btn.disabled=true;r.className='';r.textContent='mengirim…';
  try{const d=await api('/api/notify',{method:'POST',body:JSON.stringify({
      title:t,body:b,click_url:document.getElementById('n_click').value.trim(),
      image_url:document.getElementById('n_img').value.trim(),target:tg.value})});
    if(d.ok){r.className='ok';r.textContent='✅ Terkirim ke '+f(d.targeted)+' device. Cek tab Riwayat untuk hasilnya.';
      document.getElementById('n_title').value='';document.getElementById('n_body').value='';pv();setTimeout(loadHist,3000)}
    else{r.className='err';r.textContent='❌ '+(d.detail||d.error)}
  }catch(e){r.className='err';r.textContent='❌ Gagal kirim: '+e}
  btn.disabled=false}

function refreshAll(){loadStats();loadTable()}
function setF(x,b){st.filter=x;st.page=1;document.querySelectorAll('.seg button').forEach(y=>y.classList.remove('active'));b.classList.add('active');loadTable()}
function dsearch(){clearTimeout(ts);ts=setTimeout(()=>{st.q=document.getElementById('q').value.trim();st.page=1;loadTable()},350)}
function pg(d){const n=st.page+d;if(n>=1&&n<=st.pages){st.page=n;loadTable()}}
function sn(id,v){const el=document.getElementById(id);an(el,parseInt(el.dataset.v||'0',10),v||0);el.dataset.v=v||0}
function an(el,a,b){const d=500,t0=performance.now();(function s(t){const p=Math.min(1,(t-t0)/d);
  el.textContent=f(Math.round(a+(b-a)*p));if(p<1)requestAnimationFrame(s)})(t0)}
function f(n){return (n||0).toLocaleString('id-ID')}
function e(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function sid(i){return !i?'-':(i.length>14?i.slice(0,8)+'…'+i.slice(-4):i)}
function ago(m){if(!m)return '-';const s=Math.floor((Date.now()-m)/1000);if(s<60)return s+'d lalu';
  const n=Math.floor(s/60);if(n<60)return n+'m lalu';const h=Math.floor(n/60);if(h<24)return h+'j lalu';return Math.floor(h/24)+'h lalu'}
function dt(m){if(!m)return '-';const d=new Date(m+252e5);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+' '+d.toISOString().slice(11,16)}
function fl(c){return !c||c.length!==2?'🌐':String.fromCodePoint(...[...c.toUpperCase()].map(x=>127397+x.charCodeAt(0)))}
function clock(){setInterval(()=>{document.getElementById('clock').textContent=new Date(Date.now()+252e5).toISOString().slice(11,19)+' WIB'},1000)}
if(AK)verify();else document.getElementById('gkey').focus();
document.getElementById('gkey').addEventListener('keydown',x=>{if(x.key==='Enter')doLogin()});
</script></body></html>`;
}
