import type { IncomingMessage, ServerResponse } from "node:http";
import OpenAI from "openai";
import {
  buildFallbackPlannerResponse,
  DEEPSEEK_PLANNER_MODEL,
  parsePlannerResponseJson,
  validatePlannerRequest,
  type PlannerRequest,
  type PlannerResponse,
} from "../src/lib/planner";

type NextFunction = (error?: unknown) => void;

type DeepSeekChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  thinking?: { type: "enabled" | "disabled" };
};

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const PLANNER_TIMEOUT_MS = 18_000;
const MAX_REQUEST_BYTES = 128_000;

const SYSTEM_PROMPT = `You are Photonix Mission Planner for an orbital AI data center demo.

Return only valid json. Do not use markdown or prose outside the json object.
Use only the supplied mission context and modeled values.
If the workload is an auto multi-job queue, reason about splitting jobs across eligible LEO compute nodes based on each job's hardware, deadline, data volume, queue, and downlink constraints.
Do not claim exact orbital pass timing, regulatory certainty, real procurement pricing, or live CelesTrak analysis.

Required json shape:
{
  "source": "deepseek",
  "model": "deepseek-v4-flash",
  "summary": "one short sentence",
  "sections": [
    { "title": "Workload Fit", "body": "..." },
    { "title": "Recommended Satellite Assignment", "body": "..." },
    { "title": "Communication/Downlink Plan", "body": "..." },
    { "title": "Ground Comparison", "body": "..." },
    { "title": "Risk/Assumptions", "body": "..." },
    { "title": "Next Action", "body": "..." }
  ],
  "assumptions": ["..."],
  "warnings": ["..."],
  "confidence": "low|medium|high"
}`;

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function compactMissionContext(request: PlannerRequest) {
  return {
    question: request.question,
    country: request.country,
    workload: request.workload,
    scheduler: request.scheduler,
    routeAssignment: request.routeAssignment,
    comparison: request.comparison,
    computeSatellites: request.computeSatellites.map((satellite) => ({
      id: satellite.id,
      name: satellite.name,
      orbitName: satellite.orbitName,
      gpuType: satellite.gpuType,
      powerKw: satellite.powerKw,
      thermalCapacityKw: satellite.thermalCapacityKw,
      sunlightPercent: satellite.sunlightPercent,
      health: satellite.health,
    })),
    groundStations: request.groundStations.map((station) => ({
      city: station.city,
      lat: station.lat,
      lng: station.lng,
      bandwidthGbps: station.bandwidthGbps,
    })),
  };
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error("Planner request body is too large.");
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body || "{}");
}

async function callDeepSeekPlanner(apiKey: string, request: PlannerRequest): Promise<PlannerResponse> {
  const client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  });

  const params: DeepSeekChatParams = {
    model: DEEPSEEK_PLANNER_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate planner json for this mission context:\n${JSON.stringify(compactMissionContext(request))}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1400,
    temperature: 0.2,
    stream: false,
    thinking: { type: "disabled" },
  };

  const completion = await client.chat.completions.create(params, {
    maxRetries: 0,
    timeout: PLANNER_TIMEOUT_MS,
  });
  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek returned an empty planner response.");
  }

  const parsed = parsePlannerResponseJson(content);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.value;
}

function buildPlannerFailureFallback(request: PlannerRequest, reason: string) {
  return buildFallbackPlannerResponse(request, [
    `DeepSeek planner unavailable or invalid; deterministic fallback shown. ${reason}`,
  ]);
}

export function createPlannerMiddleware(apiKey?: string) {
  return async function plannerMiddleware(request: IncomingMessage, response: ServerResponse, next: NextFunction) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Use POST /api/planner." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const plannerRequest = validatePlannerRequest(body);

      if (!plannerRequest.ok) {
        sendJson(response, 400, { error: plannerRequest.error });
        return;
      }

      if (!apiKey) {
        sendJson(
          response,
          200,
          buildFallbackPlannerResponse(plannerRequest.value, [
            "DEEPSEEK_API_KEY is not configured; deterministic fallback shown.",
          ]),
        );
        return;
      }

      try {
        sendJson(response, 200, await callDeepSeekPlanner(apiKey, plannerRequest.value));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown DeepSeek error.";
        sendJson(response, 200, buildPlannerFailureFallback(plannerRequest.value, reason));
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: "Planner request body must be valid JSON." });
        return;
      }

      if (error instanceof Error && error.message.includes("too large")) {
        sendJson(response, 413, { error: error.message });
        return;
      }

      next(error);
    }
  };
}
