# TOKO123 APK — TUTORIAL LENGKAP
### APK Native + Tracking Online/Offline + Notif Push Beneran
*by SirX*

---

## APA YANG LU DAPET

| Fitur | Keterangan |
|---|---|
| 📊 **Total Download** | Berapa kali tombol download diklik |
| 📱 **Total Install** | Berapa HP yang beneran install + buka APK |
| 🟢 **Online / Offline** | Siapa yang lagi buka APK **sekarang** |
| 🔔 **Notif Push** | Kirim dari panel → **nongol di HP walau APK ketutup** |
| 🔗 **Link bisa diganti** | Ganti tujuan tanpa update APK (tetap lewat cutt.ly) |
| 📈 **Statistik** | Versi APK, tipe Android, merk HP, negara |

---

## CARA KERJA (analogi simpel)

Bayangin **kurir paket**:

1. User install APK → HP dapat **nomor rumah** (Device ID) + **alamat kurir** (FCM Token)
2. Alamat itu dicatat di **buku alamat** lu (database)
3. Lu mau kirim promo → tulis di panel → tekan **Kirim**
4. Kurir Google (Firebase) anter ke semua alamat → **notif nongol di HP**
5. **Walau HP-nya lagi ditaruh di kantong dan APK ketutup** — paket tetap nyampe

Kalau HP mati/gak ada internet? Kurir **nunggu**, begitu HP nyala → langsung anter.

---

## 📁 FILE YANG ADA

```
worker/                       ← Server (Cloudflare)
├── worker.js                 ← Otak + panel admin
├── schema.sql                ← Struktur database
└── wrangler.toml             ← Config deploy

app/                          ← APK (Android Studio)
├── MainActivity.java         ← Layar utama + WebView + tracking
├── MyFirebaseService.java    ← Penjaga notif (hidup 24 jam)
├── AndroidManifest.xml       ← Izin & pendaftaran
├── build.gradle             ← Config app
├── build.gradle.project      ← Config project (root)
├── proguard-rules.pro
└── res/                      ← Tampilan (layout, warna, icon)
```

---

# BAGIAN 1 — FIREBASE (kurir notif)

> Ini yang bikin notif bisa nongol walau APK ketutup. **Gratis** tanpa batas.

### 1.1 Bikin Project
1. Buka **https://console.firebase.google.com**
2. Klik **Add project** → nama: `toko123-apk` → Continue
3. Google Analytics: **matikan** (gak perlu) → Create project

### 1.2 Daftarkan APK
1. Di halaman project, klik **ikon Android** (⚙️ → Project settings → Your apps → Add app → Android)
2. **Android package name**: ketik persis:
   ```
   com.toko123.app
   ```
   ⚠️ Harus **sama persis** dengan `applicationId` di `build.gradle`. Salah 1 huruf = notif gak jalan.
3. App nickname: `TOKO123` → Register app

### 1.3 Download google-services.json
1. Klik **Download google-services.json**
2. **Simpan file ini** — nanti ditaruh di Android Studio
3. Klik Next → Next → Continue to console

### 1.4 Ambil Kunci Server (buat Worker)
1. ⚙️ **Project settings** → tab **Service accounts**
2. Klik **Generate new private key** → **Generate key**
3. Ter-download file `.json` (isinya panjang) → **simpan baik-baik**

> ⚠️ File ini = **kunci induk**. Siapa yang punya bisa kirim notif atas nama lu. Jangan di-upload ke GitHub!

---

# BAGIAN 2 — WORKER (server + panel)

### 2.1 Siapkan
```bash
npm install -g wrangler
wrangler login
```

### 2.2 Bikin database
```bash
wrangler d1 create toko123apk
```
Muncul `database_id = "xxxx-xxxx"` → **copy**.

### 2.3 Tempel ID ke `wrangler.toml`
Ganti `GANTI_DENGAN_ID_DARI_WRANGLER` dengan ID tadi.

### 2.4 Isi struktur tabel
```bash
wrangler d1 execute toko123apk --file=schema.sql --remote
```

### 2.5 Edit `CONFIG` di `worker.js` (paling atas)
```js
ADMIN_KEY: "sirx-toko123-2026",        // ⬅️ GANTI! ini password panel lu
APP_KEY:   "tk123-app-key-x9f2",       // ⬅️ GANTI! harus sama dengan di MainActivity.java
TARGET_URL: "https://cutt.ly/Toko123_Gacor",  // ⬅️ link cutt.ly lu
```

### 2.6 Masukkan kunci Firebase
```bash
wrangler secret put FIREBASE_SA_JSON
```
Lalu **paste seluruh isi file .json** dari langkah 1.4 → Enter.

> 💡 **Penting:** paste isi filenya, bukan nama file. Buka pakai Notepad, Ctrl+A, Ctrl+C, paste.

### 2.7 Deploy
```bash
wrangler deploy
```
Dapat alamat: `https://toko123apk.NAMAKAMU.workers.dev`

**Panel admin:** `https://toko123apk.NAMAKAMU.workers.dev/admin`

---

# BAGIAN 3 — BIKIN APK (Android Studio)

### 3.1 Install Android Studio
Download di **https://developer.android.com/studio** → install (butuh ~8GB).

### 3.2 Bikin project baru
1. **New Project** → pilih **Empty Views Activity** (bukan Compose!)
2. Isi:
   - Name: `TOKO123`
   - Package name: `com.toko123.app` ⬅️ **HARUS SAMA** dengan Firebase
   - Language: **Java**
   - Minimum SDK: **API 21**
3. Finish → tunggu loading selesai

### 3.3 Ganti tampilan folder
Di kiri atas ada dropdown tulisan **Android** → ganti jadi **Project**. Biar keliatan folder aslinya.

### 3.4 Taruh google-services.json
Copy file dari langkah 1.3 ke folder:
```
TOKO123/app/google-services.json
```
⚠️ Di dalam folder **app**, bukan di paling luar.

### 3.5 Copy semua file
| Dari paket ini | Taruh di Android Studio |
|---|---|
| `MainActivity.java` | `app/src/main/java/com/toko123/app/` (timpa yang lama) |
| `MyFirebaseService.java` | `app/src/main/java/com/toko123/app/` (file baru) |
| `AndroidManifest.xml` | `app/src/main/` (timpa) |
| `build.gradle` | `app/` (timpa) |
| `build.gradle.project` | isinya tempel ke `build.gradle` paling luar |
| `proguard-rules.pro` | `app/` (timpa) |
| `res/layout/activity_main.xml` | `app/src/main/res/layout/` (timpa) |
| `res/values/*.xml` | `app/src/main/res/values/` (timpa) |
| `res/drawable/*.xml` | `app/src/main/res/drawable/` |
| `res/drawable-*/` (5 folder) | `app/src/main/res/` — **logo & icon notif** |
| `res/mipmap-*/` (6 folder) | `app/src/main/res/` — **icon launcher** (timpa yang lama) |
| `res/xml/*.xml` | `app/src/main/res/xml/` (bikin folder kalau belum ada) |

> ✅ **Logo burung hantu TOKO123 sudah terpasang** di semua ukuran. Gak perlu Image Asset lagi —
> icon launcher, splash, dan icon notif semua udah jadi.

---

## ⚠️ SOAL KUALITAS LOGO — BACA INI

Logo yang dipakai sekarang diambil dari gambar **214×216 piksel**. Itu **kekecilan** untuk Android.

**Akibatnya:**
- Icon di HP layar biasa (720p) → masih **oke**
- Icon di HP layar tajam (Samsung S23, Pixel, dll) → **agak buram kalau diperhatiin**
- Splash logo 220dp → **paling keliatan burem** karena paling besar tampilnya

**Ini bukan bisa diperbaiki dengan software.** Gambar kecil diperbesar = pasti pecah, kayak zoom foto CCTV di film — itu bohong. Detail yang gak ada di sumber, gak bisa dibikin ada.

**Solusi permanen:** minta file logo asli ke desainer lu — format **PNG minimal 1024×1024** atau **SVG/AI** (vector, bisa diperbesar sebebasnya). Kirim ke gw, 5 menit gw ganti semua.

**Sementara ini?** Pakai aja dulu. Mayoritas user gak bakal ngeh. Tapi kalau mau kelihatan profesional beneran, cari file aslinya.

### 3.6 Edit `MainActivity.java`
Cari bagian **⚙️ KONFIGURASI** di atas, ganti:
```java
public static final String API_BASE = "https://toko123apk.NAMAKAMU.workers.dev";
public static final String APP_KEY  = "tk123-app-key-x9f2";  // sama dengan worker.js
```

### 3.7 Sync & Build
1. Klik **Sync Now** (muncul di atas) → tunggu
2. Menu **Build** → **Build Bundle(s)/APK(s)** → **Build APK(s)**
3. Tunggu... muncul notif **locate** → klik → APK ada di:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```

### 3.8 Bikin APK Release (buat dibagi ke user)
> APK debug cuma buat tes. Buat dibagi, harus **ditandatangani**.

1. Menu **Build** → **Generate Signed Bundle / APK**
2. Pilih **APK** → Next
3. **Create new...** (kalau belum punya keystore):
   - Key store path: simpan di tempat aman, misal `D:\toko123.jks`
   - Password: bebas, **CATAT!**
   - Alias: `toko123`
   - Validity: `25` tahun
   - First and Last Name: `SirX`
   - OK
4. Next → pilih **release** → Create
5. APK jadi di `app/release/app-release.apk`

> 🔑 **JANGAN HILANGKAN FILE .jks + PASSWORDNYA!**
> Kalau hilang, lu **gak bisa update APK selamanya** — user harus uninstall dulu.
> Backup ke Google Drive / flashdisk.

---

# BAGIAN 4 — UPLOAD APK

Pakai GitHub Release (kayak EMAKBET/TOKO123 lu dulu):

1. Buka repo `demonnlord3-cmd/TOKO123`
2. **Releases** → **Draft a new release**
3. Tag: `v1.0` → Attach file `app-release.apk` → rename jadi `TOKO123.apk`
4. **Publish release**

Link permanen (selalu ambil yang terbaru):
```
https://github.com/demonnlord3-cmd/TOKO123/releases/latest/download/TOKO123.apk
```

⚠️ Ingat pelajaran lama: **pakai `/latest/`, jangan tag spesifik**. Dan **huruf besar/kecil nama file penting**.

Tombol download di website arahkan ke Worker (biar kehitung):
```html
<a href="https://toko123apk.NAMAKAMU.workers.dev/download">Download APK</a>
```

---

# BAGIAN 5 — CARA KIRIM NOTIF

1. Buka panel: `https://toko123apk.NAMAKAMU.workers.dev/admin`
2. Masukkan `ADMIN_KEY`
3. Klik tab **🔔 Kirim Notif**
4. Isi:
   - **Judul**: `🔥 MAXWIN LAGI GACOR!`
   - **Isi**: `Bonus New Member 100% cuma hari ini. Buruan klaim!`
   - **Link**: (opsional) kalau di-tap mau buka halaman tertentu
   - **Gambar**: (opsional) gambar besar di notif
   - **Kirim ke**: Semua / Online saja / Versi tertentu / Merk tertentu
5. Tekan **Kirim Notifikasi** → konfirmasi
6. Cek tab **Riwayat Notif** buat liat berapa yang berhasil

---

# 🔧 GANTI LINK TANPA UPDATE APK

Ini keunggulan utamanya:

**Cara 1 (paling gampang, gak usah sentuh code):**
Ganti tujuan dari **dashboard cutt.ly** lu. Selesai. APK otomatis ikut.

**Cara 2 (kalau cutt.ly bermasalah):**
Edit `TARGET_URL` di `worker.js` → `wrangler deploy`. Semua APK langsung pindah, **tanpa user install ulang**.

---

# 📢 CARA UPDATE APK

1. Di `build.gradle`, naikkan:
   ```gradle
   versionCode 2        // dari 1 jadi 2
   versionName "1.1"    // dari 1.0 jadi 1.1
   ```
2. Build Signed APK lagi (pakai keystore **yang sama**)
3. Upload ke GitHub Release baru
4. Di `worker.js` update:
   ```js
   LATEST_VERSION: "1.1",
   LATEST_CODE: 2,
   FORCE_UPDATE: false,   // true = user wajib update
   ```
5. `wrangler deploy`

User yang buka APK lama otomatis dapat **popup "Versi Baru Tersedia"**.

---

# ⚠️ MASALAH UMUM

| Masalah | Penyebab | Solusi |
|---|---|---|
| Notif gak nyampe | Package name beda dari Firebase | Cek `applicationId` di build.gradle = yang didaftarkan di Firebase |
| Notif gak nyampe | `google-services.json` salah taruh | Harus di folder `app/`, bukan root |
| Panel error "no_firebase" | Secret belum di-set | `wrangler secret put FIREBASE_SA_JSON` |
| Notif senyap (gak bunyi) | Channel ID beda | Sudah dicek konsisten: `toko123_promo` |
| Angka install tetap 0 | `API_BASE` salah | Cek URL Worker di MainActivity.java |
| Install 0 tapi download naik | `APP_KEY` beda | Samakan MainActivity.java ↔ worker.js |
| Build gagal "duplicate class" | Gradle project belum di-sync | File → Sync Project with Gradle Files |
| Android 13+ gak dapat notif | User tolak izin | Normal — panel hitung di kolom "Bisa Dinotif" |

---

# 💰 SOAL BIAYA

Pelajaran dari JepangQQ ($63/bulan) udah dipakai di sini:

- ✅ **Semua kolom di-index** — gak ada full table scan
- ✅ **Heartbeat 60 detik + berhenti pas app di-background** — hemat baterai & D1
- ✅ **Statistik di-cache 10 detik** — dashboard auto-refresh gak nembak DB terus
- ✅ **Query notif pakai index gabungan** `idx_notif_target`
- ✅ **Token mati otomatis diblok** — gak dikirim ulang selamanya
- ✅ **Firebase FCM gratis** tanpa batas jumlah notif

Kalau mau lebih hemat: naikkan `HEARTBEAT_SEC` di MainActivity.java jadi `120`.

---

# ⚡ RINGKASAN PERINTAH

```bash
# Worker
npm install -g wrangler
wrangler login
wrangler d1 create toko123apk
# copy database_id -> wrangler.toml
wrangler d1 execute toko123apk --file=schema.sql --remote
wrangler secret put FIREBASE_SA_JSON     # paste isi service-account.json
wrangler deploy

# Panel
https://toko123apk.NAMAKAMU.workers.dev/admin
```

---

## ✅ CHECKLIST SEBELUM BAGI KE USER

- [ ] `ADMIN_KEY` sudah diganti dari default
- [ ] `APP_KEY` sudah diganti & **sama** di worker.js + MainActivity.java
- [ ] `API_BASE` di MainActivity.java = URL Worker beneran
- [ ] `google-services.json` ada di folder `app/`
- [ ] Package name `com.toko123.app` sama di Firebase + build.gradle
- [ ] Secret `FIREBASE_SA_JSON` sudah di-set
- [ ] Test install di HP sendiri → cek panel angkanya naik
- [ ] Test kirim notif ke diri sendiri → **tutup APK dulu**, pastikan nongol
- [ ] File `.jks` + password sudah di-backup
