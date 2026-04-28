import { cachedSpaceWeatherScenario } from "../data/spaceWeatherScenario";

export type SpaceWeatherSeverity = "moderate" | "strong" | "severe";

export type SpaceWeatherScenario = {
  id: string;
  provider: "NASA DONKI";
  mode: "cached" | "live";
  title: string;
  intensity: number;
  severity: SpaceWeatherSeverity;
  sourceUrl?: string;
  flare?: {
    id: string;
    classType: string;
    beginTime?: string;
    peakTime?: string;
    endTime?: string;
    sourceLocation?: string;
    activeRegionNum?: number;
  };
  cme?: {
    id: string;
    startTime?: string;
    speedKms?: number;
    halfAngleDeg?: number;
    estimatedEarthImpactTime?: string;
  };
  riskNotes: string[];
};

type DonkiLinkedEvent = {
  activityID?: unknown;
};

type DonkiFlare = {
  flrID?: unknown;
  beginTime?: unknown;
  peakTime?: unknown;
  endTime?: unknown;
  classType?: unknown;
  sourceLocation?: unknown;
  activeRegionNum?: unknown;
  link?: unknown;
  linkedEvents?: unknown;
};

type DonkiCmeAnalysis = {
  isMostAccurate?: unknown;
  speed?: unknown;
  halfAngle?: unknown;
  enlilList?: unknown;
};

type DonkiCme = {
  activityID?: unknown;
  startTime?: unknown;
  link?: unknown;
  cmeAnalyses?: unknown;
};

type DonkiNotification = {
  messageType?: unknown;
  messageBody?: unknown;
};

const DONKI_BASE_URL = "https://api.nasa.gov/DONKI";
const DATE_RANGE_DAYS = 30;

export function getCachedSpaceWeatherScenario() {
  return cachedSpaceWeatherScenario;
}

export async function loadSpaceWeatherScenario(apiKey?: string): Promise<SpaceWeatherScenario> {
  const normalizedKey = apiKey?.trim();
  if (!normalizedKey) {
    return cachedSpaceWeatherScenario;
  }

  try {
    return await fetchLiveSpaceWeatherScenario(normalizedKey);
  } catch {
    return cachedSpaceWeatherScenario;
  }
}

async function fetchLiveSpaceWeatherScenario(apiKey: string): Promise<SpaceWeatherScenario> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - DATE_RANGE_DAYS);
  const query = `startDate=${formatDonkiDate(startDate)}&endDate=${formatDonkiDate(endDate)}&api_key=${encodeURIComponent(apiKey)}`;

  const [flares, cmes, notifications] = await Promise.all([
    fetchDonkiJson<DonkiFlare[]>(`${DONKI_BASE_URL}/FLR?${query}`),
    fetchDonkiJson<DonkiCme[]>(`${DONKI_BASE_URL}/CME?${query}`),
    fetchDonkiJson<DonkiNotification[]>(`${DONKI_BASE_URL}/notifications?${query}&type=all`),
  ]);

  const strongestFlare = flares.filter(isValidFlare).sort((a, b) => flareClassScore(b.classType) - flareClassScore(a.classType))[0];
  if (!strongestFlare) {
    throw new Error("DONKI returned no usable flare data.");
  }

  const linkedCmeIds = extractLinkedCmeIds(strongestFlare);
  const linkedCme =
    cmes.find((cme) => linkedCmeIds.includes(asString(cme.activityID))) ??
    cmes.filter(isValidCme).sort((a, b) => cmeSpeed(b) - cmeSpeed(a))[0];
  const cmeAnalysis = linkedCme ? mostUsefulCmeAnalysis(linkedCme) : undefined;
  const notes = extractRiskNotes(notifications);
  const intensity = scenarioIntensity(strongestFlare.classType, cmeAnalysis?.speed, notes);

  return {
    id: strongestFlare.flrID,
    provider: "NASA DONKI",
    mode: "live",
    title: `${strongestFlare.classType} flare${linkedCme ? " with linked CME" : ""}`,
    intensity,
    severity: severityFromIntensity(intensity),
    sourceUrl: asOptionalString(strongestFlare.link) ?? asOptionalString(linkedCme?.link),
    flare: {
      id: strongestFlare.flrID,
      classType: strongestFlare.classType,
      beginTime: asOptionalString(strongestFlare.beginTime),
      peakTime: asOptionalString(strongestFlare.peakTime),
      endTime: asOptionalString(strongestFlare.endTime),
      sourceLocation: asOptionalString(strongestFlare.sourceLocation),
      activeRegionNum: asOptionalNumber(strongestFlare.activeRegionNum),
    },
    cme: linkedCme
      ? {
          id: asString(linkedCme.activityID),
          startTime: asOptionalString(linkedCme.startTime),
          speedKms: asOptionalNumber(cmeAnalysis?.speed),
          halfAngleDeg: asOptionalNumber(cmeAnalysis?.halfAngle),
          estimatedEarthImpactTime: extractEstimatedEarthImpact(cmeAnalysis),
        }
      : undefined,
    riskNotes: notes.length > 0 ? notes : cachedSpaceWeatherScenario.riskNotes,
  };
}

async function fetchDonkiJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DONKI request failed with ${response.status}.`);
  }
  return (await response.json()) as T;
}

function formatDonkiDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isValidFlare(item: DonkiFlare): item is DonkiFlare & { flrID: string; classType: string } {
  return typeof item.flrID === "string" && typeof item.classType === "string" && flareClassScore(item.classType) > 0;
}

function isValidCme(item: DonkiCme): item is DonkiCme & { activityID: string } {
  return typeof item.activityID === "string";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function flareClassScore(classType: string) {
  const match = /^([ABCMX])\s*([0-9.]+)?/i.exec(classType.trim());
  if (!match) {
    return 0;
  }

  const base = { A: 0.05, B: 0.14, C: 0.32, M: 0.62, X: 0.84 }[match[1].toUpperCase() as "A" | "B" | "C" | "M" | "X"];
  const multiplier = Number(match[2] ?? "1");
  return Math.min(1, base + Math.log10(Math.max(1, multiplier)) * 0.13);
}

function extractLinkedCmeIds(flare: DonkiFlare) {
  if (!Array.isArray(flare.linkedEvents)) {
    return [];
  }

  return flare.linkedEvents
    .map((event: DonkiLinkedEvent) => asString(event.activityID))
    .filter((id) => id.includes("-CME-"));
}

function mostUsefulCmeAnalysis(cme: DonkiCme): DonkiCmeAnalysis | undefined {
  if (!Array.isArray(cme.cmeAnalyses)) {
    return undefined;
  }

  const analyses = cme.cmeAnalyses.filter((analysis): analysis is DonkiCmeAnalysis => typeof analysis === "object" && analysis !== null);
  return analyses.find((analysis) => analysis.isMostAccurate === true) ?? analyses.sort((a, b) => cmeAnalysisSpeed(b) - cmeAnalysisSpeed(a))[0];
}

function cmeSpeed(cme: DonkiCme) {
  return cmeAnalysisSpeed(mostUsefulCmeAnalysis(cme));
}

function cmeAnalysisSpeed(analysis?: DonkiCmeAnalysis) {
  return asOptionalNumber(analysis?.speed) ?? 0;
}

function extractEstimatedEarthImpact(analysis?: DonkiCmeAnalysis) {
  if (!analysis || !Array.isArray(analysis.enlilList)) {
    return undefined;
  }

  for (const enlil of analysis.enlilList) {
    if (typeof enlil !== "object" || enlil === null) {
      continue;
    }
    const estimatedShockArrivalTime = (enlil as { estimatedShockArrivalTime?: unknown }).estimatedShockArrivalTime;
    if (typeof estimatedShockArrivalTime === "string" && estimatedShockArrivalTime.trim()) {
      return estimatedShockArrivalTime;
    }
  }

  return undefined;
}

function extractRiskNotes(notifications: DonkiNotification[]) {
  const riskTypes = new Set(["SEP", "GST", "MPC", "IPS", "CME"]);
  const notes: string[] = [];

  for (const notification of notifications) {
    const messageType = asString(notification.messageType);
    const messageBody = asString(notification.messageBody);
    if (!riskTypes.has(messageType) || !messageBody) {
      continue;
    }

    const summaryLine = messageBody
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.toLowerCase().includes("disclaimer"));

    if (summaryLine && !notes.includes(summaryLine)) {
      notes.push(summaryLine);
    }

    if (notes.length === 2) {
      break;
    }
  }

  return notes;
}

function scenarioIntensity(classType: string, speedKms: unknown, notes: string[]) {
  const flareScore = flareClassScore(classType);
  const cmeScore = Math.min(1, (asOptionalNumber(speedKms) ?? 0) / 1800);
  const riskScore = notes.length > 0 ? 0.16 : 0;
  return clamp(flareScore * 0.68 + cmeScore * 0.2 + riskScore, 0.35, 1);
}

function severityFromIntensity(intensity: number): SpaceWeatherSeverity {
  if (intensity >= 0.78) {
    return "severe";
  }
  if (intensity >= 0.58) {
    return "strong";
  }
  return "moderate";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
