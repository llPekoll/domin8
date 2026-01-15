import { usePWA } from "~/hooks/usePWA";

export function PWAUpdatePrompt() {
  const { needRefresh, updateServiceWorker, dismissUpdate } = usePWA();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md">
      <div className="bg-[#2c1810] border-3 border-orange-500 rounded-lg p-4 shadow-lg shadow-orange-500/20">
        <p className="text-yellow-400 font-metal text-sm mb-3">
          New version available! Update after your game ends.
        </p>
        <div className="flex gap-2">
          <button
            onClick={updateServiceWorker}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-metal text-sm py-2 px-4 rounded transition-colors"
          >
            Refresh Now
          </button>
          <button
            onClick={dismissUpdate}
            className="flex-1 bg-transparent border border-orange-500 text-orange-400 hover:bg-orange-500/20 font-metal text-sm py-2 px-4 rounded transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
