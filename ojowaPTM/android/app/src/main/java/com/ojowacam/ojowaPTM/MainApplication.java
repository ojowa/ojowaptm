package com.ojowacam.ojowaPTM;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.soloader.SoLoader;
import com.ojowacam.ojowaPTM.AudioMicPackage;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

    @Override
    public void onCreate() {
        super.onCreate();
        SoLoader.init(this, false);
    }

    @Override
    public ReactNativeHost getReactNativeHost() {
        return new ReactNativeHost(this) {
            @Override
            public boolean getUseDeveloperSupport() {
                return BuildConfig.DEBUG;
            }

            @Override
            protected List<ReactPackage> getPackages() {
                @SuppressWarnings("UnnecessaryLocalVariable")
                final List<ReactPackage> packages = new PackageList(this).getPackages();
                packages.add(new AudioMicPackage());
                return packages;
            }

            @Override
            public String getJSMainModuleName() {
                return "index";
            }
        };
    }
}