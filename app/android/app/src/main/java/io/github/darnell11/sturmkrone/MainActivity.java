package io.github.darnell11.sturmkrone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Sturmkrone als Android-App: eine Vollbild-Webansicht (dieselbe Chrome-Technik wie der Browser), die genau das Spiel
 * von der Webseite lädt. So ist es 1:1 dasselbe Spiel, aktualisiert sich selbst und läuft nach dem ersten Start auch
 * ohne Internet (der Offline-Speicher des Spiels liegt in der App).
 */
public class MainActivity extends Activity {

    static final String GAME_URL = BuildConfig.GAME_URL;
    static final Uri GAME = Uri.parse(GAME_URL);
    static final String OFFLINE_URL = "file:///android_asset/offline.html";
    static final int REQ_SAVE = 1, REQ_OPEN = 2;

    WebView web;
    String pendingSave;
    ValueCallback<Uri[]> pendingOpen;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 26, 42));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " SturmkroneApp/1.0 (Android)");

        web.addJavascriptInterface(new Bridge(), "SturmApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        // Immer frisch laden: das Spiel speichert selbst, ein wiederhergestellter Zwischenstand der Webansicht kann leer sein
        web.loadUrl(GAME_URL);
    }

    static boolean inGame(Uri u) {
        if (u == null) return false;
        if ("file".equals(u.getScheme())) return true;
        String p = u.getPath() == null ? "" : u.getPath();
        return GAME.getScheme().equals(u.getScheme()) && GAME.getHost().equals(u.getHost()) && GAME.getPort() == u.getPort()
            && p.startsWith(GAME.getPath());
    }

    void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
    }

    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (inGame(u)) return false;
            // Links nach außen (z. B. Downloads oder Webseiten) im normalen Browser öffnen
            openExternal(u);
            return true;
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            // Ohne Internet und ohne Offline-Speicher (allererster Start): freundliche Seite statt Fehlermeldung
            if (r.isForMainFrame() && !r.getUrl().toString().startsWith("file:")) v.loadUrl(OFFLINE_URL);
        }
    }

    class Chrome extends WebChromeClient {
        // Spielstand importieren: Dateiauswahl von Android öffnen
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (pendingOpen != null) pendingOpen.onReceiveValue(null);
            pendingOpen = cb;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            try {
                startActivityForResult(i, REQ_OPEN);
            } catch (ActivityNotFoundException e) {
                pendingOpen = null;
                return false;
            }
            return true;
        }
    }

    /** Für das Spiel unter window.SturmApp erreichbar */
    class Bridge {
        // Spielstand exportieren: Android fragt, wo die Datei gespeichert werden soll
        @JavascriptInterface
        public void saveFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSave = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE); } catch (ActivityNotFoundException e) { pendingSave = null; }
            });
        }

        // Spiel teilen: Teilen-Menü von Android (WhatsApp, Telegram …)
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Sturmkrone teilen"));
            });
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
        if (req == REQ_OPEN) {
            if (pendingOpen != null) pendingOpen.onReceiveValue(u == null ? null : new Uri[] { u });
            pendingOpen = null;
        } else if (req == REQ_SAVE) {
            String text = pendingSave;
            pendingSave = null;
            if (u == null || text == null) return;
            try (OutputStream o = getContentResolver().openOutputStream(u)) {
                if (o != null) o.write(text.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Spielstand gespeichert", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Speichern fehlgeschlagen", Toast.LENGTH_LONG).show();
            }
        }
    }

    // Zurück-Taste von Android = Esc im Spiel (Pause, Menü zurück)
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            if (web.getUrl() != null && web.getUrl().startsWith("file:")) { finish(); return true; }
            web.evaluateJavascript(
                "(function(){var t=document.activeElement||document.body;" +
                "['keydown','keyup'].forEach(function(n){t.dispatchEvent(new KeyboardEvent(n,{key:'Escape',code:'Escape',keyCode:27,bubbles:true}));});})()",
                null);
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    /** Echtes Vollbild: Status- und Navigationsleiste ausblenden, mit Wischen vom Rand kurz einblendbar */
    @SuppressWarnings("deprecation")
    void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        immersive();
    }

    @Override
    protected void onDestroy() {
        if (web.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
