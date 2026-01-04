import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Configure status bar for native platforms
 * Makes content appear below the status bar, not behind it
 */
export async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Set status bar style (light text for dark backgrounds)
    await StatusBar.setStyle({ style: Style.Dark });

    // Set status bar background color to match app
    await StatusBar.setBackgroundColor({ color: "#000000" });

    // Don't overlay content - this pushes content below status bar
    await StatusBar.setOverlaysWebView({ overlay: false });

    console.log("[StatusBar] Configured successfully");
  } catch (error) {
    console.error("[StatusBar] Configuration failed:", error);
  }
}

/**
 * Hide status bar (for fullscreen game mode)
 */
export async function hideStatusBar() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.hide();
  } catch (error) {
    console.error("[StatusBar] Hide failed:", error);
  }
}

/**
 * Show status bar
 */
export async function showStatusBar() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.show();
  } catch (error) {
    console.error("[StatusBar] Show failed:", error);
  }
}
