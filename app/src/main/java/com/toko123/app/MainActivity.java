package com.toko123.app;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TOKO123 — WebView App + Device Tracker + Push Notification
 *
 * Alur:
 *  1. Buka app -> ambil/buat Device ID (permanen)
 *  2. Ambil FCM Token dari Firebase ("nomor HP" buat notif)
 *  3. Kirim ke Worker (/api/register) -> dapat balasan target_url
 *  4. Buka target_url di WebView (link dari Worker, bisa diganti kapan aja)
 *  5. Kirim heartbeat tiap 60 detik selama app terbuka
 */
public class MainActivity extends AppCompatActivity {

    // ====================== ⚙️ KONFIGURASI ======================
    // GANTI dengan alamat Worker kamu:
    public static final String API_BASE = "https://notif.apktoko123.workers.dev";
    // Harus SAMA dengan CONFIG.APP_KEY di worker.js:
    public static final String APP_KEY  = "tk123-app-key-x9f2";
    // Link cadangan kalau server tidak bisa dihubungi:
    public static final String FALLBACK_URL = "https://cutt.ly/Toko123_Gacor";
    // Kirim denyut tiap berapa detik:
    private static final int HEARTBEAT_SEC = 60;
    // ============================================================

    private static final String PREF = "toko123_pref";
    private static final String K_DEVICE_ID = "device_id";

    private WebView web;
    private SwipeRefreshLayout swipe;
    private View splash;

    private String deviceId;
    private String fcmToken = "";
    private String targetUrl = FALLBACK_URL;
    private boolean firstLoadDone = false;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(2);
    private Runnable heartbeatTask;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.webview);
        swipe = findViewById(R.id.swipe);
        splash = findViewById(R.id.splash);

        createNotifChannel();
        askNotifPermission();

        deviceId = getOrCreateDeviceId();

        setupWebView();
        setupBackButton();

        swipe.setColorSchemeColors(0xFF2FF3D0);
        swipe.setOnRefreshListener(() -> web.reload());

        // Jarak tarik minimum lebih jauh biar gak sensitif (tarik pelan gak refresh).
        // Default ~64dp, kita naikin biar harus ditarik lebih jauh.
        int density = (int) getResources().getDisplayMetrics().density;
        swipe.setDistanceToTriggerSync(140 * density); // ~140dp, harus tarik jauh

        // Swipe-refresh CUMA aktif kalau halaman bener-bener di paling ATAS (scrollY==0).
        // Pas lagi scroll di tengah/bawah -> swipe dimatikan -> gak akan ke-refresh.
        web.getViewTreeObserver().addOnScrollChangedListener(() -> {
            // web.getScrollY()==0 artinya udah mentok di paling atas
            swipe.setEnabled(web.getScrollY() == 0);
        });

        // Ambil FCM token dulu, baru register
        fetchFcmTokenThenRegister();
    }

    /* ---------------- DEVICE ID (permanen, tidak hilang walau clear cache) ---------------- */
    private String getOrCreateDeviceId() {
        SharedPreferences sp = getSharedPreferences(PREF, MODE_PRIVATE);
        String id = sp.getString(K_DEVICE_ID, null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            sp.edit().putString(K_DEVICE_ID, id).apply();
        }
        return id;
    }

    /* ---------------- FCM TOKEN ---------------- */
    private void fetchFcmTokenThenRegister() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                fcmToken = task.getResult();
            }
            // register jalan walau token gagal (biar tetap kehitung install)
            pool.execute(this::register);
        });
    }

    /* ---------------- REGISTER ke Worker ---------------- */
    private void register() {
        try {
            JSONObject j = new JSONObject();
            j.put("device_id", deviceId);
            j.put("fcm_token", fcmToken);
            j.put("apk_version", getAppVersionName());
            j.put("apk_code", getAppVersionCode());
            j.put("android_version", Build.VERSION.RELEASE);
            j.put("sdk_int", Build.VERSION.SDK_INT);
            j.put("brand", capitalize(Build.MANUFACTURER));
            j.put("model", Build.MODEL);
            j.put("notif_enabled", notifEnabled());
            j.put("app_key", APP_KEY);

            String resp = post("/api/register", j.toString());
            if (resp != null) {
                JSONObject r = new JSONObject(resp);
                if (r.optBoolean("ok", false)) {
                    String t = r.optString("target_url", "");
                    if (!t.isEmpty()) targetUrl = t;

                    // cek update
                    int latest = r.optInt("latest_code", 0);
                    boolean force = r.optBoolean("force_update", false);
                    String upUrl = r.optString("update_url", "");
                    if (latest > getAppVersionCode() && !upUrl.isEmpty()) {
                        ui.post(() -> showUpdateDialog(upUrl, force));
                    }
                }
            }
        } catch (Exception ignored) {
        }
        // Buka web (pakai targetUrl dari server, atau fallback)
        ui.post(this::loadTarget);
        startHeartbeat();
    }

    private void loadTarget() {
        if (!firstLoadDone) {
            web.loadUrl(targetUrl);
            firstLoadDone = true;
        }
    }

    /* ---------------- HEARTBEAT (denyut online) ---------------- */
    private void startHeartbeat() {
        if (heartbeatTask != null) return;
        heartbeatTask = new Runnable() {
            @Override public void run() {
                pool.execute(() -> {
                    try {
                        JSONObject j = new JSONObject();
                        j.put("device_id", deviceId);
                        j.put("app_key", APP_KEY);
                        post("/api/heartbeat", j.toString());
                    } catch (Exception ignored) {}
                });
                ui.postDelayed(this, HEARTBEAT_SEC * 1000L);
            }
        };
        ui.post(heartbeatTask);
    }

    private void stopHeartbeat() {
        if (heartbeatTask != null) ui.removeCallbacks(heartbeatTask);
        heartbeatTask = null;
    }

    /* ---------------- HTTP POST ---------------- */
    private String post(String path, String body) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(API_BASE + path);
            c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("X-App-Key", APP_KEY);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) return null;
            java.io.InputStream is = c.getInputStream();
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /* ---------------- WEBVIEW ---------------- */
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // localStorage jalan
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String url = req.getUrl().toString();
                // Link luar (WA / Telegram / tel / mailto) -> buka app aslinya
                if (url.startsWith("whatsapp:") || url.startsWith("tg:") || url.startsWith("mailto:")
                        || url.startsWith("tel:") || url.startsWith("intent:")
                        || url.contains("wa.me") || url.contains("api.whatsapp.com")
                        || url.contains("t.me") || url.contains("telegram.me")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Aplikasi tidak terpasang", Toast.LENGTH_SHORT).show();
                        return true;
                    }
                }
                return false; // sisanya tetap di dalam app
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap f) {
                swipe.setRefreshing(true);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                swipe.setRefreshing(false);
                if (splash.getVisibility() == View.VISIBLE) {
                    splash.animate().alpha(0f).setDuration(350)
                            .withEndAction(() -> splash.setVisibility(View.GONE)).start();
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String o, GeolocationPermissions.Callback cb) {
                cb.invoke(o, false, false);
            }
            @Override
            public void onPermissionRequest(PermissionRequest r) {
                r.deny();
            }
        });
    }

    /* ---------------- TOMBOL BACK ---------------- */
    private void setupBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            long lastPress = 0;
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();   // balik halaman, bukan keluar app
                } else {
                    long now = System.currentTimeMillis();
                    if (now - lastPress < 2000) {
                        finish();   // tekan 2x buat keluar
                    } else {
                        lastPress = now;
                        Toast.makeText(MainActivity.this, "Tekan sekali lagi untuk keluar", Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });
    }

    /* ---------------- NOTIF CHANNEL & IZIN ---------------- */
    private void createNotifChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    "toko123_promo", "Promo & Info", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Info promo, bonus, dan link terbaru");
            ch.enableVibration(true);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void askNotifPermission() {
        // Android 13+ wajib minta izin notif
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int rc, @NonNull String[] p, @NonNull int[] g) {
        super.onRequestPermissionsResult(rc, p, g);
        if (rc == 101) pool.execute(this::register); // update status izin ke server
    }

    private boolean notifEnabled() {
        try {
            return androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled();
        } catch (Exception e) {
            return true;
        }
    }

    /* ---------------- POPUP UPDATE ---------------- */
    private void showUpdateDialog(String url, boolean force) {
        if (isFinishing()) return;
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Versi Baru Tersedia")
                .setMessage(force
                        ? "Ada versi baru. Kamu harus update dulu untuk melanjutkan."
                        : "Ada versi baru dengan perbaikan. Update sekarang?")
                .setPositiveButton("Update", (d, w) -> {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    if (force) finish();
                })
                .setCancelable(!force);
        if (!force) b.setNegativeButton("Nanti", null);
        b.show();
    }

    /* ---------------- UTIL ---------------- */
    private String getAppVersionName() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            return p.versionName == null ? "1.0" : p.versionName;
        } catch (Exception e) { return "1.0"; }
    }

    private int getAppVersionCode() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= 28) return (int) p.getLongVersionCode();
            return p.versionCode;
        } catch (Exception e) { return 1; }
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase();
    }

    /* ---------------- LIFECYCLE ---------------- */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotifClick(intent);
    }

    private void handleNotifClick(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        String url = intent.getStringExtra("click_url");
        if (url != null && !url.isEmpty() && web != null) {
            web.loadUrl(url);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        startHeartbeat();
        handleNotifClick(getIntent());
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        stopHeartbeat();  // hemat baterai & hemat biaya D1
    }

    @Override
    protected void onDestroy() {
        stopHeartbeat();
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
