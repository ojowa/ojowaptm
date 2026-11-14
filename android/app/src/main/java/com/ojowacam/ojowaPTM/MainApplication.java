package com.ojowacam.ojowaPTM;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.ojowacam.ojowaPTM.AudioMicPackage;

public class MainApplication extends Application implements ReactApplication {

    @Override
    public void onCreate() {
        super.onCreate();
    }

    @Override
    protected ReactNativeHost createReactNativeHost() {
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