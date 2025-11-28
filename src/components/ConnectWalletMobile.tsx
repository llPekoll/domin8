import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "~/components/ui/button";

const carouselSlides = [
  { image: "/carousel/1.png", caption: "Insert coin to play" },
  { image: "/carousel/2.png", caption: "Wait for other players" },
  { image: "/carousel/3.png", caption: "Win the game and take the prize" },
];

export function ConnectWalletMobile() {
  const { login } = usePrivy();
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-advance every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 4000);

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
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60 pointer-events-none"></div>

      {/* Centered CTA Card */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
        <div className="bg-gradient-to-b from-gray-900/95 to-black/95 backdrop-blur-xl border-2 border-amber-500/50 rounded-xl shadow-2xl w-full max-w-sm p-3 pointer-events-auto">
          {/* Logo - smaller */}
          <div className="flex justify-center ">
            <img src="/assets/logo.webp" alt="Domin8 Logo" className="h-10 w-auto object-contain" />
          </div>

          {/* Simple image carousel - no arrows */}
          <div className="relative scale-75 -mt-4 -mb-4">
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/40">
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
              <p className="text-white font-bold text-center py-1.5 px-2 text-xs">
                {carouselSlides[currentSlide].caption}
              </p>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-1.5 mt-2">
              {carouselSlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "bg-amber-400 w-3" : "bg-gray-500"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* CTA Button - compact */}
          <div className="w-full text-center mx-auto">
            <Button
              onClick={handleConnect}
              className=" w-1/2  bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 hover:from-amber-400 hover:via-orange-500 hover:to-amber-400 text-white font-black py-3 text-base shadow-xl transition-all uppercase tracking-wider overflow-hidden group active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
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
