import { z } from "zod";
import type { CanvasObjectPayload, DiagramType, GeneratedDiagram } from "../../../shared/src/types";

type AiProvider = GeneratedDiagram["provider"];
type ConnectionAnchor = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-right" | "bottom-left";
type NodeKind =
  | "process"
  | "terminal"
  | "decision"
  | "data"
  | "entity"
  | "attribute"
  | "relationship"
  | "class"
  | "state"
  | "start"
  | "end"
  | "component"
  | "note"
  | "mind";

interface DiagramNode {
  id: string;
  kind: NodeKind;
  label: string;
  details: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface DiagramSpec {
  title: string;
  diagramType: DiagramType;
  summary: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface GenerateDiagramInput {
  roomId: string;
  prompt: string;
  provider: string;
  authorId: string;
}

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";
const FONT_FAMILY = "Inter, Arial, sans-serif";
const DEFAULT_FILL = "#ffffff";
const DEFAULT_STROKE = "#111111";
const TEXT_FILL = "#111111";
const STROKE_PALETTE = ["#111111"];

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

const nodeKinds = [
  "process",
  "terminal",
  "decision",
  "data",
  "entity",
  "attribute",
  "relationship",
  "class",
  "state",
  "start",
  "end",
  "component",
  "note",
  "mind"
] as const;

const diagramSpecSchema = z.object({
  title: z.string().min(1).max(80).catch("Generated Diagram"),
  diagramType: z.enum(diagramTypes).catch("Flowchart"),
  summary: z.string().min(1).max(300).catch("Generated from the prompt."),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(48),
        kind: z.enum(nodeKinds).catch("process"),
        label: z.string().min(1).max(80),
        details: z.array(z.string().min(1).max(90)).default([]),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional()
      })
    )
    .min(2)
    .max(12),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(48),
        to: z.string().min(1).max(48),
        label: z.string().min(1).max(40).optional()
      })
    )
    .max(18)
    .default([])
});

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "diagram";

const hasEnvValue = (value: string | undefined) => Boolean(value?.trim());

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function promptTitle(prompt: string, fallback = "Generated Diagram") {
  const trimmed = prompt
    .replace(/\b(flowchart|diagram|uml|class|er|state machine|mind map|circuit|logic gate)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return trimmed ? titleCase(trimmed) : fallback;
}

function inferDiagramType(prompt: string): DiagramType {
  const lower = prompt.toLowerCase();

  if (/\b(uml|class diagram|classes|interface|inheritance)\b/.test(lower)) {
    return "UML Class Diagram";
  }

  if (/\b(er diagram|entity relationship|database schema|chen|crow'?s foot|table relationship)\b/.test(lower)) {
    return lower.includes("crow") ? "ER Diagram - Crow's Foot Notation" : "ER Diagram - Chen Notation";
  }

  if (/\b(state machine|state diagram|states|transition|lifecycle)\b/.test(lower)) {
    return "State Machine Diagram";
  }

  if (/\b(logic gate|and gate|or gate|xor|truth table)\b/.test(lower)) {
    return "Logic Gate Diagram";
  }

  if (/\b(circuit|battery|resistor|capacitor|led|voltage|ground)\b/.test(lower)) {
    return "Basic Circuit Diagram";
  }

  if (/\b(mind map|brainstorm|branches|concept map)\b/.test(lower)) {
    return "Mind Map";
  }

  return "Flowchart";
}

function cleanLabel(value: string) {
  return value
    .replace(/\b(flowchart|diagram|build|create|make|for|about|using|with)\b/gi, " ")
    .replace(/[^a-z0-9\s/-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(prompt: string, defaults: string[], maxItems = 5) {
  const normalized = prompt
    .replace(/->|=>|→/g, " then ")
    .replace(/\b(after that|followed by|finally|next)\b/gi, " then ");
  const pieces = normalized
    .split(/\bthen\b|,|;|\n/gi)
    .map(cleanLabel)
    .filter((piece) => piece.length >= 3 && piece.length <= 70);
  const unique = [...new Set(pieces)].slice(0, maxItems);

  return unique.length > 0 ? unique.map((item) => titleCase(item)) : defaults;
}

function wordCandidates(prompt: string, defaults: string[], maxItems = 4) {
  const ignored = new Set([
    "build",
    "create",
    "make",
    "diagram",
    "flowchart",
    "system",
    "process",
    "using",
    "with",
    "for",
    "and",
    "the",
    "from",
    "into",
    "that",
    "this"
  ]);
  const words = prompt
    .split(/[^a-z0-9]+/gi)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 3 && !ignored.has(word));
  const unique = [...new Set(words)].slice(0, maxItems);

  return unique.length > 0 ? unique.map((word) => titleCase(word)) : defaults;
}

function edge(from: string, to: string, label?: string): DiagramEdge {
  return label ? { from, to, label } : { from, to };
}

function twoNumberComparisonSpec(prompt: string): DiagramSpec | null {
  const lower = prompt.toLowerCase();
  const mentionsTwoNumbers = /\b(two|2)\b/.test(lower) && /\bnumbers?\b/.test(lower);
  const wantsLargest = /\b(largest|greater|greatest|maximum|max)\b/.test(lower);
  const wantsSmallest = /\b(smallest|lesser|least|minimum|min)\b/.test(lower);

  if (!mentionsTwoNumbers || (!wantsLargest && !wantsSmallest)) {
    return null;
  }

  const comparison = wantsSmallest ? "A < B?" : "A > B?";
  const yesLabel = wantsSmallest ? "Print A as smallest" : "Print A as largest";
  const noLabel = wantsSmallest ? "Print B as smallest" : "Print B as largest";
  const resultLabel = wantsSmallest ? "smaller" : "larger";

  return {
    title: wantsSmallest ? "Smallest Of Two Numbers" : "Largest Of Two Numbers",
    diagramType: "Flowchart",
    summary: `A complete flowchart for reading two numbers, comparing them, printing the ${resultLabel} value, and ending.`,
    nodes: [
      { id: "start", kind: "terminal", label: "Start", details: [], x: 420, y: 70, width: 150, height: 64 },
      { id: "input", kind: "data", label: "Input A and B", details: [], x: 420, y: 180, width: 230, height: 72 },
      { id: "compare", kind: "decision", label: comparison, details: [], x: 420, y: 315, width: 190, height: 110 },
      { id: "print-a", kind: "data", label: yesLabel, details: [], x: 220, y: 465, width: 230, height: 72 },
      { id: "print-b", kind: "data", label: noLabel, details: [], x: 620, y: 465, width: 230, height: 72 },
      { id: "stop", kind: "terminal", label: "Stop", details: [], x: 420, y: 620, width: 150, height: 64 }
    ],
    edges: [
      edge("start", "input"),
      edge("input", "compare"),
      edge("compare", "print-a", "Yes"),
      edge("compare", "print-b", "No"),
      edge("print-a", "stop"),
      edge("print-b", "stop")
    ]
  };
}

function oddEvenSpec(prompt: string): DiagramSpec | null {
  const lower = prompt.toLowerCase();
  const wantsOddEven = /\b(odd|even)\b/.test(lower) && /\b(number|integer|n)\b/.test(lower);

  if (!wantsOddEven) {
    return null;
  }

  return {
    title: "Odd Or Even Number",
    diagramType: "Flowchart",
    summary: "A complete flowchart for reading a number, checking divisibility by two, printing odd or even, and stopping.",
    nodes: [
      { id: "start", kind: "terminal", label: "Start", details: [], x: 420, y: 70, width: 150, height: 64 },
      { id: "input", kind: "data", label: "Read N", details: [], x: 420, y: 180, width: 210, height: 72 },
      { id: "check", kind: "decision", label: "N % 2 = 0?", details: [], x: 420, y: 315, width: 190, height: 110 },
      { id: "even", kind: "data", label: "Print Even", details: [], x: 220, y: 465, width: 210, height: 72 },
      { id: "odd", kind: "data", label: "Print Odd", details: [], x: 620, y: 465, width: 210, height: 72 },
      { id: "stop", kind: "terminal", label: "Stop", details: [], x: 420, y: 620, width: 150, height: 64 }
    ],
    edges: [
      edge("start", "input"),
      edge("input", "check"),
      edge("check", "even", "Yes"),
      edge("check", "odd", "No"),
      edge("even", "stop"),
      edge("odd", "stop")
    ]
  };
}

function flowchartSpec(prompt: string): DiagramSpec {
  const comparisonSpec = twoNumberComparisonSpec(prompt) ?? oddEvenSpec(prompt);

  if (comparisonSpec) {
    return comparisonSpec;
  }

  const steps = extractItems(prompt, ["Collect Request", "Validate Input", "Process Work", "Return Result"], 4);
  const wantsDecision = /\b(if|decision|check|valid|approve|reject|yes|no|branch|condition)\b/i.test(prompt);
  const title = promptTitle(prompt, "Generated Flowchart");

  if (wantsDecision) {
    const primary = steps[0] ?? "Collect Request";
    const decision = steps[1] ?? "Valid Request?";
    const success = steps[2] ?? "Process Request";
    const fallback = steps[3] ?? "Handle Exception";

    return {
      title,
      diagramType: "Flowchart",
      summary: "A generated flowchart with a decision branch and completion path.",
      nodes: [
        { id: "start", kind: "terminal", label: "Start", details: [], x: 420, y: 80, width: 150, height: 64 },
        { id: "primary", kind: "process", label: primary, details: [], x: 420, y: 190, width: 210, height: 72 },
        { id: "decision", kind: "decision", label: decision.endsWith("?") ? decision : `${decision}?`, details: [], x: 420, y: 320, width: 190, height: 110 },
        { id: "success", kind: "process", label: success, details: [], x: 235, y: 465, width: 210, height: 72 },
        { id: "fallback", kind: "process", label: fallback, details: [], x: 605, y: 465, width: 210, height: 72 },
        { id: "stop", kind: "terminal", label: "Stop", details: [], x: 420, y: 610, width: 150, height: 64 }
      ],
      edges: [
        edge("start", "primary"),
        edge("primary", "decision"),
        edge("decision", "success", "Yes"),
        edge("decision", "fallback", "No"),
        edge("success", "stop"),
        edge("fallback", "stop")
      ]
    };
  }

  const nodes: DiagramNode[] = [
    { id: "start", kind: "terminal", label: "Start", details: [], x: 420, y: 80, width: 150, height: 64 },
    ...steps.map((step, index) => ({
      id: `step-${index + 1}`,
      kind: "process" as const,
      label: step,
      details: [],
      x: 420,
      y: 190 + index * 112,
      width: 230,
      height: 72
    })),
    { id: "stop", kind: "terminal", label: "Stop", details: [], x: 420, y: 190 + steps.length * 112, width: 150, height: 64 }
  ];

  return {
    title,
    diagramType: "Flowchart",
    summary: "A generated top-down flowchart from the prompt.",
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => edge(node.id, nodes[index + 1].id))
  };
}

function umlSpec(prompt: string): DiagramSpec {
  const classes = wordCandidates(prompt, ["User", "Diagram", "Prompt"], 3);
  const normalized = classes.length >= 2 ? classes : ["User", "Diagram", "Prompt"];
  const nodes = normalized.map<DiagramNode>((name, index) => ({
    id: `class-${index + 1}`,
    kind: "class",
    label: name,
    details:
      index === 0
        ? ["+ id: UUID", "+ name: string", "+ submitPrompt(): Diagram"]
        : index === 1
          ? ["+ id: UUID", "+ title: string", "+ render(): void"]
          : ["+ id: UUID", "+ text: string", "+ validate(): boolean"],
    x: 170 + index * 285,
    y: index === 1 ? 120 : 260,
    width: 230,
    height: 155
  }));

  return {
    title: promptTitle(prompt, "Generated UML Model"),
    diagramType: "UML Class Diagram",
    summary: "A generated UML class diagram with typed members and associations.",
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => edge(node.id, nodes[index + 1].id, index === 0 ? "uses" : "creates"))
  };
}

function erSpec(prompt: string): DiagramSpec {
  const entities = wordCandidates(prompt, ["User", "Diagram", "Prompt"], 3);
  const left = entities[0] ?? "User";
  const right = entities[1] ?? "Diagram";

  return {
    title: promptTitle(prompt, "Generated ER Diagram"),
    diagramType: inferDiagramType(prompt).includes("Crow") ? "ER Diagram - Crow's Foot Notation" : "ER Diagram - Chen Notation",
    summary: "A generated ER diagram with entities, a relationship, and sample attributes.",
    nodes: [
      { id: "entity-left", kind: "entity", label: left, details: [], x: 170, y: 230, width: 170, height: 70 },
      { id: "relationship", kind: "relationship", label: "Relates To", details: [], x: 430, y: 230, width: 170, height: 104 },
      { id: "entity-right", kind: "entity", label: right, details: [], x: 690, y: 230, width: 170, height: 70 },
      { id: "attr-left-id", kind: "attribute", label: `${left} ID`, details: [], x: 110, y: 355, width: 145, height: 56 },
      { id: "attr-right-id", kind: "attribute", label: `${right} ID`, details: [], x: 750, y: 355, width: 145, height: 56 }
    ],
    edges: [
      edge("entity-left", "relationship", "1"),
      edge("relationship", "entity-right", "N"),
      edge("entity-left", "attr-left-id"),
      edge("entity-right", "attr-right-id")
    ]
  };
}

function stateSpec(prompt: string): DiagramSpec {
  const states = extractItems(prompt, ["Idle", "Submitted", "Generating", "Ready"], 4);
  const nodes: DiagramNode[] = [
    { id: "start", kind: "start", label: "Start", details: [], x: 80, y: 220, width: 38, height: 38 },
    ...states.map((state, index) => ({
      id: `state-${index + 1}`,
      kind: "state" as const,
      label: state,
      details: [],
      x: 190 + index * 185,
      y: index % 2 === 0 ? 180 : 310,
      width: 155,
      height: 72
    })),
    { id: "end", kind: "end", label: "End", details: [], x: 190 + states.length * 185, y: states.length % 2 === 0 ? 180 : 310, width: 48, height: 48 }
  ];

  return {
    title: promptTitle(prompt, "Generated State Machine"),
    diagramType: "State Machine Diagram",
    summary: "A generated state machine with ordered transitions.",
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => edge(node.id, nodes[index + 1].id, index === 0 ? "init" : "event"))
  };
}

function circuitSpec(prompt: string): DiagramSpec {
  const logic = inferDiagramType(prompt) === "Logic Gate Diagram";

  if (logic) {
    return {
      title: promptTitle(prompt, "Generated Logic Gate Diagram"),
      diagramType: "Logic Gate Diagram",
      summary: "A generated logic gate diagram with inputs, gates, and output.",
      nodes: [
        { id: "input-a", kind: "component", label: "Input A", details: [], x: 120, y: 180, width: 130, height: 54 },
        { id: "input-b", kind: "component", label: "Input B", details: [], x: 120, y: 310, width: 130, height: 54 },
        { id: "gate", kind: "decision", label: "AND", details: [], x: 390, y: 245, width: 150, height: 96 },
        { id: "output", kind: "component", label: "Output", details: [], x: 640, y: 245, width: 135, height: 58 }
      ],
      edges: [edge("input-a", "gate"), edge("input-b", "gate"), edge("gate", "output")]
    };
  }

  return {
    title: promptTitle(prompt, "Generated Circuit"),
    diagramType: "Basic Circuit Diagram",
    summary: "A generated basic circuit with source, control, load, and return path.",
    nodes: [
      { id: "battery", kind: "component", label: "Battery", details: [], x: 130, y: 260, width: 120, height: 70 },
      { id: "switch", kind: "component", label: "Switch", details: [], x: 330, y: 155, width: 120, height: 58 },
      { id: "resistor", kind: "component", label: "R1", details: [], x: 535, y: 155, width: 120, height: 58 },
      { id: "led", kind: "component", label: "LED", details: [], x: 725, y: 260, width: 110, height: 58 },
      { id: "ground", kind: "component", label: "Ground", details: [], x: 430, y: 395, width: 120, height: 54 }
    ],
    edges: [edge("battery", "switch", "+"), edge("switch", "resistor"), edge("resistor", "led"), edge("led", "ground"), edge("ground", "battery", "-")]
  };
}

function mindMapSpec(prompt: string): DiagramSpec {
  const branches = wordCandidates(prompt, ["Inputs", "Process", "Outputs", "Risks", "Metrics"], 5);

  return {
    title: promptTitle(prompt, "Generated Mind Map"),
    diagramType: "Mind Map",
    summary: "A generated mind map with branches around the central topic.",
    nodes: [
      { id: "center", kind: "mind", label: promptTitle(prompt, "Topic"), details: [], x: 430, y: 270, width: 190, height: 82 },
      ...branches.map((branch, index) => {
        const angle = (-Math.PI / 2) + (index * Math.PI * 2) / branches.length;
        return {
          id: `branch-${index + 1}`,
          kind: "mind" as const,
          label: branch,
          details: [],
          x: 430 + Math.cos(angle) * 270,
          y: 270 + Math.sin(angle) * 175,
          width: 160,
          height: 64
        };
      })
    ],
    edges: branches.map((_, index) => edge("center", `branch-${index + 1}`))
  };
}

function localSpec(prompt: string): DiagramSpec {
  const comparisonSpec = twoNumberComparisonSpec(prompt);

  if (comparisonSpec) {
    return comparisonSpec;
  }

  const diagramType = inferDiagramType(prompt);

  if (diagramType === "UML Class Diagram") {
    return umlSpec(prompt);
  }

  if (diagramType.includes("ER Diagram")) {
    return erSpec(prompt);
  }

  if (diagramType === "State Machine Diagram") {
    return stateSpec(prompt);
  }

  if (diagramType === "Basic Circuit Diagram" || diagramType === "Logic Gate Diagram") {
    return circuitSpec(prompt);
  }

  if (diagramType === "Mind Map") {
    return mindMapSpec(prompt);
  }

  return flowchartSpec(prompt);
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

function generationInstruction(prompt: string) {
  return `Create a concise technical diagram plan from this user prompt: ${prompt}

Return only JSON with this shape:
{
  "title": "short diagram title",
  "diagramType": one of ${diagramTypes.join(", ")},
  "summary": "one sentence",
  "nodes": [{"id":"stable-id","kind":"${nodeKinds.join("|")}","label":"short label","details":["optional short detail lines"]}],
  "edges": [{"from":"node id","to":"node id","label":"optional edge label"}]
}

Rules:
- Use 3 to 8 nodes.
- Use short labels that fit inside boxes.
- Pick a standard diagram type when the user names one.
- For UML class diagrams, use kind "class" and include typed attributes or methods in details.
- For ER diagrams, use "entity", "relationship", and "attribute" node kinds.
- For flowcharts, use "terminal", "process", "decision", and "data" node kinds.
- Do not include markdown or explanatory text outside the JSON.`;
}

async function groqSpec(prompt: string): Promise<DiagramSpec> {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
      messages: [{ role: "user", content: generationInstruction(prompt) }],
      temperature: 0.25,
      max_completion_tokens: 1400,
      top_p: 1,
      stream: false,
      response_format: { type: "json_object" }
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Groq request failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty diagram response");
  }

  return diagramSpecSchema.parse(JSON.parse(extractJson(content)));
}

async function anthropicSpec(prompt: string): Promise<DiagramSpec> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1400,
      temperature: 0.25,
      messages: [{ role: "user", content: generationInstruction(prompt) }]
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic request failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const content = payload.content?.find((part) => part.type === "text")?.text;

  if (!content) {
    throw new Error("Anthropic returned an empty diagram response");
  }

  return diagramSpecSchema.parse(JSON.parse(extractJson(content)));
}

function normalizeSpec(spec: DiagramSpec, prompt: string): DiagramSpec {
  const fallback = localSpec(prompt);
  const seen = new Set<string>();
  const nodes = spec.nodes
    .map((node, index) => ({
      ...node,
      id: slug(node.id || `node-${index + 1}`),
      label: node.label.trim().slice(0, 80) || `Step ${index + 1}`,
      details: node.details.map((detail) => detail.trim()).filter(Boolean).slice(0, 5)
    }))
    .filter((node) => {
      if (seen.has(node.id)) {
        return false;
      }

      seen.add(node.id);
      return true;
    })
    .slice(0, 12);
  const validIds = new Set(nodes.map((node) => node.id));
  const edges = spec.edges.filter((candidate) => validIds.has(candidate.from) && validIds.has(candidate.to)).slice(0, 18);

  const normalized = {
    title: spec.title.trim().slice(0, 80) || fallback.title,
    diagramType: spec.diagramType,
    summary: spec.summary.trim().slice(0, 300) || fallback.summary,
    nodes: nodes.length >= 2 ? nodes : fallback.nodes,
    edges: edges.length > 0 ? edges : fallback.edges
  };

  return normalized.diagramType === "Flowchart" ? withFlowchartTerminals(normalized) : normalized;
}

function isStartNode(node: DiagramNode) {
  return /^start$/i.test(node.label.trim()) || /^start$/i.test(node.id.trim());
}

function isStopNode(node: DiagramNode) {
  return /^(stop|end)$/i.test(node.label.trim()) || /^(stop|end)$/i.test(node.id.trim());
}

function withFlowchartTerminals(spec: DiagramSpec): DiagramSpec {
  const nodes = spec.nodes.map((node) => {
    if (isStartNode(node)) {
      return { ...node, kind: "terminal" as const, label: "Start" };
    }

    if (isStopNode(node)) {
      return { ...node, kind: "terminal" as const, label: "Stop" };
    }

    if (/\b(read|input|print|output|display|show)\b/i.test(node.label)) {
      return { ...node, kind: "data" as const };
    }

    if (/[?<>=%]|\b(if|check|compare|is|has)\b/i.test(node.label)) {
      return { ...node, kind: "decision" as const };
    }

    return node.kind === "terminal" ? { ...node, kind: "process" as const } : node;
  });
  const edges = [...spec.edges];
  const hasStart = nodes.some(isStartNode);
  const hasStop = nodes.some(isStopNode);

  if (!hasStart) {
    const minY = Math.min(...nodes.map((node) => node.y ?? 190));
    const averageX = nodes.reduce((sum, node) => sum + (node.x ?? 420), 0) / Math.max(1, nodes.length);
    const sourceIds = new Set(edges.map((candidate) => candidate.to));
    const firstNode = nodes.find((node) => !sourceIds.has(node.id)) ?? nodes[0];

    nodes.unshift({
      id: "start",
      kind: "terminal",
      label: "Start",
      details: [],
      x: Math.round(averageX),
      y: minY - 120,
      width: 150,
      height: 64
    });

    if (firstNode) {
      edges.unshift(edge("start", firstNode.id));
    }
  }

  if (!hasStop) {
    const maxY = Math.max(...nodes.map((node) => node.y ?? 190));
    const averageX = nodes.reduce((sum, node) => sum + (node.x ?? 420), 0) / Math.max(1, nodes.length);
    const outgoingIds = new Set(edges.map((candidate) => candidate.from));
    const sinkNodes = nodes.filter((node) => node.id !== "start" && !outgoingIds.has(node.id));

    nodes.push({
      id: "stop",
      kind: "terminal",
      label: "Stop",
      details: [],
      x: Math.round(averageX),
      y: maxY + 120,
      width: 150,
      height: 64
    });

    sinkNodes.forEach((node) => edges.push(edge(node.id, "stop")));
  }

  return {
    ...spec,
    nodes,
    edges
  };
}

function boundsFor(node: DiagramNode, index: number, total: number) {
  if (typeof node.x === "number" && typeof node.y === "number") {
    return {
      centerX: node.x,
      centerY: node.y,
      width: Math.max(44, Math.min(280, node.width ?? defaultWidth(node))),
      height: Math.max(38, Math.min(180, node.height ?? defaultHeight(node)))
    };
  }

  const diagramWidth = Math.min(760, Math.max(420, total * 145));
  const startX = 430 - diagramWidth / 2;
  const x = startX + (diagramWidth / Math.max(1, total - 1)) * index;
  const y = index % 2 === 0 ? 210 : 340;

  return {
    centerX: Math.round(x),
    centerY: y,
    width: defaultWidth(node),
    height: defaultHeight(node)
  };
}

function defaultWidth(node: DiagramNode) {
  if (node.kind === "class") {
    return 230;
  }

  if (node.kind === "decision" || node.kind === "relationship") {
    return 180;
  }

  if (node.kind === "start" || node.kind === "end") {
    return 56;
  }

  return Math.max(135, Math.min(240, node.label.length * 8 + 70));
}

function defaultHeight(node: DiagramNode) {
  if (node.kind === "class") {
    return 142;
  }

  if (node.kind === "decision" || node.kind === "relationship") {
    return 102;
  }

  if (node.kind === "start" || node.kind === "end") {
    return 56;
  }

  return node.details.length > 0 ? 82 : 64;
}

function textObject(
  objectId: string,
  authorId: string,
  label: string,
  left: number,
  top: number,
  width: number,
  fill = TEXT_FILL,
  fontSize = 16,
  attachment?: {
    attachedToObjectId?: string;
    attachedOffsetX?: number;
    attachedOffsetY?: number;
  }
): CanvasObjectPayload {
  return {
    objectId,
    objectType: "text",
    authorId,
    type: "textbox",
    left,
    top,
    width,
    text: label,
    fill,
    fontSize,
    fontFamily: FONT_FAMILY,
    fontWeight: label.includes("\n") ? "400" : "700",
    textAlign: "center",
    selectable: attachment?.attachedToObjectId ? true : undefined,
    evented: attachment?.attachedToObjectId ? true : undefined,
    ...attachment
  };
}

function nodeTextObject(
  objectId: string,
  authorId: string,
  label: string,
  left: number,
  top: number,
  width: number,
  shapeId: string,
  shapeLeft: number,
  shapeTop: number,
  fontSize = 16
) {
  return textObject(objectId, authorId, label, left, top, width, TEXT_FILL, fontSize, {
    attachedToObjectId: shapeId,
    attachedOffsetX: left - shapeLeft,
    attachedOffsetY: top - shapeTop
  });
}

function lineObject(
  objectId: string,
  authorId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke = DEFAULT_STROKE,
  attachment?: {
    sourceObjectId?: string;
    targetObjectId?: string;
    sourceAnchor?: ConnectionAnchor;
    targetAnchor?: ConnectionAnchor;
  }
): CanvasObjectPayload {
  return {
    objectId,
    objectType: "connector",
    authorId,
    type: "line",
    x1,
    y1,
    x2,
    y2,
    stroke,
    strokeWidth: 3,
    strokeLineCap: "round",
    strokeUniform: true,
    ...attachment
  };
}

function shapeObjects(node: DiagramNode, index: number, authorId: string, prefix: string, bounds: ReturnType<typeof boundsFor>): CanvasObjectPayload[] {
  const stroke = STROKE_PALETTE[index % STROKE_PALETTE.length];
  const left = Math.round(bounds.centerX - bounds.width / 2);
  const top = Math.round(bounds.centerY - bounds.height / 2);
  const shapeId = `${prefix}-${node.id}-shape`;
  const labelId = `${prefix}-${node.id}-label`;
  const labelTop = node.kind === "class" ? top + 12 : top + Math.max(10, bounds.height / 2 - 11);
  const detailText = node.details.join("\n");

  if (node.kind === "decision" || node.kind === "relationship") {
    return [
      {
        objectId: shapeId,
        objectType: node.kind === "relationship" ? "er-relationship" : "diamond",
        authorId,
        type: "polygon",
        left,
        top,
        points: [
          { x: bounds.width / 2, y: 0 },
          { x: bounds.width, y: bounds.height / 2 },
          { x: bounds.width / 2, y: bounds.height },
          { x: 0, y: bounds.height / 2 }
        ],
        fill: DEFAULT_FILL,
        stroke,
        strokeWidth: 3,
        strokeUniform: true
      },
      nodeTextObject(labelId, authorId, node.label, left + 24, top + bounds.height / 2 - 11, bounds.width - 48, shapeId, left, top, 15)
    ];
  }

  if (["terminal", "attribute", "state", "mind", "start", "end"].includes(node.kind)) {
    const isFilled = node.kind === "start" || node.kind === "end";
    return [
      {
        objectId: shapeId,
        objectType: node.kind === "attribute" ? "er-attribute" : node.kind === "start" ? "state-start" : node.kind === "end" ? "state-end" : "ellipse",
        authorId,
        type: "ellipse",
        left,
        top,
        rx: bounds.width / 2,
        ry: bounds.height / 2,
        fill: isFilled ? stroke : DEFAULT_FILL,
        stroke,
        strokeWidth: 3,
        strokeUniform: true
      },
      ...(node.kind === "start" || node.kind === "end"
        ? []
        : [nodeTextObject(labelId, authorId, node.label, left + 12, labelTop, bounds.width - 24, shapeId, left, top, node.kind === "mind" ? 15 : 16)])
    ];
  }

  if (node.kind === "data") {
    return [
      {
        objectId: shapeId,
        objectType: "parallelogram",
        authorId,
        type: "polygon",
        left,
        top,
        points: [
          { x: 22, y: 0 },
          { x: bounds.width, y: 0 },
          { x: bounds.width - 22, y: bounds.height },
          { x: 0, y: bounds.height }
        ],
        fill: DEFAULT_FILL,
        stroke,
        strokeWidth: 3,
        strokeUniform: true
      },
      nodeTextObject(labelId, authorId, node.label, left + 22, labelTop, bounds.width - 44, shapeId, left, top, 16)
    ];
  }

  const objectType = node.kind === "class" ? "uml-class" : node.kind === "entity" ? "er-entity" : "rectangle";
  const rect: CanvasObjectPayload = {
    objectId: shapeId,
    objectType,
    authorId,
    type: "rect",
    left,
    top,
    width: bounds.width,
    height: bounds.height,
    rx: node.kind === "class" ? 4 : 7,
    ry: node.kind === "class" ? 4 : 7,
    fill: DEFAULT_FILL,
    stroke,
    strokeWidth: 3,
    strokeUniform: true
  };

  if (node.kind !== "class") {
    return [rect, nodeTextObject(labelId, authorId, node.label, left + 12, labelTop, bounds.width - 24, shapeId, left, top, 16)];
  }

  return [
    rect,
    lineObject(`${prefix}-${node.id}-divider-1`, authorId, left, top + 38, left + bounds.width, top + 38, stroke),
    lineObject(`${prefix}-${node.id}-divider-2`, authorId, left, top + 86, left + bounds.width, top + 86, stroke),
    nodeTextObject(labelId, authorId, node.label, left + 12, top + 11, bounds.width - 24, shapeId, left, top, 17),
    nodeTextObject(`${prefix}-${node.id}-body`, authorId, detailText || "+ id: UUID", left + 14, top + 49, bounds.width - 28, shapeId, left, top, 14)
  ];
}

function anchorPoint(bounds: ReturnType<typeof boundsFor>, anchor: ConnectionAnchor) {
  const left = bounds.centerX - bounds.width / 2;
  const right = bounds.centerX + bounds.width / 2;
  const top = bounds.centerY - bounds.height / 2;
  const bottom = bounds.centerY + bounds.height / 2;

  const points: Record<ConnectionAnchor, { x: number; y: number }> = {
    top: { x: bounds.centerX, y: top },
    right: { x: right, y: bounds.centerY },
    bottom: { x: bounds.centerX, y: bottom },
    left: { x: left, y: bounds.centerY },
    "top-left": { x: left, y: top },
    "top-right": { x: right, y: top },
    "bottom-right": { x: right, y: bottom },
    "bottom-left": { x: left, y: bottom }
  };

  return points[anchor];
}

function connectionAnchors(from: ReturnType<typeof boundsFor>, to: ReturnType<typeof boundsFor>) {
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  const mostlyVertical = Math.abs(dy) >= Math.abs(dx) * 0.72;

  if (mostlyVertical) {
    return {
      sourceAnchor: dy >= 0 ? ("bottom" as const) : ("top" as const),
      targetAnchor: dy >= 0 ? ("top" as const) : ("bottom" as const)
    };
  }

  return {
    sourceAnchor: dx >= 0 ? ("right" as const) : ("left" as const),
    targetAnchor: dx >= 0 ? ("left" as const) : ("right" as const)
  };
}

function connectionPoint(from: ReturnType<typeof boundsFor>, to: ReturnType<typeof boundsFor>) {
  const anchors = connectionAnchors(from, to);
  const sourcePoint = anchorPoint(from, anchors.sourceAnchor);
  const targetPoint = anchorPoint(to, anchors.targetAnchor);

  return {
    ...anchors,
    x1: sourcePoint.x,
    y1: sourcePoint.y,
    x2: targetPoint.x,
    y2: targetPoint.y
  };
}

function specToObjects(spec: DiagramSpec, authorId: string): CanvasObjectPayload[] {
  const prefix = `gen-${slug(spec.title)}-${crypto.randomUUID().slice(0, 8)}`;
  const bounds = new Map<string, ReturnType<typeof boundsFor>>();
  const nodeObjects: CanvasObjectPayload[] = [];
  const edgeObjects: CanvasObjectPayload[] = [];
  const edgeLabelObjects: CanvasObjectPayload[] = [];

  spec.nodes.forEach((node, index) => {
    const nodeBounds = boundsFor(node, index, spec.nodes.length);
    bounds.set(node.id, nodeBounds);
    nodeObjects.push(...shapeObjects(node, index, authorId, prefix, nodeBounds));
  });

  spec.edges.forEach((candidate, index) => {
    const from = bounds.get(candidate.from);
    const to = bounds.get(candidate.to);

    if (!from || !to) {
      return;
    }

    const points = connectionPoint(from, to);
    const stroke = STROKE_PALETTE[index % STROKE_PALETTE.length];
    const edgeId = `${prefix}-edge-${index + 1}`;
    edgeObjects.push(
      lineObject(edgeId, authorId, points.x1, points.y1, points.x2, points.y2, stroke, {
        sourceObjectId: `${prefix}-${candidate.from}-shape`,
        targetObjectId: `${prefix}-${candidate.to}-shape`,
        sourceAnchor: points.sourceAnchor,
        targetAnchor: points.targetAnchor
      })
    );

    if (candidate.label) {
      edgeLabelObjects.push(
        textObject(
          `${edgeId}-label`,
          authorId,
          candidate.label,
          (points.x1 + points.x2) / 2 - 36,
          (points.y1 + points.y2) / 2 - 18,
          72,
          stroke,
          13,
          {
            attachedToObjectId: edgeId,
            attachedOffsetX: -36,
            attachedOffsetY: -18
          }
        )
      );
    }
  });

  return [...edgeObjects, ...nodeObjects, ...edgeLabelObjects];
}

export async function generateDiagramFromPrompt(input: GenerateDiagramInput): Promise<GeneratedDiagram> {
  const warnings: string[] = [];
  const deterministicSpec = twoNumberComparisonSpec(input.prompt) ?? oddEvenSpec(input.prompt);
  let provider: AiProvider = "mock";
  let spec = deterministicSpec ?? localSpec(input.prompt);

  if (!deterministicSpec && input.provider === "anthropic" && hasEnvValue(process.env.ANTHROPIC_API_KEY)) {
    try {
      spec = normalizeSpec(await anthropicSpec(input.prompt), input.prompt);
      provider = "anthropic";
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Anthropic generation failed; used the local diagram builder.");
    }
  } else if (!deterministicSpec && input.provider === "groq" && hasEnvValue(process.env.GROQ_API_KEY)) {
    try {
      spec = normalizeSpec(await groqSpec(input.prompt), input.prompt);
      provider = "groq";
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Groq generation failed; used the local diagram builder.");
    }
  }

  const normalized = normalizeSpec(spec, input.prompt);

  return {
    id: crypto.randomUUID(),
    roomId: input.roomId,
    provider,
    prompt: input.prompt,
    title: normalized.title,
    diagramType: normalized.diagramType,
    summary: normalized.summary,
    objects: specToObjects(normalized, input.authorId),
    warnings,
    createdAt: new Date().toISOString()
  };
}
