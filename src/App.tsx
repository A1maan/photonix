import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MissionControl } from "./components/MissionControl";

type LogoTransition = {
  startLeft: number;
  startTop: number;
  startWidth: number;
  deltaX: number;
  deltaY: number;
  scale: number;
  animating: boolean;
};

export function App() {
  const splashLogoRef = useRef<HTMLImageElement | null>(null);
  const [started, setStarted] = useState(false);
  const [logoTransition, setLogoTransition] = useState<LogoTransition | null>(null);

  useEffect(() => {
    if (!started || !logoTransition || logoTransition.animating) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetRect = document.querySelector(".mission-logo")?.getBoundingClientRect();
      if (!targetRect) {
        setLogoTransition(null);
        return;
      }

      setLogoTransition((current) =>
        current
          ? {
              ...current,
              deltaX: targetRect.left - current.startLeft,
              deltaY: targetRect.top - current.startTop,
              scale: targetRect.width / current.startWidth,
              animating: true,
            }
          : current,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [logoTransition, started]);

  useEffect(() => {
    if (!logoTransition?.animating) {
      return;
    }

    const timeout = window.setTimeout(() => setLogoTransition(null), 780);
    return () => window.clearTimeout(timeout);
  }, [logoTransition?.animating]);

  const enterMissionControl = () => {
    const rect = splashLogoRef.current?.getBoundingClientRect();
    if (rect) {
      setLogoTransition({
        startLeft: rect.left,
        startTop: rect.top,
        startWidth: rect.width,
        deltaX: 0,
        deltaY: 0,
        scale: 1,
        animating: false,
      });
    }
    setStarted(true);
  };

  if (!started) {
    return (
      <main className="direct-entry relative grid min-h-screen overflow-hidden bg-black text-white">
        <button
          type="button"
          aria-label="Enter Photonix mission control"
          className="splash-mark relative z-10 m-auto grid place-items-center px-6 text-center outline-none"
          onClick={enterMissionControl}
        >
          <img
            ref={splashLogoRef}
            src="/assets/photonix-logo-no-bg-trimmed.png"
            alt="Photonix"
            className="w-[min(78vw,34rem)] object-contain"
          />
          <span className="vision-line mt-7">
            Orbital AI data center mission control
          </span>
        </button>
      </main>
    );
  }

  return (
    <>
      {logoTransition && (
        <div
          className={`transition-logo-overlay direct-logo-transition ${logoTransition.animating ? "is-moving" : ""}`}
          style={
            {
              "--logo-left": `${logoTransition.startLeft}px`,
              "--logo-top": `${logoTransition.startTop}px`,
              "--logo-width": `${logoTransition.startWidth}px`,
              "--logo-dx": `${logoTransition.deltaX}px`,
              "--logo-dy": `${logoTransition.deltaY}px`,
              "--logo-scale": logoTransition.scale,
            } as CSSProperties
          }
        >
          <img src="/assets/photonix-logo-no-bg-trimmed.png" alt="" />
        </div>
      )}
      <MissionControl
        country="Saudi Arabia"
        logoTransitioning={Boolean(logoTransition)}
        onBackToGlobe={() => {
          setLogoTransition(null);
          setStarted(false);
        }}
      />
    </>
  );
}
