import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { subscribeToPush, unsubscribeFromPush, isPushEnabled } from "./usePWA";

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  subscriberCount: number;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  error: string | null;
}

export function usePushNotifications(walletAddress?: string): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convex mutations
  const subscribeToConvex = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribeFromConvex = useMutation(api.pushSubscriptions.unsubscribe);
  const linkWalletMutation = useMutation(api.pushSubscriptions.linkWallet);

  // Get subscriber count
  const subscriberCount = useQuery(api.pushSubscriptions.getSubscriptionCount) ?? 0;

  // Check initial state
  useEffect(() => {
    const checkSupport = async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setIsSupported(supported);

      if (supported) {
        const enabled = await isPushEnabled();
        setIsSubscribed(enabled);
      }

      setIsLoading(false);
    };

    checkSupport();
  }, []);

  // Link wallet when user logs in
  useEffect(() => {
    const linkWallet = async () => {
      if (!walletAddress || !isSubscribed) return;

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          await linkWalletMutation({
            endpoint: subscription.endpoint,
            walletAddress,
          });
        }
      } catch (err) {
        console.error("[Push] Failed to link wallet:", err);
      }
    };

    linkWallet();
  }, [walletAddress, isSubscribed, linkWalletMutation]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsLoading(true);

    try {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error("VAPID public key not configured");
      }

      const subscription = await subscribeToPush(vapidKey);

      if (!subscription) {
        throw new Error("Failed to subscribe to push notifications");
      }

      // Extract keys from subscription
      const p256dh = subscription.getKey("p256dh");
      const auth = subscription.getKey("auth");

      if (!p256dh || !auth) {
        throw new Error("Invalid subscription keys");
      }

      // Save to Convex
      await subscribeToConvex({
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
        walletAddress,
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[Push] Subscribe error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [subscribeToConvex, walletAddress]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsLoading(true);

    try {
      // Get current subscription to get endpoint
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from browser
        await unsubscribeFromPush();

        // Remove from Convex
        await unsubscribeFromConvex({
          endpoint: subscription.endpoint,
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[Push] Unsubscribe error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [unsubscribeFromConvex]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscriberCount,
    subscribe,
    unsubscribe,
    error,
  };
}
