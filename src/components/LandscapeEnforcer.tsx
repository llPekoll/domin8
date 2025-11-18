import { useEffect, useState } from "react";
import { isMobile, isTablet } from "react-device-detect";

export function LandscapeEnforcer() {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    // Only enforce landscape on mobile/tablet devices
    if (!isMobile && !isTablet) {
      return;
    }

    const checkOrientation = () => {
      // Check if device is in portrait mode
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };

    // Check on mount
    checkOrientation();

    // Listen for orientation changes
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Don't show overlay on desktop
  if (!isMobile && !isTablet) {
    return null;
  }

  // Don't show overlay if already in landscape
  if (!isPortrait) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center">
      <div className="text-center px-8">
        {/* Rotate Icon */}
        <div className="mb-8 ">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-32 h-32 text-purple-400 mx-auto animate-[spin_3s_ease-in-out_infinite]"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </div>

        {/* Text Message */}
        <h2 className="text-white text-3xl font-bold mb-4 uppercase tracking-wider">
          Rotate Your Device
        </h2>
        <p className="text-purple-300 text-xl">
          Please rotate your device to landscape mode for the best gaming experience
        </p>

        {/* Arrow Indicator */}
        <div className="mt-8 flex justify-center gap-4">
          <div className="text-purple-400 text-6xl animate-pulse">→</div>
        </div>
      </div>
    </div>
  );
}
