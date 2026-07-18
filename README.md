# TOKO123 APK — Paket Lengkap

APK WebView + Tracking Online/Offline + Notif Push, dibangun via **GitHub Actions** (tanpa Android Studio).

## 📂 Isi

| Folder/File | Fungsi |
|---|---|
| `app/` | Source code APK (Java + resource + logo) |
| `.github/workflows/build.yml` | 🤖 Robot yang bikin APK otomatis |
| `worker/` | Server Cloudflare (panel admin + notif) |
| `docs/TUTORIAL.md` | Tutorial lengkap semua bagian |
| `CARA-GITHUB.md` | ⭐ **MULAI DARI SINI** — cara build APK di GitHub |
| `BIKIN-KEYSTORE.sh` | Skrip bikin kunci tanda tangan APK |

## 🚀 Mulai

1. Baca **`CARA-GITHUB.md`** → build APK
2. Baca **`docs/TUTORIAL.md`** bagian Worker → deploy panel + notif

## ⚠️ Jangan commit file rahasia
`google-services.json`, `*.jks`, dan `*.apk` sudah diblok `.gitignore`.
File rahasia dimasukkan lewat **GitHub Secrets**, bukan repo.
