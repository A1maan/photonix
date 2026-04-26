import Globe, { type GlobeMethods } from "react-globe.gl";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type GlobeSelectorProps = {
  onSelectCountry: (country: string) => void;
  startOnGlobe?: boolean;
};

type GeoFeature = {
  id?: string;
  properties?: {
    name?: string;
    NAME?: string;
    ADMIN?: string;
    ISO_A3?: string;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

type TransitionLogo = {
  startLeft: number;
  startTop: number;
  startWidth: number;
  deltaX: number;
  deltaY: number;
  scale: number;
  animating: boolean;
  direction: "forward" | "backward";
};

const SAUDI_VIEW = { lat: 24.4, lng: 45.2, altitude: 1.75 };
const GLOBE_IMAGE_URL = "/assets/earth-day.jpg";
const BACKGROUND_IMAGE_URL = "/assets/night-sky.png";
const WORLD_GEOJSON_URL = "/assets/world.geojson";
const PASTEL_COUNTRY_COLORS = [
  "#86a8a4",
  "#657d82",
  "#8f9176",
  "#6f8a73",
  "#9a7b70",
  "#75949c",
  "#777f6d",
  "#9a8c72",
  "#6f7f8a",
  "#7f9388",
];

function getCountryName(country: GeoFeature | null) {
  return (
    country?.properties?.name ||
    country?.properties?.NAME ||
    country?.properties?.ADMIN ||
    "Unknown country"
  );
}

function isSaudi(country: GeoFeature | null) {
  const name = getCountryName(country).toLowerCase();
  return country?.id === "SAU" || country?.properties?.ISO_A3 === "SAU" || name.includes("saudi");
}

function countryColor(country: GeoFeature) {
  if (isSaudi(country)) {
    return "#36f2c0";
  }

  const key = country.id || getCountryName(country);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PASTEL_COUNTRY_COLORS[Math.abs(hash) % PASTEL_COUNTRY_COLORS.length];
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1200 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

export function GlobeSelector({ onSelectCountry, startOnGlobe = false }: GlobeSelectorProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const splashLogoRef = useRef<HTMLImageElement | null>(null);
  const targetLogoRef = useRef<HTMLImageElement | null>(null);
  const landingMeasureLogoRef = useRef<HTMLImageElement | null>(null);
  const [showGlobe, setShowGlobe] = useState(startOnGlobe);
  const [enteringGlobe, setEnteringGlobe] = useState(false);
  const [returningLanding, setReturningLanding] = useState(false);
  const [transitionLogo, setTransitionLogo] = useState<TransitionLogo | null>(null);
  const [query, setQuery] = useState("Saudi Arabia");
  const [launching, setLaunching] = useState(false);
  const [countries, setCountries] = useState<GeoFeature[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<GeoFeature | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<GeoFeature | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [searchMessage, setSearchMessage] = useState("");
  const { width, height } = useWindowSize();

  const globeWidth = width >= 1024 ? Math.round(width * 0.62) : width;
  const globeHeight = width >= 1024 ? height : Math.max(420, Math.round(height * 0.48));

  useEffect(() => {
    let mounted = true;
    fetch(WORLD_GEOJSON_URL)
      .then((response) => response.json())
      .then((data) => {
        if (!mounted) {
          return;
        }
        const features = Array.isArray(data?.features) ? data.features : [];
        setCountries(
          features.map((feature: GeoFeature) => ({
            ...feature,
            id: feature.id || feature.properties?.ISO_A3,
          })),
        );
      })
      .catch(() => setCountries([]));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) {
      return;
    }

    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.55;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
  }, [autoRotate]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      globeRef.current?.pointOfView(SAUDI_VIEW, 1200);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [countries.length]);

  const markerData = useMemo(
    () => [
      {
        lat: 24.4,
        lng: 45.2,
        size: 0.55,
        color: "#36f2c0",
        label: "Saudi Arabia demo",
      },
    ],
    [],
  );

  const startSaudiDemo = () => {
    setLaunching(true);
    setAutoRotate(false);
    globeRef.current?.pointOfView(SAUDI_VIEW, 900);
    window.setTimeout(() => onSelectCountry("Saudi Arabia"), 1050);
  };

  const enterGlobe = () => {
    if (enteringGlobe || returningLanding) {
      return;
    }
    const logoRect = splashLogoRef.current?.getBoundingClientRect();
    if (!logoRect) {
      setShowGlobe(true);
      return;
    }
    setTransitionLogo({
      startLeft: logoRect.left,
      startTop: logoRect.top,
      startWidth: logoRect.width,
      deltaX: 0,
      deltaY: 0,
      scale: 1,
      animating: false,
      direction: "forward",
    });
    setEnteringGlobe(true);
    setShowGlobe(true);
  };

  const returnToLanding = () => {
    if (enteringGlobe || returningLanding) {
      return;
    }

    const startRect = targetLogoRef.current?.getBoundingClientRect();
    const targetRect = landingMeasureLogoRef.current?.getBoundingClientRect();
    if (!startRect || !targetRect) {
      setShowGlobe(false);
      setTransitionLogo(null);
      setLaunching(false);
      setSearchMessage("");
      return;
    }

    setReturningLanding(true);
    setLaunching(false);
    setSearchMessage("");
    setTransitionLogo({
      startLeft: startRect.left,
      startTop: startRect.top,
      startWidth: startRect.width,
      deltaX: targetRect.left - startRect.left,
      deltaY: targetRect.top - startRect.top,
      scale: targetRect.width / startRect.width,
      animating: false,
      direction: "backward",
    });
  };

  useEffect(() => {
    if (!showGlobe || !transitionLogo || transitionLogo.animating) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (transitionLogo.direction === "backward") {
        setTransitionLogo((current) => (current ? { ...current, animating: true } : current));
        return;
      }

      const targetRect = targetLogoRef.current?.getBoundingClientRect();
      if (!targetRect) {
        setEnteringGlobe(false);
        setTransitionLogo(null);
        return;
      }

      setTransitionLogo((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          deltaX: targetRect.left - current.startLeft,
          deltaY: targetRect.top - current.startTop,
          scale: targetRect.width / current.startWidth,
          animating: true,
        };
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [enteringGlobe, showGlobe, transitionLogo]);

  useEffect(() => {
    if (!transitionLogo?.animating) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (transitionLogo.direction === "backward") {
        setShowGlobe(false);
        setReturningLanding(false);
        setTransitionLogo(null);
        return;
      }

      setEnteringGlobe(false);
      setTransitionLogo(null);
    }, 820);

    return () => window.clearTimeout(timeout);
  }, [transitionLogo?.animating, transitionLogo?.direction]);

  const getCountryView = (feature: GeoFeature) => {
    const pairs: Array<[number, number]> = [];
    const collect = (value: unknown) => {
      if (!Array.isArray(value)) {
        return;
      }
      if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
      ) {
        pairs.push([value[1], value[0]]);
        return;
      }
      value.forEach(collect);
    };

    collect(feature.geometry?.coordinates);

    if (pairs.length === 0) {
      return SAUDI_VIEW;
    }

    const stride = Math.max(1, Math.floor(pairs.length / 120));
    const sample = pairs.filter((_, index) => index % stride === 0);
    const lat = sample.reduce((sum, pair) => sum + pair[0], 0) / sample.length;
    const lng = sample.reduce((sum, pair) => sum + pair[1], 0) / sample.length;

    return { lat, lng, altitude: isSaudi(feature) ? 1.55 : 2.05 };
  };

  const focusCountry = (feature: GeoFeature) => {
    setSelectedCountry(feature);
    setQuery(getCountryName(feature));
    setAutoRotate(false);
    globeRef.current?.pointOfView(getCountryView(feature), 900);
  };

  const handleSearch = () => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setSearchMessage("Type a country name to preview it on the globe.");
      return;
    }

    const match = countries.find((country) => {
      const name = getCountryName(country).toLowerCase();
      const iso = (country.id || country.properties?.ISO_A3 || "").toLowerCase();
      return name === normalized || name.includes(normalized) || iso === normalized;
    });

    if (!match) {
      setSearchMessage("No matching country found on the globe.");
      return;
    }

    focusCountry(match);

    if (isSaudi(match)) {
      setSearchMessage("Opening Saudi Arabia planner.");
      window.setTimeout(() => startSaudiDemo(), 650);
      return;
    }

    setSearchMessage("Preview only. The MVP planner is available for Saudi Arabia.");
  };

  const onCountryClick = (country: object) => {
    const feature = country as GeoFeature;
    focusCountry(feature);

    if (isSaudi(feature)) {
      window.setTimeout(() => startSaudiDemo(), 650);
    } else {
      setSearchMessage("Preview only. The MVP planner is available for Saudi Arabia.");
    }
  };

  if (!showGlobe) {
    return (
      <main className="space-entry photonix-splash relative grid min-h-screen overflow-hidden bg-black text-white">
        <button
          type="button"
          aria-label="Enter Photonix globe selector"
          className="splash-mark relative z-10 m-auto grid place-items-center px-6 text-center outline-none"
          onClick={enterGlobe}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              enterGlobe();
            }
          }}
        >
          <img
            ref={splashLogoRef}
            src="/assets/photonix-logo-no-bg-trimmed.png"
            alt="Photonix"
            className="w-[min(78vw,34rem)] object-contain"
          />
          <span className="vision-line mt-7">
            AI-guided satellite coverage planning for mission teams on Earth.
          </span>
        </button>
      </main>
    );
  }

  return (
    <main className="space-entry relative grid min-h-screen overflow-hidden bg-black text-white lg:grid-cols-[430px_minmax(0,1fr)]">
      {transitionLogo && (
        <div
          className={`transition-logo-overlay ${transitionLogo.animating ? "is-moving" : ""}`}
          style={
            {
              "--logo-left": `${transitionLogo.startLeft}px`,
              "--logo-top": `${transitionLogo.startTop}px`,
              "--logo-width": `${transitionLogo.startWidth}px`,
              "--logo-dx": `${transitionLogo.deltaX}px`,
              "--logo-dy": `${transitionLogo.deltaY}px`,
              "--logo-scale": transitionLogo.scale,
            } as CSSProperties
          }
        >
          <img src="/assets/photonix-logo-no-bg-trimmed.png" alt="" />
        </div>
      )}
      <button
        type="button"
        aria-label="Back to landing page"
        className="landing-back-button absolute left-6 top-6 z-20 grid h-11 w-11 place-items-center sm:left-8 sm:top-8"
        onClick={returnToLanding}
      >
        <ArrowLeft size={18} strokeWidth={1.9} />
      </button>
      <div className="landing-measure" aria-hidden="true">
        <div className="grid place-items-center px-6 text-center">
          <img
            ref={landingMeasureLogoRef}
            src="/assets/photonix-logo-no-bg-trimmed.png"
            alt=""
            className="w-[min(78vw,34rem)] object-contain"
          />
          <span className="vision-line mt-7">
            AI-guided satellite coverage planning for mission teams on Earth.
          </span>
        </div>
      </div>
      <div className="z-10 flex min-h-[54svh] flex-col justify-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-10">
        <div
          className={`globe-control-panel w-full max-w-[24rem] ${
            enteringGlobe || returningLanding ? "is-entering" : ""
          }`}
        >
          <div className="mb-12 flex items-center">
            <img
              ref={targetLogoRef}
              src="/assets/photonix-logo-no-bg-trimmed.png"
              alt="Photonix"
              className="w-52 object-contain object-left sm:w-60 lg:w-72"
            />
          </div>

          <label className="eyebrow mb-4 block">
            Country
          </label>
          <form
            className="country-search-shell group flex items-center"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearch();
            }}
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center text-slate-400 transition group-focus-within:text-signal">
              <Search size={18} strokeWidth={1.8} />
            </div>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchMessage("");
              }}
              list="country-options"
              className="country-search-input min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search country"
            />
            <datalist id="country-options">
              {countries.slice(0, 260).map((country) => (
                <option key={country.id || getCountryName(country)} value={getCountryName(country)} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={handleSearch}
              className="country-search-button flex shrink-0 items-center gap-2 px-5 text-sm font-semibold"
            >
              Open
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          </form>
          {searchMessage && <p className="mt-2 text-xs text-slate-400">{searchMessage}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setAutoRotate((current) => !current)}
              className="text-sm font-medium text-slate-400 underline decoration-slate-600/60 underline-offset-4 transition hover:text-white"
            >
              {autoRotate ? "Pause rotation" : "Resume rotation"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`globe-stage relative min-h-[420px] cursor-grab active:cursor-grabbing ${
          returningLanding ? "is-returning" : ""
        }`}
      >
        <Globe
          ref={globeRef}
          width={globeWidth}
          height={globeHeight}
          globeImageUrl={GLOBE_IMAGE_URL}
          backgroundImageUrl={BACKGROUND_IMAGE_URL}
          backgroundColor="rgba(0,0,0,0)"
          polygonsData={countries}
          polygonAltitude={(country) => {
            const feature = country as GeoFeature;
            if (selectedCountry?.id === feature.id) {
              return 0.055;
            }
            return isSaudi(feature) ? 0.035 : 0.012;
          }}
          polygonCapColor={(country) => countryColor(country as GeoFeature)}
          polygonSideColor={() => "rgba(3, 10, 24, 0.88)"}
          polygonStrokeColor={(country) => (isSaudi(country as GeoFeature) ? "#ffffff" : "rgba(0,0,0,0.55)")}
          polygonLabel={(country) => getCountryName(country as GeoFeature)}
          onPolygonHover={(country) => setHoveredCountry((country as GeoFeature | null) ?? null)}
          onPolygonClick={onCountryClick}
          pointsData={markerData}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={0.08}
          pointRadius="size"
          pointColor="color"
          pointLabel="label"
          onPointClick={startSaudiDemo}
          atmosphereColor="#9bdfff"
          atmosphereAltitude={0.24}
          rendererConfig={{ antialias: true, alpha: true }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_60%_45%,transparent_0,rgba(0,0,0,0.03)_34%,#000_91%)]" />
        <div className="pointer-events-none absolute bottom-6 right-6 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
          Drag to rotate globe
        </div>
        {hoveredCountry && (
          <div className="pointer-events-none absolute right-6 top-6 rounded-lg border border-white/10 bg-black/70 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur">
            {getCountryName(hoveredCountry)}
          </div>
        )}
        {launching && (
          <div className="pointer-events-none absolute inset-0 bg-signal/5 backdrop-blur-[1px]" />
        )}
      </div>
    </main>
  );
}
