# 🚀 BIKIN APK TOKO123 LEWAT GITHUB (TANPA ANDROID STUDIO)

GitHub bakal "manggang" APK-nya sendiri di awan. Laptop lu gak install apa-apa.

---

## GAMBARAN ALUR

```
1. Upload folder ini ke GitHub          (5 menit)
2. Bikin Firebase + ambil 2 file        (5 menit)
3. Bikin keystore (kunci tanda tangan)  (3 menit)
4. Isi 5 Secret di GitHub               (3 menit)
5. Push tag v1.0  ->  APK jadi otomatis (tunggu ~5 menit)
6. Download APK dari Release  ✅
```

Total sekali setup ~20 menit. Setelah itu, tiap update tinggal push tag → APK baru otomatis.

---

# LANGKAH 1 — FIREBASE (kurir notif)

> Wajib. Tanpa ini notif push gak jalan. Gratis.

1. Buka **https://console.firebase.google.com** → **Add project**
2. Nama: `toko123-apk` → matikan Google Analytics → **Create project**
3. Klik **ikon Android** → **Android package name**: ketik persis:
   ```
   com.toko123.app
   ```
4. **Register app** → **Download google-services.json** → simpan filenya
5. ⚙️ **Project settings** → tab **Service accounts** → **Generate new private key** → simpan file `.json`-nya (yang panjang, buat Worker nanti)

Sekarang lu punya **2 file** dari Firebase:
- `google-services.json` (buat APK)
- file service account `.json` (buat Worker)

---

# LANGKAH 2 — UPLOAD KE GITHUB

### 2a. Bikin repo baru
1. Buka **https://github.com/new**
2. Repository name: `TOKO123-APK` (bebas)
3. Pilih **Private** (biar orang gak liat code lu)
4. **Create repository**

### 2b. Upload folder
**Cara paling gampang (lewat web, gak pakai Git):**
1. Di halaman repo kosong, klik **uploading an existing file**
2. **Seret semua isi folder** `tk123-gh` ke situ (jangan foldernya, tapi isinya)
3. Scroll bawah → **Commit changes**

> ⚠️ Pastikan yang keupload itu **isi** folder: `app/`, `.github/`, `build.gradle`, `gradlew`, dll — bukan folder `tk123-gh`-nya sendiri.

> 📌 **PENTING:** file `google-services.json` **JANGAN diupload** lewat sini (rahasia).
> Nanti dimasukkan lewat Secret di langkah 4.

---

# LANGKAH 3 — BIKIN KEYSTORE (kunci tanda tangan)

APK harus "ditandatangani" biar bisa diinstall. Ibarat **tanda tangan basah** di dokumen — bukti APK asli dari lu.

### Cara termudah (pakai HP/laptop yang ada Java):

**Kalau punya Termux (HP) atau Git Bash (laptop):**
```bash
bash BIKIN-KEYSTORE.sh
```
Ikutin pertanyaannya. Selesai, dapat 2 file: `toko123.jks` + `toko123_base64.txt`.

**Kalau gak ada Java sama sekali** — pakai website online keystore generator, ATAU minta bantuan yang punya laptop. Yang penting hasilnya:
- File `.jks`
- Password-nya
- Alias (isi: `toko123`)

### Ubah keystore ke Base64 (biar muat di GitHub Secret)

Kalau skrip di atas jalan, udah otomatis ada `toko123_base64.txt`.

Kalau manual, di Git Bash / Termux:
```bash
base64 toko123.jks | tr -d '\n' > toko123_base64.txt
```
Isi file `toko123_base64.txt` itu yang nanti ditempel ke Secret.

> 🔑 **BACKUP `toko123.jks` + PASSWORD KE GOOGLE DRIVE SEKARANG!**
> Hilang = lu **gak bisa update APK selamanya**, user harus uninstall dulu.

---

# LANGKAH 4 — ISI SECRET DI GITHUB

Secret = brankas rahasia. Isinya gak keliatan orang, tapi robot build bisa pakai.

1. Di repo, klik **Settings** → kiri bawah **Secrets and variables** → **Actions**
2. Klik **New repository secret**, bikin **5 secret** ini satu-satu:

| Nama Secret | Isinya |
|---|---|
| `GOOGLE_SERVICES_JSON` | **Seluruh isi** file `google-services.json` (buka Notepad, Ctrl+A, Ctrl+C, paste) |
| `KEYSTORE_BASE64` | **Seluruh isi** file `toko123_base64.txt` |
| `KEYSTORE_PASSWORD` | Password keystore lu |
| `KEY_ALIAS` | `toko123` |
| `KEY_PASSWORD` | Password keystore lu (sama dengan di atas) |

> 💡 Untuk `GOOGLE_SERVICES_JSON` dan `KEYSTORE_BASE64`: paste **isi filenya**, bukan nama file.

---

# LANGKAH 5 — JALANKAN BUILD (push tag)

Robot jalan kalau ada **tag versi**. Cara bikin tag lewat web:

1. Di repo, klik **Releases** (kanan) → **Create a new release**
2. **Choose a tag** → ketik `v1.0` → **Create new tag: v1.0 on publish**
3. Judul: `TOKO123 v1.0`
4. **Publish release**

Begitu di-publish, robot **otomatis jalan**. Cek di tab **Actions** — ada proses "Build TOKO123 APK" muter.

Tunggu ~5 menit sampai centang **hijau ✅**.

---

# LANGKAH 6 — AMBIL APK

Setelah build hijau:
1. Buka **Releases** → klik `v1.0`
2. Di bagian **Assets**, ada file **`TOKO123.apk`** — itu APK jadi lu!

**Link download permanen** (buat tombol di website):
```
https://github.com/USERNAME/TOKO123-APK/releases/latest/download/TOKO123.apk
```
Ganti `USERNAME` dengan username GitHub lu.

> Ingat pelajaran lama: pakai **`/latest/`**, huruf besar/kecil nama file **penting**.

Tombol download di website arahkan ke Worker (biar kehitung):
```html
<a href="https://toko123apk.NAMAKAMU.workers.dev/download">Download APK</a>
```
(worker/CONFIG diarahkan ke link GitHub di atas)

---

# 📢 CARA UPDATE APK (nanti)

1. Edit `app/build.gradle` di web GitHub (klik file → ikon pensil):
   ```gradle
   versionCode 2        // dari 1 jadi 2
   versionName "1.1"    // dari 1.0 jadi 1.1
   ```
   Commit.
2. Bikin Release baru dengan tag `v1.1` → **Publish**
3. Robot build lagi → APK `v1.1` masuk Release otomatis

Keystore-nya **otomatis kepakai lagi** (dari Secret), jadi user bisa update tanpa uninstall. ✅

---

# 🔧 KALAU BUILD GAGAL (merah ❌)

Klik tab **Actions** → klik yang merah → baca step mana yang gagal:

| Gagal di step | Penyebab | Solusi |
|---|---|---|
| "Siapkan google-services.json" | Secret kosong/salah | Cek `GOOGLE_SERVICES_JSON` = isi file lengkap |
| "Build APK" + error package | Package name Firebase beda | Firebase harus `com.toko123.app` |
| "Siapkan keystore" | Base64 rusak | Bikin ulang, pastikan `tr -d '\n'` |
| "Sign APK" | Password/alias salah | Cek `KEYSTORE_PASSWORD` & `KEY_ALIAS` |
| Gradle error lain | — | Screenshot lognya, kirim ke gw |

---

# ✅ CHECKLIST

- [ ] Firebase project dibuat, package `com.toko123.app`
- [ ] Isi folder ini keupload ke GitHub (bukan foldernya)
- [ ] `google-services.json` **tidak** keupload ke repo (masuk Secret aja)
- [ ] Keystore dibuat + di-backup ke Drive
- [ ] 5 Secret terisi
- [ ] Push tag `v1.0`
- [ ] Build hijau ✅
- [ ] `TOKO123.apk` muncul di Release

---

## ⏭️ SETELAH APK JADI

Jangan lupa **Worker + panel** juga harus di-deploy biar tracking & notif jalan.
Lihat tutorial `TUTORIAL.md` bagian **BAGIAN 2 — WORKER**.

Alur lengkapnya:
1. ✅ APK jadi (langkah di atas)
2. Deploy Worker → dapat URL + panel admin
3. Edit `API_BASE` di `MainActivity.java` = URL Worker → build ulang (push tag)
4. Kirim notif dari panel 🔔
