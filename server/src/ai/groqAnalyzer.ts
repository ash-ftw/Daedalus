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

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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

const componentSchema = z.object({
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
});

const issueSchema = z.object({
  severity: z.enum(["error", "warning", "suggestion"]).default("suggestion"),
  title: z.string().min(1),
  explanation: z.string().min(1),
  why: z.string().min(1),
  objectIds: z.array(z.string()).default([]),
  suggestion: z.string().min(1)
});

const groqAnalysisSchema = z.object({
  diagramType: z.enum(diagramTypes).catch("Unknown Diagram"),
  confidence: z.number().min(0).max(100).catch(50),
  summary: z.string().min(1).catch("Groq analyzed the current canvas."),
  components: z.array(componentSchema).default([]),
  issues: z.array(issueSchema).default([]),
  hints: z.array(z.string()).default([]),
  complexityScore: z.number().min(0).max(100).catch(35)
});

function objectContext(objects: CanvasObjectPayload[]) {
  return objects.slice(0, 40).map((object) => ({
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

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

async function groqCompletion(body: unknown) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Groq request failed with ${response.status}: ${detail.slice(0, 500)}`);
    }

    return (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function analyzeCanvasWithGroq(
  roomId: string,
  objects: CanvasObjectPayload[],
  imageDataUrl: string
): Promise<AnalysisResult> {
  const model = process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
  const fallback = analyzeCanvas(roomId, objects);
  const prompt = `Analyze this collaborative whiteboard canvas as a technical diagram tutor.

Return only a JSON object with this exact shape:
{
  "diagramType": one of ${diagramTypes.join(", ")},
  "confidence": number from 0 to 100,
  "summary": "one short student-friendly paragraph",
  "components": [{"objectId": "optional id from context", "label": "...", "description": "...", "confidence": 0-100}],
  "issues": [{"severity": "error|warning|suggestion", "title": "...", "explanation": "...", "why": "...", "objectIds": ["optional ids from context"], "suggestion": "..."}],
  "hints": ["next step hints"],
  "complexityScore": number from 0 to 100
}

Support flowcharts, ER diagrams, circuit diagrams, UML class diagrams, and state machine diagrams.
For flowcharts, check terminal/process/decision notation, arrow direction, missing branches, unreachable steps, ambiguous labels, and whether loops/decisions have clear outcomes.
For circuits, check closed paths, polarity/source/load labels, and ambiguous component symbols.
For UML class diagrams, check class compartments, typed attributes, method signatures, and relationship clarity.
For state machines, check initial states, directed transitions, event labels, terminal states, and unreachable states.
If the canvas is blank or unrecognizable, say so explicitly. Do not invent elements that are not visible.

Canvas object context:
${JSON.stringify(objectContext(objects), null, 2)}`;

  const completion = await groqCompletion({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl
            }
          }
        ]
      }
    ],
    temperature: 0.2,
    max_completion_tokens: 1600,
    top_p: 1,
    stream: false,
    response_format: { type: "json_object" }
  });

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty analysis response");
  }

  const parsed = groqAnalysisSchema.parse(JSON.parse(extractJson(content)));

  return {
    ...fallback,
    provider: "groq",
    diagramType: parsed.diagramType as DiagramType,
    confidence: Math.round(parsed.confidence),
    summary: parsed.summary,
    components: parsed.components.map<AnalysisComponent>((component, index) => ({
      id: `groq-component-${index}-${component.objectId ?? crypto.randomUUID()}`,
      objectId: component.objectId,
      label: component.label,
      description: component.description,
      confidence: Math.round(component.confidence),
      bounds: component.bounds
    })),
    issues: parsed.issues.map<AnalysisIssue>((issue, index) => ({
      id: `groq-issue-${index}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
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

export async function answerChatWithGroq(
  roomId: string,
  authorName: string,
  prompt: string,
  objects: CanvasObjectPayload[],
  imageDataUrl?: string
): Promise<ChatMessage> {
  if (!imageDataUrl) {
    throw new Error("Canvas image is required for Groq chat");
  }

  const model = process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
  const completion = await groqCompletion({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an AI technical diagram tutor for flowcharts, ER diagrams, circuits, UML class diagrams, and state machines. Answer the user's question using only what is visible in the canvas image and this object context: ${JSON.stringify(
              objectContext(objects)
            )}. User ${authorName} asks: ${prompt}`
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl
            }
          }
        ]
      }
    ],
    temperature: 0.2,
    max_completion_tokens: 700,
    top_p: 1,
    stream: false
  });

  const content = completion.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Groq returned an empty chat response");
  }

  return {
    id: crypto.randomUUID(),
    roomId,
    sender: "ai",
    authorName: "Groq AI Explainer",
    createdAt: new Date().toISOString(),
    content
  };
}
