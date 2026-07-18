#!/usr/bin/env bash
# =============================================================
#  BIKIN KEYSTORE (kunci tanda tangan APK) + ubah ke Base64
#  Jalankan sekali. Butuh Java (keytool) — biasanya udah ada.
#  Cek: ketik "keytool" di terminal. Kalau ada, lanjut.
# =============================================================
set -e

echo "=============================================="
echo "  BIKIN KUNCI TANDA TANGAN APK - TOKO123"
echo "=============================================="
echo ""

# Nilai default (boleh diganti)
KS_FILE="toko123.jks"
ALIAS="toko123"

read -p "Password keystore (CATAT baik-baik!): " KS_PASS
echo ""
read -p "Nama kamu (bebas, mis: SirX): " CN

# Bikin keystore (berlaku ~27 tahun)
keytool -genkeypair \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -keystore "$KS_FILE" \
  -storepass "$KS_PASS" \
  -keypass "$KS_PASS" \
  -dname "CN=$CN, OU=TOKO123, O=TOKO123, L=Jakarta, ST=DKI, C=ID"

echo ""
echo "✅ Keystore dibuat: $KS_FILE"
echo ""

# Ubah ke Base64 (biar bisa ditempel ke GitHub Secret)
if command -v base64 >/dev/null 2>&1; then
  base64 "$KS_FILE" | tr -d '\n' > toko123_base64.txt
  echo "✅ Base64 dibuat: toko123_base64.txt"
fi

echo ""
echo "=============================================="
echo "  ISI GITHUB SECRETS (Settings > Secrets > Actions)"
echo "=============================================="
echo "  KEYSTORE_BASE64     = (isi file toko123_base64.txt)"
echo "  KEYSTORE_PASSWORD   = $KS_PASS"
echo "  KEY_ALIAS           = $ALIAS"
echo "  KEY_PASSWORD        = $KS_PASS"
echo ""
echo "⚠️  SIMPAN $KS_FILE + password di tempat AMAN (Google Drive)."
echo "    Hilang = TIDAK BISA update APK selamanya!"
echo "=============================================="
