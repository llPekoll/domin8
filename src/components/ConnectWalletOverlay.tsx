import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "~/components/ui/button";
import { MWAConnectButton } from "./MWAConnectButton";

// Detect Android via user agent (works for PWA and web)
const isAndroid = /Android/i.test(navigator.userAgent);

const carouselSlides = [
  { image: "/carousel/1.gif", caption: "Insert coin to play" },
  { image: "/carousel/2.gif", caption: "Wait for other players" },
  { image: "/carousel/3.gif", caption: "Win the game and take the prize" },
];

export function ConnectWalletOverlay() {
  const { login } = usePrivy();
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length);
  };

  // Auto-advance every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const handleConnect = () => {
    try {
      login();
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Gradient overlay - subtle darkening */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50 pointer-events-none"></div>

      {/* Centered CTA Card */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-gradient-to-b from-gray-900/95 to-black/95 backdrop-blur-xl border-2 border-amber-500/50 rounded-2xl shadow-2xl max-w-md pt-4 w-full p-8 pointer-events-auto">
          {/* Logo */}
          <div className="flex justify-center ">
            <img src="/assets/logo.webp" alt="Domin8 Logo" className="h-32 w-auto object-contain" />
          </div>

          {/* Headline */}
          <h2 className="text-center text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 mb-3 animate-pulse">
            Join the Battle!
          </h2>

          {/* Carousel */}
          <div className="relative mb-8 ">
            {/* Carousel Container */}
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/40">
              {/* Slides Container */}
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {carouselSlides.map((slide, index) => (
                  <div key={index} className="w-full flex-shrink-0">
                    <div className="aspect-video">
                      <img
                        src={slide.image}
                        alt={slide.caption}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Caption */}
              <p className="text-white font-bold text-center py-3 px-4 text-sm transition-opacity duration-300">
                {carouselSlides[currentSlide].caption}
              </p>

              {/* Left Arrow */}
              <button
                onClick={prevSlide}
                className="absolute left-2 top-[calc(50%-20px)] -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>

              {/* Right Arrow */}
              <button
                onClick={nextSlide}
                className="absolute right-2 top-[calc(50%-20px)] -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-3">
              {carouselSlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "bg-amber-400 w-4" : "bg-gray-500 hover:bg-gray-400"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Seeker Wallet Button (Android only) */}
          <MWAConnectButton
            onConnect={(publicKey) => {
              console.log("[Overlay] Connected to Seeker wallet:", publicKey);
              // Store the connected wallet address for use in the app
              localStorage.setItem("seekerWalletAddress", publicKey);
              window.location.reload(); // Refresh to use the new wallet
            }}
            onError={(error) => {
              console.error("[Overlay] Seeker wallet error:", error);
            }}
          />

          {/* Divider - only show on Android */}
          {isAndroid && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="text-gray-400 text-sm">or</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>
          )}

          {/* Main CTA Button */}
          <Button
            onClick={handleConnect}
            className="relative w-full bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 hover:from-amber-400 hover:via-orange-500 hover:to-amber-400 text-white font-black py-6 text-2xl shadow-2xl transition-all uppercase tracking-wider overflow-hidden group transform hover:scale-105 active:scale-95"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <Sparkles className="w-6 h-6 mr-2 inline-block animate-pulse" />
            Connect Wallet
            <Sparkles className="w-6 h-6 ml-2 inline-block animate-pulse" />
          </Button>

          {/* Supporting text */}
          <p className="text-center text-sm text-gray-400 mt-4">
            No wallet? No problem! Use email or social login
          </p>
        </div>
      </div>
    </div>
  );
}
