import { useEffect } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Handle deep links for Phantom wallet and other external apps
 *
 * Deep link format: domin8://callback?data=...
 * App links: https://domin8.fun/path
 */
export function useDeepLinks(onDeepLink?: (url: string) => void) {
  useEffect(() => {
    // Only set up listeners on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleUrlOpen = (event: URLOpenListenerEvent) => {
      const url = event.url;
      console.log("[DeepLink] Received:", url);

      // Handle Phantom wallet callbacks
      if (url.startsWith("domin8://")) {
        // Parse and handle the callback
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);

        // Log for debugging
        console.log("[DeepLink] Scheme:", urlObj.protocol);
        console.log("[DeepLink] Host:", urlObj.host);
        console.log("[DeepLink] Params:", Object.fromEntries(params));

        // Phantom returns data in various params depending on the action
        // The Privy SDK should handle these automatically when using their wallet connector
      }

      // Handle https app links
      if (url.startsWith("https://domin8.fun")) {
        const urlObj = new URL(url);
        const path = urlObj.pathname;

        // Navigate to the path in the app
        if (path && path !== "/") {
          window.location.href = path;
        }
      }

      // Call custom handler if provided
      if (onDeepLink) {
        onDeepLink(url);
      }
    };

    // Add listener
    App.addListener("appUrlOpen", handleUrlOpen);

    // Check if app was opened via deep link
    App.getLaunchUrl().then((result) => {
      if (result?.url) {
        console.log("[DeepLink] App launched with URL:", result.url);
        handleUrlOpen({ url: result.url });
      }
    });

    // Cleanup
    return () => {
      App.removeAllListeners();
    };
  }, [onDeepLink]);
}

/**
 * Check if running on native platform (iOS/Android)
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the platform name
 */
export function getPlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}
