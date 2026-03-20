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
      style={{
        opacity,
        transition: "opacity 600ms ease-out",
        backgroundColor: "hsl(var(--sidebar))",
      }}
    >
      <div className="relative z-10 flex flex-col items-center gap-8 pb-32">
        <img
          src={logoWhite}
          alt="High Plains Property Maintenance"
          className="w-64 max-w-xs"
          data-testid="img-loading-logo"
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className="h-1 w-48 rounded-full overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            data-testid="loading-bar-track"
          >
            <div
              className="h-full rounded-full animate-loading-bar"
              style={{ backgroundColor: "rgba(255,255,255,0.8)" }}
            />
          </div>
          <span
            className="text-sm tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Loading
          </span>
        </div>
      </div>

      <img
        src={mountainsBg}
        alt=""
        aria-hidden="true"
        className="absolute bottom-0 left-0 w-full"
        style={{
          objectFit: "cover",
          objectPosition: "bottom center",
          height: "35%",
          display: "block",
        }}
      />
    </div>
  );
}
