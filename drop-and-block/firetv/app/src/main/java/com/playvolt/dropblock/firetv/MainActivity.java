package com.playvolt.dropblock.firetv;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.graphics.Color;

/**
 * Dedicated, read-only PlayVolt TV display shell for compatible Fire OS sticks.
 * No player credentials, secret keys, account data, or payments are bundled.
 * Anonymous TV access requires the host's expiring one-use pairing PIN.
 * The live display is served via HTTPS and can update without reinstalling.
 */
public final class MainActivity extends Activity {
    private static final String ORIGIN =
        "https://playvolt-drop-and-block.pages.dev";
    private static final String PAIR_URL = ORIGIN + "/?tv-connect=1";
    private static final String PREFS = "playvolt_firetv";
    private static final String TV_URL = "active_tv_url";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 13, 30));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAllowed(request.getUrl().toString());
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (isAllowed(url) && url.contains("?tv=") && url.contains("#")) {
                    // TV capability stays in this device's private app storage.
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(TV_URL,url).apply();
                }
            }
        });
        setContentView(webView);
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            String lastUrl = getSharedPreferences(PREFS, MODE_PRIVATE).getString(TV_URL,PAIR_URL);
            webView.loadUrl(isAllowed(lastUrl) ? lastUrl : PAIR_URL);
        }
        webView.requestFocus();
    }

    private boolean isAllowed(String url) {
        return url != null && (url.equals(ORIGIN) || url.startsWith(ORIGIN + "/"));
    }

    @Override
    public void onBackPressed() {
        // TV remote BACK returns to pairing rather than to a stale secret URL.
        if (webView != null && !PAIR_URL.equals(webView.getUrl())) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(TV_URL).apply();
            webView.loadUrl(PAIR_URL);
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (webView != null) webView.saveState(state);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
