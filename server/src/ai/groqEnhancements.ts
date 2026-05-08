import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AnalysisResult,
  CanvasObjectPayload,
  GeneratedArtifact,
  LanguageCode,
  LayoutSuggestion,
  SessionDebrief,
  SessionSummary
} from "../../../shared/src/types";
import { generateDiagramArtifact, localizeAnalysis, suggestLayout } from "./phase4Enhancements";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 24;

const artifactKinds = ["sql", "pseudocode", "typescript", "state-machine", "circuit-notes", "markdown"] as const;

const artifactSchema = z.object({
  kind: z.enum(artifactKinds).optional(),
  title: z.string().min(1).max(120),
  language: z.string().min(1).max(80),
  content: z.string().min(1).max(16_000),
  warnings: z.array(z.string().min(1).max(240)).default([])
});

const layoutSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(500),
      impact: z.enum(["low", "medium", "high"]).default("medium"),
      objectIds: z.array(z.string()).default([])
    })
  )
});

const localizedAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  components: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().min(1).max(500)
      })
    )
    .default([]),
  issues: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(120),
        explanation: z.string().min(1).max(700),
        why: z.string().min(1).max(700),
        suggestion: z.string().min(1).max(700)
      })
    )
    .default([]),
  hints: z.array(z.string().min(1).max(300)).default([])
});

const debriefSchema = z.object({
  headline: z.string().min(1).max(300),
  themes: z.array(z.string().min(1).max(400)).default([]),
  instructorActions: z.array(z.string().min(1).max(400)).default([]),
  studentGroupsNeedingHelp: z
    .array(
      z.object({
        roomId: z.string(),
        boardName: z.string().min(1).max(160),
        reason: z.string().min(1).max(400)
      })
    )
    .default([]),
  celebrationPoints: z.array(z.string().min(1).max(400)).default([])
});

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const requestTimestamps: number[] = [];

function groqEnhancementsEnabled() {
  return process.env.AI_PROVIDER === "groq" && Boolean(process.env.GROQ_API_KEY);
}

function cacheTtlMs() {
  const configured = Number(process.env.AI_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_MS;
}

function maxRequestsPerMinute() {
  const configured = Number(process.env.AI_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

function enforceRateLimit() {
  const cutoff = Date.now() - 60_000;

  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= maxRequestsPerMinute()) {
    throw new Error("Groq enhancement rate limit reached");
  }

  requestTimestamps.push(Date.now());
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactObjects(objects: CanvasObjectPayload[]) {
  return objects.slice(0, 60).map((object) => ({
    objectId: object.objectId,
    objectType: object.objectType ?? object.type ?? "object",
    text: typeof object.text === "string" ? object.text.slice(0, 240) : undefined,
    left: object.left,
    top: object.top,
    width: object.width,
    height: object.height
  }));
}

function compactAnalysis(analysis: AnalysisResult) {
  return {
    diagramType: analysis.diagramType,
    confidence: analysis.confidence,
    summary: analysis.summary,
    components: analysis.components.slice(0, 20).map((component) => ({
      id: component.id,
      objectId: component.objectId,
      label: component.label,
      description: component.description
    })),
    issues: analysis.issues.slice(0, 20).map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      title: issue.title,
      explanation: issue.explanation,
      why: issue.why,
      objectIds: issue.objectIds,
      suggestion: issue.suggestion
    })),
    hints: analysis.hints.slice(0, 8)
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
}

async function groqJson<T>(feature: string, payload: unknown, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!groqEnhancementsEnabled()) {
    return null;
  }

  const key = `${feature}:${stableHash(payload)}`;
  const cached = responseCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  enforceRateLimit();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14_000);

  try {
    const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_completion_tokens: 1800,
        top_p: 1,
        stream: false,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Groq enhancement request failed with ${response.status}: ${detail.slice(0, 500)}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned an empty enhancement response");
    }

    const parsed = schema.parse(JSON.parse(extractJson(content)));
    responseCache.set(key, {
      expiresAt: Date.now() + cacheTtlMs(),
      value: parsed
    });
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateDiagramArtifactWithGroq(
  roomId: string,
  objects: CanvasObjectPayload[],
  latestAnalysis?: AnalysisResult
): Promise<GeneratedArtifact> {
  const fallback = generateDiagramArtifact(roomId, objects, latestAnalysis);
  const payload = {
    roomId,
    fallbackKind: fallback.kind,
    analysis: latestAnalysis ? compactAnalysis(latestAnalysis) : undefined,
    objects: compactObjects(objects)
  };
  const prompt = `You are generating implementation output from a student whiteboard diagram.
Return only JSON with: title, language, kind, content, warnings.
kind must be one of: ${artifactKinds.join(", ")}.
Use the provided diagram analysis and object context only. Do not invent requirements, secrets, credentials, or external services.
Prefer practical output:
- ER diagrams: SQL DDL with review notes.
- Flowcharts: pseudocode.
- UML class diagrams: TypeScript class/interface skeletons.
- State machines: state config or transition table.
- Circuits: markdown implementation notes and safety checks.

Context:
${JSON.stringify(payload, null, 2)}`;

  const parsed = await groqJson("artifact", payload, prompt, artifactSchema);

  if (!parsed) {
    return fallback;
  }

  return {
    ...fallback,
    id: crypto.randomUUID(),
    kind: parsed.kind ?? fallback.kind,
    title: parsed.title,
    language: parsed.language,
    content: parsed.content,
    warnings: (parsed.warnings ?? []).slice(0, 6),
    createdAt: new Date().toISOString()
  };
}

export async function suggestLayoutWithGroq(roomId: string, objects: CanvasObjectPayload[]): Promise<LayoutSuggestion[]> {
  const fallback = suggestLayout(roomId, objects);
  const validObjectIds = new Set(objects.map((object) => object.objectId));
  const payload = {
    roomId,
    objects: compactObjects(objects)
  };
  const prompt = `You are reviewing diagram layout quality for a collaborative whiteboard.
Return only JSON: {"suggestions":[{"title":"...","description":"...","impact":"low|medium|high","objectIds":["..."]}]}.
Use only objectIds present in the context. Focus on overlap, reading order, connector clarity, spacing, grouping, and label proximity.
Do not suggest cosmetic color changes unless they affect readability.

Context:
${JSON.stringify(payload, null, 2)}`;
  const parsed = await groqJson("layout", payload, prompt, layoutSchema);

  if (!parsed || parsed.suggestions.length === 0) {
    return fallback;
  }

  const createdAt = new Date().toISOString();
  return parsed.suggestions.slice(0, 6).map((suggestion) => ({
    id: crypto.randomUUID(),
    roomId,
    title: suggestion.title,
    description: suggestion.description,
    impact: suggestion.impact ?? "medium",
    objectIds: (suggestion.objectIds ?? []).filter((objectId) => validObjectIds.has(objectId)).slice(0, 12),
    createdAt
  }));
}

export async function localizeAnalysisWithGroq(analysis: AnalysisResult, language: LanguageCode): Promise<AnalysisResult> {
  const fallback = localizeAnalysis(analysis, language);

  if (language === "en") {
    return fallback;
  }

  const payload = {
    language,
    analysis: compactAnalysis(analysis)
  };
  const prompt = `Translate this technical diagram feedback for students.
Return only JSON with: summary, components, issues, hints.
Keep component ids and issue ids unchanged. Preserve technical meaning and object references.
Target language code: ${language}.

Context:
${JSON.stringify(payload, null, 2)}`;
  const parsed = await groqJson("localize", payload, prompt, localizedAnalysisSchema);

  if (!parsed) {
    return fallback;
  }

  const translatedComponents = new Map((parsed.components ?? []).map((component) => [component.id, component]));
  const translatedIssues = new Map((parsed.issues ?? []).map((issue) => [issue.id, issue]));

  return {
    ...analysis,
    summary: parsed.summary,
    components: analysis.components.map((component) => {
      const translated = translatedComponents.get(component.id);
      return translated
        ? {
            ...component,
            label: translated.label ?? component.label,
            description: translated.description
          }
        : component;
    }),
    issues: analysis.issues.map((issue) => {
      const translated = translatedIssues.get(issue.id);
      return translated
        ? {
            ...issue,
            title: translated.title,
            explanation: translated.explanation,
            why: translated.why,
            suggestion: translated.suggestion
          }
        : issue;
    }),
    hints: parsed.hints && parsed.hints.length > 0 ? parsed.hints : fallback.hints
  };
}

export async function generateSessionDebriefWithGroq(summary: SessionSummary, fallback: SessionDebrief): Promise<SessionDebrief> {
  const validRoomIds = new Set(summary.boards.map((board) => board.roomId));
  const payload = {
    summary,
    fallback
  };
  const prompt = `You are helping an instructor debrief a diagramming session.
Return only JSON with: headline, themes, instructorActions, studentGroupsNeedingHelp, celebrationPoints.
Use only the boards and roomIds present in the session summary. Keep recommendations specific and actionable.

Context:
${JSON.stringify(payload, null, 2)}`;
  const parsed = await groqJson("debrief", payload, prompt, debriefSchema);

  if (!parsed) {
    return fallback;
  }

  return {
    ...fallback,
    generatedAt: new Date().toISOString(),
    headline: parsed.headline,
    themes: (parsed.themes ?? []).slice(0, 6),
    instructorActions: (parsed.instructorActions ?? []).slice(0, 6),
    studentGroupsNeedingHelp: (parsed.studentGroupsNeedingHelp ?? [])
      .filter((group) => validRoomIds.has(group.roomId))
      .slice(0, 8),
    celebrationPoints: (parsed.celebrationPoints ?? []).slice(0, 6)
  };
}
