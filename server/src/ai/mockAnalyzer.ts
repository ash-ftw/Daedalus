import type {
  AnalysisComponent,
  AnalysisIssue,
  AnalysisResult,
  CanvasObjectPayload,
  ChatMessage,
  DiagramType
} from "../../../shared/src/types";

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

function objectKind(object: CanvasObjectPayload): string {
  const explicitType = asString(object.objectType);
  const fabricType = asString(object.type);
  return explicitType || fabricType || "object";
}

function objectText(object: CanvasObjectPayload): string {
  const text = object.text;

  if (typeof text === "string") {
    return text.toLowerCase();
  }

  if (Array.isArray((object as { objects?: unknown }).objects)) {
    return (((object as unknown as { objects: Array<Record<string, unknown>> }).objects) ?? [])
      .map((child) => (typeof child.text === "string" ? child.text : ""))
      .join(" ")
      .toLowerCase();
  }

  return "";
}

function boundsFor(object: CanvasObjectPayload) {
  const left = asNumber(object.left);
  const top = asNumber(object.top);
  const width = Math.max(24, asNumber(object.width, 80) * asNumber(object.scaleX, 1));
  const height = Math.max(24, asNumber(object.height, 60) * asNumber(object.scaleY, 1));

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function classify(objects: CanvasObjectPayload[]): { diagramType: DiagramType; confidence: number; summary: string } {
  if (objects.length === 0) {
    return {
      diagramType: "Blank Canvas",
      confidence: 100,
      summary: "I do not see a recognizable diagram yet. Keep drawing."
    };
  }

  const kinds = objects.map(objectKind);
  const text = objects.map(objectText).join(" ");
  const hasDiamond = kinds.includes("diamond") || kinds.includes("polygon");
  const hasConnector = kinds.includes("connector") || kinds.includes("line");
  const hasRectangle = kinds.includes("rectangle") || kinds.includes("rect");
  const hasEllipse = kinds.includes("ellipse") || kinds.includes("circle");
  const hasFreehand = kinds.includes("stroke") || kinds.includes("path");
  const hasCircuitVocabulary = ["battery", "resistor", "led", "voltage", "ground", "switch", "r1"].some((term) => text.includes(term));
  const hasStateVocabulary = ["state", "idle", "processing", "complete", "transition", "event"].some((term) => text.includes(term));

  if (text.includes("class") || text.includes("+") || text.includes("private") || text.includes("public")) {
    return {
      diagramType: "UML Class Diagram",
      confidence: 72,
      summary: "This looks like an early UML class diagram. I can see text-heavy blocks that may represent classes or members."
    };
  }

  if (hasCircuitVocabulary) {
    return {
      diagramType: text.includes("and") || text.includes("or") || text.includes("not") ? "Logic Gate Diagram" : "Basic Circuit Diagram",
      confidence: hasConnector ? 82 : 66,
      summary: "This looks like a circuit-style diagram. I can see electrical labels or components that should be checked for closed paths and clear polarity."
    };
  }

  if (hasStateVocabulary && hasEllipse) {
    return {
      diagramType: "State Machine Diagram",
      confidence: hasConnector ? 84 : 70,
      summary: "This appears to be a state machine diagram with labeled states and transitions."
    };
  }

  if ((text.includes("entity") || text.includes("relationship") || text.includes("attribute")) || (hasDiamond && hasEllipse && hasRectangle)) {
    return {
      diagramType: "ER Diagram - Chen Notation",
      confidence: hasConnector ? 84 : 68,
      summary: "This appears to be an ER diagram using Chen-style symbols: rectangles for entities, ovals for attributes, and diamonds for relationships."
    };
  }

  if (hasDiamond && hasRectangle) {
    return {
      diagramType: "Flowchart",
      confidence: hasConnector ? 88 : 74,
      summary: "This looks like a flowchart. I can see process-like blocks and at least one decision symbol."
    };
  }

  if (hasConnector && hasRectangle) {
    return {
      diagramType: "Flowchart",
      confidence: 70,
      summary: "This may be a flowchart, though the notation is still sparse. Add decisions, terminals, and directional connectors for clarity."
    };
  }

  if (hasFreehand && !hasRectangle && !hasDiamond && !hasEllipse) {
    return {
      diagramType: "Unknown Diagram",
      confidence: 42,
      summary: "I see freehand strokes, but there is not enough diagram structure yet for a confident classification."
    };
  }

  return {
    diagramType: "Unknown Diagram",
    confidence: 55,
    summary: "I am not certain what diagram type this is yet. Add labels and connectors to make the notation clearer."
  };
}

function describeObject(object: CanvasObjectPayload): AnalysisComponent {
  const kind = objectKind(object);
  const labelByKind: Record<string, string> = {
    stroke: "Freehand stroke",
    path: "Freehand stroke",
    rectangle: "Process or entity",
    rect: "Process or entity",
    ellipse: "Attribute or terminal",
    circle: "Attribute or terminal",
    diamond: "Decision or relationship",
    polygon: "Decision or relationship",
    connector: "Connector",
    line: "Connector",
    text: "Text label",
    "i-text": "Text label",
    textbox: "Text label",
    sticky: "Sticky note"
  };
  const label = labelByKind[kind] ?? "Canvas element";

  return {
    id: `component-${object.objectId}`,
    objectId: object.objectId,
    label,
    description: `${label} detected from a ${kind} element on the board.`,
    confidence: kind === "stroke" ? 58 : 78,
    bounds: boundsFor(object)
  };
}

function buildIssues(objects: CanvasObjectPayload[], diagramType: DiagramType): AnalysisIssue[] {
  const kinds = objects.map(objectKind);
  const issues: AnalysisIssue[] = [];
  const firstStructured = objects.find((object) => !["stroke", "path"].includes(objectKind(object)));

  if (diagramType === "Flowchart" && !kinds.some((kind) => kind === "connector" || kind === "line")) {
    issues.push({
      id: "flowchart-missing-connectors",
      severity: "warning",
      title: "Flow direction is unclear",
      explanation: "The flowchart has symbols, but I do not see connectors that show the execution order.",
      why: "Flowchart readers rely on arrows to understand which step happens next and where decisions branch.",
      objectIds: firstStructured ? [firstStructured.objectId] : [],
      suggestion: "Add directional connectors between each process and decision node."
    });
  }

  if (diagramType.includes("ER Diagram") && !kinds.some((kind) => kind === "connector" || kind === "line")) {
    issues.push({
      id: "er-missing-relationships",
      severity: "error",
      title: "Relationships are not connected",
      explanation: "The ER diagram has entity-style shapes, but relationships are not connected yet.",
      why: "An ER diagram needs explicit relationships and cardinality to explain how entities participate in the data model.",
      objectIds: firstStructured ? [firstStructured.objectId] : [],
      suggestion: "Connect each relationship diamond to its participating entities and add cardinality labels."
    });
  }

  if (diagramType === "Basic Circuit Diagram" && !kinds.some((kind) => kind === "connector" || kind === "line")) {
    issues.push({
      id: "circuit-missing-connections",
      severity: "error",
      title: "Circuit path is open",
      explanation: "The diagram has circuit components, but I do not see wires connecting them into a complete path.",
      why: "A basic circuit needs a closed loop so current can flow from the source through components and back to the source.",
      objectIds: firstStructured ? [firstStructured.objectId] : [],
      suggestion: "Add wires between the source, load, and return path, then label polarity or ground."
    });
  }

  if (diagramType === "State Machine Diagram" && !kinds.some((kind) => kind === "connector" || kind === "line")) {
    issues.push({
      id: "state-machine-missing-transitions",
      severity: "warning",
      title: "Transitions are missing",
      explanation: "I can see state-like nodes, but transitions between states are not clear.",
      why: "State machines need labeled transitions so readers understand which event moves the system from one state to another.",
      objectIds: firstStructured ? [firstStructured.objectId] : [],
      suggestion: "Connect each state with directed transitions and label the triggering events."
    });
  }

  if (diagramType === "UML Class Diagram" && !objects.some((object) => objectText(object).includes(":"))) {
    issues.push({
      id: "uml-members-need-types",
      severity: "suggestion",
      title: "Class members need typed notation",
      explanation: "The UML class boxes are present, but attributes or methods do not appear to use typed UML notation yet.",
      why: "Typed attributes and method signatures make class responsibilities and contracts easier to review.",
      objectIds: firstStructured ? [firstStructured.objectId] : [],
      suggestion: "Add attributes like '+ id: UUID' and methods like '+ save(): void' inside each class."
    });
  }

  const freehandCount = kinds.filter((kind) => kind === "stroke" || kind === "path").length;
  const structuredCount = objects.length - freehandCount;

  if (freehandCount >= 3 && structuredCount <= 1) {
    issues.push({
      id: "sketch-needs-notation",
      severity: "suggestion",
      title: "Use explicit diagram symbols",
      explanation: "Most of the board is still freehand sketching, so notation validation will be less reliable.",
      why: "Standard shapes make it easier for collaborators and AI analysis to distinguish entities, decisions, attributes, and connectors.",
      objectIds: objects.slice(0, 3).map((object) => object.objectId),
      suggestion: "Convert rough strokes into named shapes from the toolbar."
    });
  }

  return issues;
}

export function analyzeCanvas(roomId: string, objects: CanvasObjectPayload[]): AnalysisResult {
  const classification = classify(objects);
  const components = objects.slice(0, 12).map(describeObject);
  const issues = buildIssues(objects, classification.diagramType);
  const complexityScore = Math.min(100, Math.max(8, objects.length * 9 + components.length * 3 - issues.length * 8));
  const hints =
    classification.diagramType === "Blank Canvas"
      ? ["Start with a terminal or entity shape, then label it."]
      : [
          "Add labels to ambiguous shapes so collaborators understand intent.",
          "Use connectors instead of proximity to show relationships.",
          "Keep one notation style per diagram."
        ];

  return {
    id: crypto.randomUUID(),
    roomId,
    createdAt: new Date().toISOString(),
    provider: "mock",
    diagramType: classification.diagramType,
    confidence: classification.confidence,
    summary: classification.summary,
    components,
    issues,
    hints,
    complexityScore
  };
}

export function answerChat(roomId: string, authorName: string, prompt: string, objects: CanvasObjectPayload[]): ChatMessage {
  const analysis = analyzeCanvas(roomId, objects);
  const issueText =
    analysis.issues.length > 0
      ? ` The main thing I would fix first is: ${analysis.issues[0].suggestion}`
      : " I do not see a blocking notation issue yet.";

  return {
    id: crypto.randomUUID(),
    roomId,
    sender: "ai",
    authorName: "AI Explainer",
    createdAt: new Date().toISOString(),
    content: `${authorName}, based on the current canvas this looks like ${analysis.diagramType.toLowerCase()} with ${analysis.confidence}% confidence.${issueText} Your question was: "${prompt}"`
  };
}
