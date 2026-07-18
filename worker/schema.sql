-- ============================================================
--  TOKO123 APK TRACKER + PUSH NOTIF  —  Cloudflare D1
--  Jalankan sekali:
--    wrangler d1 execute toko123apk --file=schema.sql --remote
-- ============================================================

-- 1 baris = 1 HP yang install APK
CREATE TABLE IF NOT EXISTS devices (
  device_id        TEXT PRIMARY KEY,   -- UUID dibuat di HP (permanen, native)
  fcm_token        TEXT DEFAULT '',    -- "nomor HP" untuk kirim notif push
  apk_version      TEXT DEFAULT '',    -- versi APK, contoh: 1.0
  apk_code         INTEGER DEFAULT 0,  -- versionCode (angka), untuk cek update
  android_version  TEXT DEFAULT '',    -- contoh: 14
  sdk_int          INTEGER DEFAULT 0,  -- API level, contoh: 34
  brand            TEXT DEFAULT '',    -- Samsung / Xiaomi / OPPO
  model            TEXT DEFAULT '',    -- SM-A536E
  country          TEXT DEFAULT '',    -- ID / MY (dari Cloudflare)
  ip               TEXT DEFAULT '',
  installed_at     INTEGER DEFAULT 0,  -- epoch ms, install pertama
  last_online      INTEGER DEFAULT 0,  -- epoch ms, online terakhir
  open_count       INTEGER DEFAULT 0,  -- berapa kali buka APK
  notif_enabled    INTEGER DEFAULT 1,  -- 1 = izin notif ON
  blocked          INTEGER DEFAULT 0   -- 1 = token mati / user uninstall
);

-- Index: cegah full table scan (biar D1 gak mahal)
CREATE INDEX IF NOT EXISTS idx_last_online  ON devices(last_online);
CREATE INDEX IF NOT EXISTS idx_apk_version  ON devices(apk_version);
CREATE INDEX IF NOT EXISTS idx_android_ver  ON devices(android_version);
CREATE INDEX IF NOT EXISTS idx_brand        ON devices(brand);
CREATE INDEX IF NOT EXISTS idx_installed    ON devices(installed_at);
CREATE INDEX IF NOT EXISTS idx_blocked      ON devices(blocked);
-- Index gabungan khusus untuk ambil target notif (paling sering dipakai)
CREATE INDEX IF NOT EXISTS idx_notif_target ON devices(blocked, notif_enabled, last_online);

-- Riwayat notif yang pernah dikirim
CREATE TABLE IF NOT EXISTS notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT DEFAULT '',
  body         TEXT DEFAULT '',
  image_url    TEXT DEFAULT '',
  click_url    TEXT DEFAULT '',
  target       TEXT DEFAULT 'all',   -- all | online | version:2.1 | brand:Samsung
  sent_count   INTEGER DEFAULT 0,    -- berhasil terkirim
  failed_count INTEGER DEFAULT 0,    -- gagal (token mati)
  status       TEXT DEFAULT 'pending', -- pending | sending | done | error
  created_at   INTEGER DEFAULT 0,
  finished_at  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

-- Counter (Total Download)
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('download', 0);
