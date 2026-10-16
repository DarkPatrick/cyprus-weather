package io.github.darkpatrick.kairo;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // No stretch (Android 12+) or glow when a scroll hits its end.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
