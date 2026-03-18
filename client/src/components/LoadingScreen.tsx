import { useEffect, useState } from "react";
import mountainsBg from "@assets/Mountains_1773354108536.png";
import logoWhite from "@assets/hp-logo-white-nobg.png";

interface LoadingScreenProps {
  visible: boolean;
}

export function LoadingScreen({ visible }: LoadingScreenProps) {
  const [opacity, setOpacity] = useState(1);
  const [display, setDisplay] = useState(true);

  useEffect(() => {
    if (!visible) {
      setOpacity(0);
      const timer = setTimeout(() => setDisplay(false), 600);
      return () => clearTimeout(timer);
    } else {
      setDisplay(true);
      setOpacity(1);
    }
  }, [visible]);

  if (!display) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ opacity, transition: "opacity 600ms ease-out" }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${mountainsBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/75" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <img
          src={logoWhite}
          alt="High Plains Property Maintenance"
          className="w-64 max-w-xs drop-shadow-2xl"
          data-testid="img-loading-logo"
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className="h-1 w-48 rounded-full overflow-hidden bg-white/20"
            data-testid="loading-bar-track"
          >
            <div className="h-full bg-white/80 rounded-full animate-loading-bar" />
          </div>
          <span className="text-white/60 text-sm tracking-widest uppercase">
            Loading
          </span>
        </div>
      </div>
    </div>
  );
}
