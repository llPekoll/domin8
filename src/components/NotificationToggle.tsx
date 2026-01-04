import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushNotifications } from "~/hooks/usePushNotifications";

interface NotificationToggleProps {
  walletAddress?: string;
  showCount?: boolean;
  className?: string;
}

export function NotificationToggle({ walletAddress, showCount = false, className = "" }: NotificationToggleProps) {
  const { isSupported, isSubscribed, isLoading, subscriberCount, subscribe, unsubscribe, error } =
    usePushNotifications(walletAddress);

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-all
          ${isSubscribed
            ? "bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30"
            : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700/50 hover:text-white"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title={isSubscribed ? "Disable notifications" : "Enable notifications"}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="w-4 h-4" />
        ) : (
          <BellOff className="w-4 h-4" />
        )}
        <span className="text-sm font-medium hidden sm:inline">
          {isSubscribed ? "Notifications On" : "Notify Me"}
        </span>
      </button>

      {showCount && subscriberCount > 0 && (
        <span className="text-xs text-gray-500">
          {subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}
        </span>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}

/**
 * Compact version for header/nav
 */
export function NotificationBell({ walletAddress, className = "" }: { walletAddress?: string; className?: string }) {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications(walletAddress);

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`
        p-2 rounded-lg transition-all
        ${isSubscribed
          ? "text-orange-400 hover:bg-orange-500/20"
          : "text-gray-400 hover:text-white hover:bg-gray-700/50"
        }
        disabled:opacity-50
        ${className}
      `}
      title={isSubscribed ? "Notifications enabled - click to disable" : "Enable notifications"}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="w-5 h-5" />
      ) : (
        <BellOff className="w-5 h-5" />
      )}
    </button>
  );
}
