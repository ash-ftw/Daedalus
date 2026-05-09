import { z } from "zod";
import type {
  AnalysisComponent,
  AnalysisIssue,
  AnalysisResult,
  CanvasObjectPayload,
  ChatMessage,
  DiagramType
} from "../../../shared/src/types";
import { analyzeCanvas } from "./mockAnalyzer";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";

const diagramTypes = [
  "Blank Canvas",
  "Flowchart",
  "ER Diagram - Chen Notation",
  "ER Diagram - Crow's Foot Notation",
  "UML Class Diagram",
  "State Machine Diagram",
  "Basic Circuit Diagram",
  "Logic Gate Diagram",
  "Mind Map",
  "Unknown Diagram"
] as const;

const anthropicAnalysisSchema = z.object({
  diagramType: z.enum(diagramTypes).catch("Unknown Diagram"),
  confidence: z.number().min(0).max(100).catch(50),
  summary: z.string().min(1).catch("Claude analyzed the current canvas."),
  components: z
    .array(
      z.object({
        objectId: z.string().optional(),
        label: z.string().min(1),
        description: z.string().min(1),
        confidence: z.number().min(0).max(100).default(70),
        bounds: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number()
          })
          .optional()
      })
    )
    .default([]),
  issues: z
    .array(
      z.object({
        severity: z.enum(["error", "warning", "suggestion"]).default("suggestion"),
        title: z.string().min(1),
        explanation: z.string().min(1),
        why: z.string().min(1),
        objectIds: z.array(z.string()).default([]),
        suggestion: z.string().min(1)
      })
    )
    .default([]),
  hints: z.array(z.string()).default([]),
  complexityScore: z.number().min(0).max(100).catch(35)
});

function objectContext(objects: CanvasObjectPayload[]) {
  return objects.slice(0, 60).map((object) => ({
    objectId: object.objectId,
    objectType: object.objectType ?? object.type ?? "object",
    text: typeof object.text === "string" ? object.text : undefined,
    left: object.left,
    top: object.top,
    width: object.width,
    height: object.height
  }));
}

function extractJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
}

function imageSource(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Canvas image must be a base64 image data URL");
  }

  return {
    type: "base64",
    media_type: match[1],
    data: match[2]
  };
}

async function anthropicMessage(body: unknown) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic request failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  return (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
}

export async function analyzeCanvasWithAnthropic(roomId: string, objects: CanvasObjectPayload[], imageDataUrl: string): Promise<AnalysisResult> {
  const fallback = analyzeCanvas(roomId, objects);
  const prompt = `Analyze this collaborative technical whiteboard as an educational diagram tutor.

Return only a JSON object with keys: diagramType, confidence, summary, components, issues, hints, complexityScore.
Supported diagram types: ${diagramTypes.join(", ")}.
Do not invent canvas elements. Explain uncertainty. Each issue must include a why explanation.

Canvas object context:
${JSON.stringify(objectContext(objects), null, 2)}`;

  const message = await anthropicMessage({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 1800,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", source: imageSource(imageDataUrl) }
        ]
      }
    ]
  });
  const content = message.content?.find((part) => part.type === "text")?.text;

  if (!content) {
    throw new Error("Anthropic returned an empty analysis response");
  }

  const parsed = anthropicAnalysisSchema.parse(JSON.parse(extractJson(content)));

  return {
    ...fallback,
    provider: "anthropic",
    diagramType: parsed.diagramType as DiagramType,
    confidence: Math.round(parsed.confidence),
    summary: parsed.summary,
    components: parsed.components.map<AnalysisComponent>((component, index) => ({
      id: `anthropic-component-${index}-${component.objectId ?? crypto.randomUUID()}`,
      objectId: component.objectId,
      label: component.label,
      description: component.description,
      confidence: Math.round(component.confidence),
      bounds: component.bounds
    })),
    issues: parsed.issues.map<AnalysisIssue>((issue, index) => ({
      id: `anthropic-issue-${index}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      severity: issue.severity,
      title: issue.title,
      explanation: issue.explanation,
      why: issue.why,
      objectIds: issue.objectIds,
      suggestion: issue.suggestion
    })),
    hints: parsed.hints,
    complexityScore: Math.round(parsed.complexityScore)
  };
}

export async function answerChatWithAnthropic(
  roomId: string,
  authorName: string,
  prompt: string,
  objects: CanvasObjectPayload[],
  imageDataUrl?: string
): Promise<ChatMessage> {
  if (!imageDataUrl) {
    throw new Error("Canvas image is required for Anthropic chat");
  }

  const message = await anthropicMessage({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 800,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an AI technical diagram tutor. Answer ${authorName}'s question using only the visible canvas and this object context: ${JSON.stringify(
              objectContext(objects)
            )}. Question: ${prompt}`
          },
          { type: "image", source: imageSource(imageDataUrl) }
        ]
      }
    ]
  });
  const content = message.content?.find((part) => part.type === "text")?.text?.trim();

  if (!content) {
    throw new Error("Anthropic returned an empty chat response");
  }

  return {
    id: crypto.randomUUID(),
    roomId,
    sender: "ai",
    authorName: "Claude AI Explainer",
    createdAt: new Date().toISOString(),
    content
  };
}
