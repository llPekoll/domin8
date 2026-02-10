import { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "~/components/ui/button";

const carouselSlides = [
  { image: "/carousel/1.gif", caption: "Insert coin to play" },
  { image: "/carousel/2.gif", caption: "Wait for other players" },
  { image: "/carousel/3.gif", caption: "Win the game and take the prize" },
];

export function ConnectWalletMobile() {
  const { login } = usePrivy();
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Auto-advance every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;

    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        // Swipe left - next slide
        setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
      } else {
        // Swipe right - previous slide
        setCurrentSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length);
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleConnect = () => {
    try {
      login();
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/40 to-black/60 pointer-events-none"></div>

      {/* Centered CTA Card */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
        <div className="bg-linear-to-b from-gray-900/95 to-black/95 backdrop-blur-xl border-2 border-amber-500/50 rounded-xl shadow-2xl w-full max-w-sm p-3 pointer-events-auto">
          {/* Logo - smaller */}
          <div className="flex justify-center mb-3">
            <img src="/assets/logo.webp" alt="Domin8 Logo" className="h-10 w-auto object-contain" />
          </div>

          {/* Simple image carousel - swipeable */}
          <div className="relative mb-4">
            <div
              className="relative overflow-hidden rounded-lg bg-linear-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/40"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {carouselSlides.map((slide, index) => (
                  <div key={index} className="w-full shrink-0">
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
              <p className="text-white font-bold text-center  px-3 text-lg">
                {carouselSlides[currentSlide].caption}
              </p>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-3">
              {carouselSlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "bg-amber-400 w-4" : "bg-gray-500"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* CTA Button - compact */}
          <div className="w-full text-center mx-auto">
            <Button
              onClick={handleConnect}
              className=" w-1/2  bg-linear-to-r from-amber-500 via-orange-600 to-amber-500 hover:from-amber-400 hover:via-orange-500 hover:to-amber-400 text-white font-black py-3 text-base shadow-xl transition-all uppercase tracking-wider overflow-hidden group active:scale-95"
            >
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
              <Sparkles className="w-4 h-4 mr-1.5 inline-block animate-pulse" />
              Connect Wallet
              <Sparkles className="w-4 h-4 ml-1.5 inline-block animate-pulse" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
