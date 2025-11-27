import { useState, useEffect } from "react";
import { Wallet, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "~/components/ui/button";

const carouselSlides = [
  { image: "/carousel/1.png", caption: "Insert coin to play" },
  { image: "/carousel/2.png", caption: "Wait for other players" },
  { image: "/carousel/3.png", caption: "Win the game and take the prize" },
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
        <div className="bg-gradient-to-b from-gray-900/95 to-black/95 backdrop-blur-xl border-2 border-amber-500/50 rounded-2xl shadow-2xl max-w-md w-full p-8 pointer-events-auto">
          {/* Animated Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Pulsing glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full blur-2xl opacity-60 animate-pulse"></div>
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform">
                <Wallet className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-center text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 mb-3 animate-pulse">
            Join the Battle!
          </h2>

          {/* Subheadline */}
          <p className="text-center text-gray-300 text-lg mb-8">
            Connect your wallet to compete and win real SOL
          </p>

          {/* Carousel */}
          <div className="relative mb-8">
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
                    index === currentSlide
                      ? "bg-amber-400 w-4"
                      : "bg-gray-500 hover:bg-gray-400"
                  }`}
                />
              ))}
            </div>
          </div>

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
