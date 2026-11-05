package ca.chezmaxo.pinandspin.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Pin & Spin TV: a full-screen window onto the game's TV page (/tv), which shows a
 * 4-letter code to connect the TV to a room from a phone. All game logic lives on the
 * website, so the app never needs updating for game changes.
 */
public class MainActivity extends Activity {
    private static final String OFFLINE_PAGE =
        "<html><body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;"
        + "justify-content:center;background:#120d24;color:#fff;font-family:sans-serif;text-align:center'>"
        + "<h1 style='font-size:6vh;margin:0 0 2vh'>Pin &amp; Spin TV</h1>"
        + "<p style='font-size:3.2vh;color:#c9bde0;max-width:70vw;line-height:1.5'>Can't reach the internet.<br>"
        + "Check the TV's Wi-Fi. Trying again automatically&hellip;</p></body></html>";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private String host;
    private boolean offline;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        host = Uri.parse(BuildConfig.TV_URL).getHost();

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(18, 13, 36));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                 // keeps this TV's pairing token
        settings.setMediaPlaybackRequiresUserGesture(false); // sound without pressing a button
        // Lets the website know it runs inside the TV app (hides the "Start sound" button).
        settings.setUserAgentString(settings.getUserAgentString() + " PlayVoltTV/" + BuildConfig.VERSION_NAME);
        web.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Stay on the game site; ignore links to anywhere else.
                return !host.equals(Uri.parse(url).getHost());
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String url) {
                showOffline();
            }
        });
        setContentView(web);
        web.requestFocus();
        if (saved == null) web.loadUrl(BuildConfig.TV_URL);
        else web.restoreState(saved);
    }

    private void showOffline() {
        offline = true;
        web.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::retry, 5000);
    }

    private void retry() {
        offline = false;
        web.loadUrl(BuildConfig.TV_URL);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (offline && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
            handler.removeCallbacksAndMessages(null);
            retry();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
