# Domin8 Mobile App

This document explains the mobile app setup using Capacitor, which wraps the web app into a native Android (and optionally iOS) application.

## Overview

Domin8 uses **Capacitor** to create native mobile apps from the existing web app. This provides:

- Native app store distribution (Google Play Store)
- Better wallet integration (Phantom deep links)
- Push notifications when app is closed
- Native status bar integration
- App lifecycle management (pause sounds when minimized)

## Architecture

```
┌─────────────────────────────────────────┐
│           Native Shell (Capacitor)       │
│  ┌─────────────────────────────────────┐ │
│  │         WebView (Android/iOS)       │ │
│  │  ┌─────────────────────────────────┐│ │
│  │  │      Domin8 Web App (Vite)     ││ │
│  │  │  - React + TypeScript          ││ │
│  │  │  - Phaser.js Game Engine       ││ │
│  │  │  - Privy Wallet                ││ │
│  │  │  - Convex Backend              ││ │
│  │  └─────────────────────────────────┘│ │
│  └─────────────────────────────────────┘ │
│                                          │
│  Native Features:                        │
│  - @capacitor/app (deep links)          │
│  - @capacitor/status-bar                │
│  - @capacitor/browser (OAuth)           │
│  - @capacitor/haptics                   │
└─────────────────────────────────────────┘
```

## Project Structure

```
domin8/
├── android/                    # Android native project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml   # Deep links config
│   │   │   ├── assets/public/        # Built web app (synced)
│   │   │   └── java/.../MainActivity.java
│   │   └── build/outputs/apk/        # Generated APKs
│   └── build.gradle
├── capacitor.config.ts         # Capacitor configuration
├── src/
│   ├── hooks/
│   │   ├── useDeepLinks.ts     # Handle Phantom wallet callbacks
│   │   └── useAppLifecycle.ts  # Pause/resume sounds
│   └── utils/
│       └── statusBar.ts        # Native status bar config
└── dist/                       # Built web app
```

## Commands

### Development

```bash
# Run web app only (for development)
bun run dev

# Build web app
bun run build
```

### Mobile Build

```bash
# Build web + sync to Android
bun run cap:build

# Just sync changes (after web build)
bun run cap:sync

# Open Android Studio
bun run cap:android

# Run on connected Android device (requires ADB)
bun run cap:run:android
```

### Building APK

1. Run `bun run cap:build` to build and sync
2. Run `bun run cap:android` to open Android Studio
3. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Building for Play Store (Signed Release)

1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Create or select a keystore
3. Choose **APK** or **Android App Bundle (AAB)**
4. Build release version

## Features

### 1. Deep Links (Phantom Wallet)

The app handles deep links for Phantom wallet integration:

- **Custom scheme:** `domin8://` - For wallet callbacks
- **App links:** `https://domin8.fun/*` - Universal links

Configuration in `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Deep Links for Phantom Wallet -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="domin8" />
</intent-filter>
```

### 2. Status Bar

The status bar is configured to:
- Use dark style (light text)
- Black background matching the app
- Not overlay content (content appears below status bar)

Configuration in `src/utils/statusBar.ts`:

```typescript
await StatusBar.setStyle({ style: Style.Dark });
await StatusBar.setBackgroundColor({ color: "#000000" });
await StatusBar.setOverlaysWebView({ overlay: false });
```

### 3. App Lifecycle (Sound Management)

Sounds automatically pause when the app is minimized and resume when foregrounded.

Handled in `src/hooks/useAppLifecycle.ts`:

```typescript
App.addListener("appStateChange", (state) => {
  if (state.isActive) {
    SoundManager.resumeAll();
  } else {
    SoundManager.pauseAll();
  }
});
```

### 4. Push Notifications

Push notifications work even when the app is closed:

- Service worker handles push events
- Notifications show "New game started!"
- Tapping notification opens the app

See `src/sw.ts` for the push notification handler.

## Environment Variables

### Web (Vercel)

```env
VITE_VAPID_PUBLIC_KEY=your_public_key
```

### Backend (Convex)

```env
VITE_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

## Platform Checks

The app detects the platform and only runs native code on mobile:

```typescript
import { Capacitor } from "@capacitor/core";

if (Capacitor.isNativePlatform()) {
  // Only runs on Android/iOS
}

// Get platform: "ios" | "android" | "web"
const platform = Capacitor.getPlatform();
```

## Testing

### On Physical Device

1. Build APK: `bun run cap:build`
2. Open Android Studio: `bun run cap:android`
3. Build APK in Android Studio
4. Transfer `app-debug.apk` to phone
5. Install and test

### With ADB (USB Connected)

```bash
# Enable USB debugging on phone
# Connect via USB

# Install APK directly
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or run with live reload
bun run cap:run:android
```

### On Emulator

1. Open Android Studio
2. Tools → Device Manager → Create Virtual Device
3. Run the app on emulator

## Troubleshooting

### Status bar overlapping content

Check that `StatusBar.setOverlaysWebView({ overlay: false })` is called in `src/utils/statusBar.ts`.

### Sounds playing in background

Ensure `useAppLifecycle()` hook is added to `Root.tsx`.

### Deep links not working

1. Verify intent filters in `AndroidManifest.xml`
2. Check that `useDeepLinks()` hook is active
3. Test with: `adb shell am start -a android.intent.action.VIEW -d "domin8://test"`

### Build fails

```bash
# Clean and rebuild
rm -rf android/app/build
bun run cap:build
```

### Gradle sync fails

Open Android Studio and let it sync Gradle automatically. You may need to install Android SDK and accept licenses.

## Adding iOS Support

To add iOS support:

```bash
# Add iOS platform
npx cap add ios

# Open Xcode
npx cap open ios
```

Note: iOS requires a Mac with Xcode installed and an Apple Developer account for device testing.

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Studio Download](https://developer.android.com/studio)
- [Privy Mobile Wallets](https://docs.privy.io/guide/react/wallets/external/mobile)
- [Phantom Deep Links](https://docs.phantom.app/developer-guides/deeplinking)
