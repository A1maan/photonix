import type { SpaceWeatherScenario } from "../lib/spaceWeather";

export const cachedSpaceWeatherScenario: SpaceWeatherScenario = {
  id: "2024-05-10T06:27:00-FLR-001",
  provider: "NASA DONKI",
  mode: "cached",
  title: "X3.9 flare with CME and particle-risk notifications",
  intensity: 0.92,
  severity: "severe",
  sourceUrl: "https://webtools.ccmc.gsfc.nasa.gov/DONKI/view/FLR/30667/-1",
  flare: {
    id: "2024-05-10T06:27:00-FLR-001",
    classType: "X3.9",
    beginTime: "2024-05-10T06:27Z",
    peakTime: "2024-05-10T06:54Z",
    sourceLocation: "S18W37",
    activeRegionNum: 13664,
  },
  cme: {
    id: "2024-05-10T07:12:00-CME-001",
    startTime: "2024-05-10T07:12Z",
    speedKms: 1018,
    halfAngleDeg: 41,
    estimatedEarthImpactTime: "2024-05-12T14:00Z",
  },
  riskNotes: [
    "NASA DONKI associated this event with increased energetic particle risk.",
    "Operational effect remains a Photonix demo model: Dawn-2 exceeds the radiation threshold and Dawn-1 takes over.",
  ],
};
