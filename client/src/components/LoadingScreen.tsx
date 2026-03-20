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
      <div className="relative z-10 flex items-center justify-center">
        <div className="loading-spinner-ring" aria-hidden="true" />
        <img
          src={logoWhite}
          alt="High Plains Property Maintenance"
          className="w-48 object-contain"
          data-testid="img-loading-logo"
        />
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
          opacity: 0.4,
        }}
      />
    </div>
  );
}
