import type {
  AnalysisResult,
  CanvasObjectPayload,
  CanvasOperation,
  DiagramType,
  GeneratedArtifact,
  InstitutionTuningProfile,
  LanguageCode,
  LayoutSuggestion
} from "../../../shared/src/types";
import { analyzeCanvas } from "./mockAnalyzer";

const languageNames: Record<LanguageCode, string> = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  zh: "Mandarin"
};

const localizedCopy: Record<
  LanguageCode,
  {
    summaryLead: string;
    componentLead: string;
    issueLead: string;
    whyLead: string;
    suggestionLead: string;
    hintLead: string;
  }
> = {
  en: {
    summaryLead: "Summary",
    componentLead: "Component",
    issueLead: "Issue",
    whyLead: "Why it matters",
    suggestionLead: "Suggested fix",
    hintLead: "Next step"
  },
  es: {
    summaryLead: "Resumen",
    componentLead: "Componente",
    issueLead: "Problema",
    whyLead: "Por que importa",
    suggestionLead: "Correccion sugerida",
    hintLead: "Siguiente paso"
  },
  hi: {
    summaryLead: "सारांश",
    componentLead: "घटक",
    issueLead: "समस्या",
    whyLead: "यह क्यों महत्वपूर्ण है",
    suggestionLead: "सुझाया गया सुधार",
    hintLead: "अगला कदम"
  },
  zh: {
    summaryLead: "摘要",
    componentLead: "组件",
    issueLead: "问题",
    whyLead: "重要原因",
    suggestionLead: "建议修正",
    hintLead: "下一步"
  }
};

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

function cloneObject(object: CanvasObjectPayload): CanvasObjectPayload {
  return JSON.parse(JSON.stringify(object)) as CanvasObjectPayload;
}

function objectKind(object: CanvasObjectPayload): string {
  return asString(object.objectType) || asString(object.type) || "object";
}

function objectText(object: CanvasObjectPayload): string {
  if (typeof object.text === "string") {
    return object.text.trim();
  }

  if (Array.isArray((object as { objects?: unknown }).objects)) {
    return ((object as unknown as { objects: Array<Record<string, unknown>> }).objects ?? [])
      .map((child) => (typeof child.text === "string" ? child.text.trim() : ""))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function boundsFor(object: CanvasObjectPayload) {
  const left = asNumber(object.left);
  const top = asNumber(object.top);
  const width = Math.max(24, asNumber(object.width, 96) * asNumber(object.scaleX, 1));
  const height = Math.max(24, asNumber(object.height, 64) * asNumber(object.scaleY, 1));

  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
}

function isConnector(object: CanvasObjectPayload) {
  const kind = objectKind(object);
  return kind === "connector" || kind === "line";
}

function isTextLike(object: CanvasObjectPayload) {
  const kind = objectKind(object);
  return ["text", "i-text", "textbox", "sticky"].includes(kind) || Boolean(objectText(object));
}

function isLayoutTarget(object: CanvasObjectPayload) {
  const kind = objectKind(object);
  return !["connector", "line", "stroke", "path"].includes(kind);
}

function toIdentifier(label: string, fallback: string) {
  const identifier = label
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const safeIdentifier = identifier || fallback;
  return /^[0-9]/.test(safeIdentifier) ? `n_${safeIdentifier}` : safeIdentifier;
}

function toClassName(label: string, fallback: string) {
  const words = label.trim().replace(/[^a-zA-Z0-9]+/g, " ").split(/\s+/).filter(Boolean);
  const className = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
  const safeClassName = className || fallback;
  return /^[0-9]/.test(safeClassName) ? `Class${safeClassName}` : safeClassName;
}

function nearestTextLabel(object: CanvasObjectPayload, textObjects: CanvasObjectPayload[], fallback: string) {
  const ownText = objectText(object);

  if (ownText) {
    return ownText;
  }

  const objectBounds = boundsFor(object);
  const nearest = textObjects
    .map((textObject) => {
      const textBounds = boundsFor(textObject);
      return {
        label: objectText(textObject),
        distance: Math.hypot(objectBounds.centerX - textBounds.centerX, objectBounds.centerY - textBounds.centerY)
      };
    })
    .filter((candidate) => candidate.label)
    .sort((left, right) => left.distance - right.distance)[0];

  return nearest?.distance && nearest.distance < 180 ? nearest.label : fallback;
}

function diagramNodes(objects: CanvasObjectPayload[]) {
  const textObjects = objects.filter(isTextLike);
  const structuredObjects = objects.filter((object) => isLayoutTarget(object) && !isTextLike(object));
  const sourceObjects = structuredObjects.length > 0 ? structuredObjects : textObjects;

  return sourceObjects
    .sort((left, right) => boundsFor(left).top - boundsFor(right).top || boundsFor(left).left - boundsFor(right).left)
    .map((object, index) => ({
      id: object.objectId,
      kind: objectKind(object),
      label: nearestTextLabel(object, textObjects, `${objectKind(object)} ${index + 1}`),
      object
    }));
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = label.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildSqlArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const nodes = diagramNodes(objects);
  const tableLabels = uniqueLabels(
    nodes
      .filter((node) => !["diamond", "ellipse", "circle"].includes(node.kind))
      .filter((node) => !["er-attribute", "key-attribute", "derived-attribute", "multivalue-attribute", "er-relationship", "identifying-relationship"].includes(node.kind))
      .map((node) => node.label)
      .slice(0, 8)
  );
  const tables = tableLabels.length > 0 ? tableLabels : ["entity"];
  const ddl = tables.map((label) => {
    const tableName = toIdentifier(label, "entity");
    return `CREATE TABLE ${tableName} (\n  id UUID PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);`;
  });
  const relationship =
    tables.length >= 2
      ? `\n-- Review cardinality before using this foreign key.\nALTER TABLE ${toIdentifier(tables[1], "child")} ADD COLUMN ${toIdentifier(
          tables[0],
          "parent"
        )}_id UUID REFERENCES ${toIdentifier(tables[0], "parent")}(id);`
      : "";

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "sql",
    title: "Draft SQL schema",
    language: "SQL",
    content: [`-- Generated from ${analysis.diagramType}`, ...ddl, relationship].filter(Boolean).join("\n\n"),
    warnings: [
      "Validate primary keys, nullable fields, and cardinality before running this schema.",
      "Attribute ovals and relationship labels are converted conservatively because the canvas is informal."
    ],
    createdAt: new Date().toISOString()
  };
}

function buildPseudocodeArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const nodes = diagramNodes(objects);
  const steps = nodes.length > 0 ? nodes : [{ id: "start", kind: "rectangle", label: "Start", object: objects[0] }];
  const lines = ["BEGIN"];

  steps.forEach((node, index) => {
    if (node.kind === "diamond" || /decision|if|check/i.test(node.label)) {
      lines.push(`  IF ${node.label} THEN`);
      lines.push(`    // Step ${index + 1} true branch`);
      lines.push("  ELSE");
      lines.push(`    // Step ${index + 1} false branch`);
      lines.push("  END IF");
      return;
    }

    if (node.kind === "ellipse" || /start|end/i.test(node.label)) {
      lines.push(`  // ${node.label}`);
      return;
    }

    lines.push(`  DO ${node.label}`);
  });

  lines.push("END");

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "pseudocode",
    title: "Flowchart pseudocode",
    language: "Pseudocode",
    content: lines.join("\n"),
    warnings: ["Decision branch labels are inferred from canvas ordering; review true and false paths manually."],
    createdAt: new Date().toISOString()
  };
}

function buildTypescriptArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const classLabels = uniqueLabels(diagramNodes(objects).map((node) => node.label)).slice(0, 6);
  const classes = (classLabels.length > 0 ? classLabels : ["DiagramClass"]).map((label, index) => {
    const className = toClassName(label, `DiagramClass${index + 1}`);
    return `export class ${className} {\n  id: string;\n\n  constructor(init: Partial<${className}> = {}) {\n    this.id = init.id ?? crypto.randomUUID();\n    Object.assign(this, init);\n  }\n}`;
  });

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "typescript",
    title: "UML TypeScript classes",
    language: "TypeScript",
    content: classes.join("\n\n"),
    warnings: ["Add typed attributes and method signatures from the UML class compartments before using this in an application."],
    createdAt: new Date().toISOString()
  };
}

function buildStateMachineArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const states = uniqueLabels(diagramNodes(objects).map((node) => node.label)).slice(0, 8);
  const safeStates = states.length > 0 ? states : ["Idle", "Complete"];
  const lines = ["export const stateMachine = {", `  initial: "${toIdentifier(safeStates[0], "idle")}",`, "  states: {"];

  safeStates.forEach((state, index) => {
    const next = safeStates[index + 1];
    lines.push(`    ${toIdentifier(state, `state_${index + 1}`)}: {`);
    lines.push(next ? `      on: { NEXT: "${toIdentifier(next, `state_${index + 2}`)}" }` : "      type: \"final\"");
    lines.push(`    }${index === safeStates.length - 1 ? "" : ","}`);
  });

  lines.push("  }");
  lines.push("};");

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "state-machine",
    title: "State machine config",
    language: "TypeScript",
    content: lines.join("\n"),
    warnings: ["Transition event names are placeholders. Replace NEXT with the events shown on your connectors."],
    createdAt: new Date().toISOString()
  };
}

function buildCircuitNotesArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const labels = uniqueLabels(diagramNodes(objects).map((node) => node.label)).slice(0, 10);

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "circuit-notes",
    title: "Circuit implementation notes",
    language: "Markdown",
    content: [
      `# ${analysis.diagramType} Notes`,
      "",
      "## Components",
      ...(labels.length > 0 ? labels.map((label) => `- ${label}`) : ["- Add component labels before generating a bill of materials."]),
      "",
      "## Checks",
      "- Confirm the circuit has a closed path.",
      "- Label source voltage, polarity, and ground.",
      "- Verify resistor values and component ratings before building."
    ].join("\n"),
    warnings: ["These notes are instructional and are not a substitute for electrical safety review."],
    createdAt: new Date().toISOString()
  };
}

function buildMarkdownArtifact(roomId: string, objects: CanvasObjectPayload[], analysis: AnalysisResult): GeneratedArtifact {
  const labels = uniqueLabels(diagramNodes(objects).map((node) => node.label)).slice(0, 10);

  return {
    id: crypto.randomUUID(),
    roomId,
    kind: "markdown",
    title: "Diagram implementation outline",
    language: "Markdown",
    content: [
      `# ${analysis.diagramType}`,
      "",
      analysis.summary,
      "",
      "## Visible elements",
      ...(labels.length > 0 ? labels.map((label) => `- ${label}`) : ["- No labeled elements were detected yet."]),
      "",
      "## Next implementation step",
      analysis.hints[0] ?? "Add labels and connectors, then run analysis again."
    ].join("\n"),
    warnings: ["Generated as a neutral outline because this diagram type does not map directly to code yet."],
    createdAt: new Date().toISOString()
  };
}

export function generateDiagramArtifact(
  roomId: string,
  objects: CanvasObjectPayload[],
  latestAnalysis?: AnalysisResult
): GeneratedArtifact {
  const analysis = latestAnalysis ?? analyzeCanvas(roomId, objects);

  if (analysis.diagramType.includes("ER Diagram")) {
    return buildSqlArtifact(roomId, objects, analysis);
  }

  if (analysis.diagramType === "Flowchart") {
    return buildPseudocodeArtifact(roomId, objects, analysis);
  }

  if (analysis.diagramType === "UML Class Diagram") {
    return buildTypescriptArtifact(roomId, objects, analysis);
  }

  if (analysis.diagramType === "State Machine Diagram") {
    return buildStateMachineArtifact(roomId, objects, analysis);
  }

  if (analysis.diagramType === "Basic Circuit Diagram" || analysis.diagramType === "Logic Gate Diagram") {
    return buildCircuitNotesArtifact(roomId, objects, analysis);
  }

  return buildMarkdownArtifact(roomId, objects, analysis);
}

function overlaps(left: CanvasObjectPayload, right: CanvasObjectPayload) {
  const leftBounds = boundsFor(left);
  const rightBounds = boundsFor(right);
  return (
    leftBounds.left < rightBounds.left + rightBounds.width &&
    leftBounds.left + leftBounds.width > rightBounds.left &&
    leftBounds.top < rightBounds.top + rightBounds.height &&
    leftBounds.top + leftBounds.height > rightBounds.top
  );
}

export function suggestLayout(roomId: string, objects: CanvasObjectPayload[]): LayoutSuggestion[] {
  const targets = objects.filter(isLayoutTarget);
  const connectors = objects.filter(isConnector);
  const suggestions: LayoutSuggestion[] = [];
  const createdAt = new Date().toISOString();

  if (targets.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        roomId,
        title: "Add labeled shapes before layout",
        description: "The board needs at least two labeled diagram elements before auto-layout can improve readability.",
        impact: "low",
        objectIds: [],
        createdAt
      }
    ];
  }

  const overlappingIds = new Set<string>();

  targets.forEach((left, leftIndex) => {
    targets.slice(leftIndex + 1).forEach((right) => {
      if (overlaps(left, right)) {
        overlappingIds.add(left.objectId);
        overlappingIds.add(right.objectId);
      }
    });
  });

  if (overlappingIds.size > 0) {
    suggestions.push({
      id: crypto.randomUUID(),
      roomId,
      title: "Separate overlapping elements",
      description: "Some labels or symbols overlap, which makes AI analysis and peer review less reliable.",
      impact: "high",
      objectIds: Array.from(overlappingIds).slice(0, 12),
      createdAt
    });
  }

  if (targets.length >= 3) {
    suggestions.push({
      id: crypto.randomUUID(),
      roomId,
      title: "Normalize spacing into readable rows",
      description: "Arrange symbols from top-left to bottom-right with consistent gaps so the review order is obvious.",
      impact: overlappingIds.size > 0 ? "high" : "medium",
      objectIds: targets.slice(0, 12).map((object) => object.objectId),
      createdAt
    });
  }

  if (targets.length > 1 && connectors.length === 0) {
    suggestions.push({
      id: crypto.randomUUID(),
      roomId,
      title: "Add connectors after layout",
      description: "The diagram has multiple elements but no connectors. Add arrows, relationships, wires, or transitions after spacing is corrected.",
      impact: "medium",
      objectIds: targets.slice(0, 8).map((object) => object.objectId),
      createdAt
    });
  }

  return suggestions.length > 0
    ? suggestions
    : [
        {
          id: crypto.randomUUID(),
          roomId,
          title: "Layout is readable",
          description: "The current spacing is usable. Keep related labels near the shapes they describe.",
          impact: "low",
          objectIds: targets.slice(0, 8).map((object) => object.objectId),
          createdAt
        }
      ];
}

function columnsFor(diagramType: DiagramType, objectCount: number) {
  if (diagramType === "Flowchart" || diagramType === "State Machine Diagram") {
    return 1;
  }

  if (diagramType.includes("ER Diagram") || diagramType === "UML Class Diagram") {
    return Math.min(3, Math.max(1, objectCount));
  }

  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(objectCount))));
}

export function buildAutoLayoutOperation(
  roomId: string,
  objects: CanvasObjectPayload[],
  userId: string,
  latestAnalysis?: AnalysisResult,
  clientId?: string
): CanvasOperation | null {
  const analysis = latestAnalysis ?? analyzeCanvas(roomId, objects);
  const targets = objects
    .filter(isLayoutTarget)
    .sort((left, right) => boundsFor(left).top - boundsFor(right).top || boundsFor(left).left - boundsFor(right).left);

  if (targets.length < 2) {
    return null;
  }

  const targetIds = new Set(targets.map((object) => object.objectId));
  const columns = columnsFor(analysis.diagramType, targets.length);
  const startX = analysis.diagramType === "Flowchart" || analysis.diagramType === "State Machine Diagram" ? 280 : 96;
  const startY = 96;
  const columnGap = 230;
  const rowGap = analysis.diagramType === "Flowchart" || analysis.diagramType === "State Machine Diagram" ? 150 : 132;
  const nextPositions = new Map<string, { left: number; top: number }>();

  targets.forEach((object, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    nextPositions.set(object.objectId, {
      left: startX + column * columnGap,
      top: startY + row * rowGap
    });
  });

  return {
    type: "replace",
    userId,
    clientId,
    boardVersion: 0,
    objects: objects.map((object) => {
      const clone = cloneObject(object);
      const nextPosition = nextPositions.get(object.objectId);

      if (targetIds.has(object.objectId) && nextPosition) {
        clone.left = nextPosition.left;
        clone.top = nextPosition.top;
      }

      return clone;
    })
  };
}

export function normalizeLanguage(language: unknown, fallback: LanguageCode = "en"): LanguageCode {
  return language === "es" || language === "hi" || language === "zh" || language === "en" ? language : fallback;
}

export function localizeAnalysis(analysis: AnalysisResult, language: LanguageCode): AnalysisResult {
  const copy = localizedCopy[language];

  if (language === "en") {
    return analysis;
  }

  return {
    ...analysis,
    summary: `${copy.summaryLead} (${languageNames[language]}): ${analysis.summary}`,
    components: analysis.components.map((component) => ({
      ...component,
      description: `${copy.componentLead}: ${component.description}`
    })),
    issues: analysis.issues.map((issue) => ({
      ...issue,
      title: `${copy.issueLead}: ${issue.title}`,
      explanation: `${copy.issueLead}: ${issue.explanation}`,
      why: `${copy.whyLead}: ${issue.why}`,
      suggestion: `${copy.suggestionLead}: ${issue.suggestion}`
    })),
    hints: analysis.hints.map((hint) => `${copy.hintLead}: ${hint}`)
  };
}

export function getInstitutionTuningProfile(): InstitutionTuningProfile {
  const label = process.env.INSTITUTION_AI_PROFILE?.trim() || "Default Daedalus tutor profile";
  const configuredRubric = process.env.INSTITUTION_AI_RUBRIC?.split("|")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
  const rubric = configuredRubric.length > 0 ? configuredRubric : [
    "Prioritize diagram-specific notation correctness.",
    "Explain corrections in student-friendly language.",
    "Do not invent elements that are not visible on the canvas."
  ];
  const defaultLanguage = normalizeLanguage(process.env.INSTITUTION_DEFAULT_LANGUAGE);

  return {
    configured: Boolean(process.env.INSTITUTION_AI_PROFILE || process.env.INSTITUTION_AI_RUBRIC),
    label,
    rubric,
    defaultLanguage
  };
}
