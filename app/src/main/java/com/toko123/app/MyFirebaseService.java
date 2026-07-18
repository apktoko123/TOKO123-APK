package com.toko123.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Ini "penjaga" yang tetap hidup walau APK ketutup.
 * Firebase manggil kelas ini tiap ada notif masuk.
 */
public class MyFirebaseService extends FirebaseMessagingService {

    private static final String CHANNEL = "toko123_promo";

    /* ---- Notif masuk (app ketutup pun tetap kena) ---- */
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        String title = "TOKO123";
        String body = "";
        String clickUrl = "";
        String image = "";

        if (msg.getNotification() != null) {
            if (msg.getNotification().getTitle() != null) title = msg.getNotification().getTitle();
            if (msg.getNotification().getBody() != null) body = msg.getNotification().getBody();
            if (msg.getNotification().getImageUrl() != null) image = msg.getNotification().getImageUrl().toString();
        }
        if (msg.getData() != null) {
            if (msg.getData().containsKey("click_url")) clickUrl = msg.getData().get("click_url");
            if (msg.getData().containsKey("image") && (image == null || image.isEmpty()))
                image = msg.getData().get("image");
            if (msg.getData().containsKey("title") && msg.getNotification() == null)
                title = msg.getData().get("title");
            if (msg.getData().containsKey("body") && msg.getNotification() == null)
                body = msg.getData().get("body");
        }
        show(title, body, clickUrl, image);
    }

    /* ---- Token berubah -> kabarin server biar notif tetap nyampe ---- */
    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        SharedPreferences sp = getSharedPreferences("toko123_pref", Context.MODE_PRIVATE);
        String deviceId = sp.getString("device_id", null);
        if (deviceId == null) return;

        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                JSONObject j = new JSONObject();
                j.put("device_id", deviceId);
                j.put("fcm_token", token);
                j.put("app_key", MainActivity.APP_KEY);

                URL u = new URL(MainActivity.API_BASE + "/api/token");
                c = (HttpURLConnection) u.openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setRequestProperty("X-App-Key", MainActivity.APP_KEY);
                c.getOutputStream().write(j.toString().getBytes("UTF-8"));
                c.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    /* ---- Tampilkan notif ---- */
    private void show(String title, String body, String clickUrl, String imageUrl) {
        createChannel();

        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (clickUrl != null && !clickUrl.isEmpty()) i.putExtra("click_url", clickUrl);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), i, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(pi)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

        // Gambar besar (kalau ada)
        if (imageUrl != null && !imageUrl.isEmpty()) {
            Bitmap bmp = downloadImage(imageUrl);
            if (bmp != null) {
                b.setLargeIcon(bmp);
                b.setStyle(new NotificationCompat.BigPictureStyle()
                        .bigPicture(bmp)
                        .bigLargeIcon((Bitmap) null)
                        .setSummaryText(body));
            }
        }

        try {
            NotificationManagerCompat.from(this)
                    .notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (SecurityException ignored) {
            // user matiin izin notif
        }
    }

    private Bitmap downloadImage(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setDoInput(true);
            c.connect();
            InputStream is = c.getInputStream();
            return BitmapFactory.decodeStream(is);
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL, "Promo & Info", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Info promo, bonus, dan link terbaru");
            ch.enableVibration(true);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
