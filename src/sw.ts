/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Precache static assets (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Cleanup old caches
cleanupOutdatedCaches();

// Push notification handler - receives push even when app is closed
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    const options = {
      body: data.body || "A new game is starting!",
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      vibrate: [200, 100, 200],
      tag: data.tag || "domin8-notification",
      renotify: true,
      requireInteraction: data.requireInteraction ?? false,
      data: {
        url: data.url || "/",
        ...data,
      },
      actions: data.actions || [
        { action: "open", title: "Play Now" },
        { action: "dismiss", title: "Later" },
      ],
    } satisfies NotificationOptions & { vibrate?: number[]; renotify?: boolean; actions?: { action: string; title: string }[] };

    event.waitUntil(self.registration.showNotification(data.title || "Domin8", options));
  } catch {
    // Fallback for plain text
    event.waitUntil(
      self.registration.showNotification("Domin8", {
        body: event.data.text(),
        icon: "/android-chrome-192x192.png",
      })
    );
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  if (event.action === "dismiss") {
    return;
  }

  // Open the app or focus existing window
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open new window if not
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Handle notification close
self.addEventListener("notificationclose", () => {
  // Analytics tracking could go here
});

// Skip waiting when requested
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
