import type { BoardTemplate, CanvasObjectPayload } from "./types";

const object = (objectId: string, objectType: string, payload: Omit<CanvasObjectPayload, "objectId" | "objectType">): CanvasObjectPayload => ({
  objectId,
  objectType,
  ...payload
});

export const boardTemplates: BoardTemplate[] = [
  {
    id: "flowchart-basic",
    name: "Flowchart Starter",
    description: "Start, process, decision, and end with directional flow.",
    diagramType: "Flowchart",
    objects: [
      object("tpl-flow-start", "ellipse", {
        type: "ellipse",
        left: 120,
        top: 70,
        rx: 70,
        ry: 34,
        fill: "#ffffff",
        stroke: "#1f2937",
        strokeWidth: 3
      }),
      object("tpl-flow-start-label", "text", {
        type: "i-text",
        left: 154,
        top: 92,
        text: "Start",
        fill: "#1f2937",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-flow-process", "rectangle", {
        type: "rect",
        left: 95,
        top: 165,
        width: 190,
        height: 70,
        rx: 4,
        ry: 4,
        fill: "#ffffff",
        stroke: "#1f2937",
        strokeWidth: 3
      }),
      object("tpl-flow-process-label", "text", {
        type: "i-text",
        left: 126,
        top: 188,
        text: "Process step",
        fill: "#1f2937",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-flow-decision", "diamond", {
        type: "polygon",
        left: 105,
        top: 285,
        points: [
          { x: 85, y: 0 },
          { x: 170, y: 55 },
          { x: 85, y: 110 },
          { x: 0, y: 55 }
        ],
        fill: "#ffffff",
        stroke: "#1f2937",
        strokeWidth: 3
      }),
      object("tpl-flow-decision-label", "text", {
        type: "i-text",
        left: 143,
        top: 326,
        text: "Decision?",
        fill: "#1f2937",
        fontSize: 17,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-flow-end", "ellipse", {
        type: "ellipse",
        left: 120,
        top: 450,
        rx: 70,
        ry: 34,
        fill: "#ffffff",
        stroke: "#1f2937",
        strokeWidth: 3
      }),
      object("tpl-flow-end-label", "text", {
        type: "i-text",
        left: 164,
        top: 472,
        text: "End",
        fill: "#1f2937",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-flow-line-1", "connector", {
        type: "line",
        x1: 190,
        y1: 138,
        x2: 190,
        y2: 165,
        stroke: "#1f2937",
        strokeWidth: 3,
        strokeLineCap: "round"
      }),
      object("tpl-flow-line-2", "connector", {
        type: "line",
        x1: 190,
        y1: 235,
        x2: 190,
        y2: 285,
        stroke: "#1f2937",
        strokeWidth: 3,
        strokeLineCap: "round"
      }),
      object("tpl-flow-line-3", "connector", {
        type: "line",
        x1: 190,
        y1: 395,
        x2: 190,
        y2: 450,
        stroke: "#1f2937",
        strokeWidth: 3,
        strokeLineCap: "round"
      })
    ]
  },
  {
    id: "er-chen-basic",
    name: "ER Chen Starter",
    description: "Two entities, one relationship, and attributes in Chen notation.",
    diagramType: "ER Diagram - Chen Notation",
    objects: [
      object("tpl-er-student", "rectangle", {
        type: "rect",
        left: 80,
        top: 130,
        width: 145,
        height: 64,
        fill: "#ffffff",
        stroke: "#14532d",
        strokeWidth: 3
      }),
      object("tpl-er-student-label", "text", {
        type: "i-text",
        left: 118,
        top: 151,
        text: "Student",
        fill: "#14532d",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-er-enrolls", "diamond", {
        type: "polygon",
        left: 310,
        top: 112,
        points: [
          { x: 80, y: 0 },
          { x: 160, y: 50 },
          { x: 80, y: 100 },
          { x: 0, y: 50 }
        ],
        fill: "#ffffff",
        stroke: "#14532d",
        strokeWidth: 3
      }),
      object("tpl-er-enrolls-label", "text", {
        type: "i-text",
        left: 356,
        top: 151,
        text: "Enrolls",
        fill: "#14532d",
        fontSize: 17,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-er-course", "rectangle", {
        type: "rect",
        left: 555,
        top: 130,
        width: 145,
        height: 64,
        fill: "#ffffff",
        stroke: "#14532d",
        strokeWidth: 3
      }),
      object("tpl-er-course-label", "text", {
        type: "i-text",
        left: 600,
        top: 151,
        text: "Course",
        fill: "#14532d",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-er-attr-1", "ellipse", {
        type: "ellipse",
        left: 70,
        top: 245,
        rx: 70,
        ry: 30,
        fill: "#ffffff",
        stroke: "#14532d",
        strokeWidth: 2
      }),
      object("tpl-er-attr-1-label", "text", {
        type: "i-text",
        left: 112,
        top: 262,
        text: "Name",
        fill: "#14532d",
        fontSize: 15,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-er-line-1", "connector", {
        type: "line",
        x1: 225,
        y1: 162,
        x2: 310,
        y2: 162,
        stroke: "#14532d",
        strokeWidth: 3
      }),
      object("tpl-er-line-2", "connector", {
        type: "line",
        x1: 470,
        y1: 162,
        x2: 555,
        y2: 162,
        stroke: "#14532d",
        strokeWidth: 3
      }),
      object("tpl-er-line-3", "connector", {
        type: "line",
        x1: 145,
        y1: 245,
        x2: 150,
        y2: 194,
        stroke: "#14532d",
        strokeWidth: 2
      })
    ]
  },
  {
    id: "uml-class-basic",
    name: "UML Class Starter",
    description: "Two classes and a simple association.",
    diagramType: "UML Class Diagram",
    objects: [
      object("tpl-uml-user", "rectangle", {
        type: "rect",
        left: 105,
        top: 105,
        width: 210,
        height: 150,
        fill: "#ffffff",
        stroke: "#334155",
        strokeWidth: 3
      }),
      object("tpl-uml-user-label", "text", {
        type: "i-text",
        left: 178,
        top: 118,
        text: "User",
        fill: "#0f172a",
        fontSize: 19,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-uml-user-body", "text", {
        type: "textbox",
        left: 122,
        top: 155,
        width: 180,
        text: "+ id: UUID\n+ email: string\n+ login(): Session",
        fill: "#334155",
        fontSize: 15,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-uml-session", "rectangle", {
        type: "rect",
        left: 470,
        top: 105,
        width: 210,
        height: 150,
        fill: "#ffffff",
        stroke: "#334155",
        strokeWidth: 3
      }),
      object("tpl-uml-session-label", "text", {
        type: "i-text",
        left: 538,
        top: 118,
        text: "Session",
        fill: "#0f172a",
        fontSize: 19,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-uml-session-body", "text", {
        type: "textbox",
        left: 488,
        top: 155,
        width: 180,
        text: "+ token: string\n+ expiresAt: Date",
        fill: "#334155",
        fontSize: 15,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-uml-line", "connector", {
        type: "line",
        x1: 315,
        y1: 180,
        x2: 470,
        y2: 180,
        stroke: "#334155",
        strokeWidth: 3
      })
    ]
  },
  {
    id: "state-machine-basic",
    name: "State Machine Starter",
    description: "Idle, processing, and complete states with transitions.",
    diagramType: "State Machine Diagram",
    objects: [
      object("tpl-state-idle", "ellipse", {
        type: "ellipse",
        left: 85,
        top: 120,
        rx: 80,
        ry: 42,
        fill: "#ffffff",
        stroke: "#6d28d9",
        strokeWidth: 3
      }),
      object("tpl-state-idle-label", "text", {
        type: "i-text",
        left: 139,
        top: 146,
        text: "Idle",
        fill: "#4c1d95",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-state-processing", "ellipse", {
        type: "ellipse",
        left: 330,
        top: 120,
        rx: 96,
        ry: 42,
        fill: "#ffffff",
        stroke: "#6d28d9",
        strokeWidth: 3
      }),
      object("tpl-state-processing-label", "text", {
        type: "i-text",
        left: 372,
        top: 146,
        text: "Processing",
        fill: "#4c1d95",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-state-complete", "ellipse", {
        type: "ellipse",
        left: 615,
        top: 120,
        rx: 92,
        ry: 42,
        fill: "#ffffff",
        stroke: "#6d28d9",
        strokeWidth: 3
      }),
      object("tpl-state-complete-label", "text", {
        type: "i-text",
        left: 656,
        top: 146,
        text: "Complete",
        fill: "#4c1d95",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-state-line-1", "connector", {
        type: "line",
        x1: 245,
        y1: 162,
        x2: 330,
        y2: 162,
        stroke: "#6d28d9",
        strokeWidth: 3
      }),
      object("tpl-state-line-2", "connector", {
        type: "line",
        x1: 522,
        y1: 162,
        x2: 615,
        y2: 162,
        stroke: "#6d28d9",
        strokeWidth: 3
      }),
      object("tpl-state-start", "ellipse", {
        type: "ellipse",
        left: 25,
        top: 145,
        rx: 14,
        ry: 14,
        fill: "#4c1d95",
        stroke: "#4c1d95",
        strokeWidth: 2
      }),
      object("tpl-state-start-line", "connector", {
        type: "line",
        x1: 53,
        y1: 159,
        x2: 85,
        y2: 162,
        stroke: "#6d28d9",
        strokeWidth: 3
      })
    ]
  },
  {
    id: "circuit-basic",
    name: "Circuit Starter",
    description: "Battery, resistor, LED, and return path.",
    diagramType: "Basic Circuit Diagram",
    objects: [
      object("tpl-circuit-battery", "rectangle", {
        type: "rect",
        left: 95,
        top: 165,
        width: 54,
        height: 96,
        fill: "#ffffff",
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-battery-label", "text", {
        type: "i-text",
        left: 73,
        top: 275,
        text: "Battery",
        fill: "#7f1d1d",
        fontSize: 16,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-circuit-resistor", "rectangle", {
        type: "rect",
        left: 310,
        top: 130,
        width: 130,
        height: 45,
        fill: "#fff7ed",
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-resistor-label", "text", {
        type: "i-text",
        left: 344,
        top: 142,
        text: "R1",
        fill: "#7f1d1d",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-circuit-led", "ellipse", {
        type: "ellipse",
        left: 595,
        top: 128,
        rx: 34,
        ry: 34,
        fill: "#ffffff",
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-led-label", "text", {
        type: "i-text",
        left: 596,
        top: 178,
        text: "LED",
        fill: "#7f1d1d",
        fontSize: 16,
        fontFamily: "Inter, Arial, sans-serif"
      }),
      object("tpl-circuit-line-1", "connector", {
        type: "line",
        x1: 149,
        y1: 185,
        x2: 310,
        y2: 152,
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-line-2", "connector", {
        type: "line",
        x1: 440,
        y1: 152,
        x2: 595,
        y2: 162,
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-line-3", "connector", {
        type: "line",
        x1: 663,
        y1: 162,
        x2: 663,
        y2: 310,
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-line-4", "connector", {
        type: "line",
        x1: 663,
        y1: 310,
        x2: 122,
        y2: 310,
        stroke: "#7f1d1d",
        strokeWidth: 3
      }),
      object("tpl-circuit-line-5", "connector", {
        type: "line",
        x1: 122,
        y1: 310,
        x2: 122,
        y2: 261,
        stroke: "#7f1d1d",
        strokeWidth: 3
      })
    ]
  }
];
