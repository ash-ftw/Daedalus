import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fabric } from "fabric";
import { ClipboardCheck, History, LayoutTemplate, MessageSquare, Minus, Plus } from "lucide-react";
import { AiPanel } from "./components/AiPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { InstructorDashboard } from "./components/InstructorDashboard";
import { QualityReportPanel } from "./components/QualityReportPanel";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { Toolbar } from "./components/Toolbar";
import { TopBar } from "./components/TopBar";
import { VersionHistory } from "./components/VersionHistory";
import { fetchWithAuth } from "./auth";
import { API_URL, useBoardSocket, type ToastMessage } from "./hooks/useBoardSocket";
import { boardTemplates } from "../../shared/src/templates";
import type {
  AnalysisIssue,
  BoardTemplate,
  BoardVersionSnapshot,
  CanvasObjectPayload,
  CanvasOperation,
  CursorPayload,
  DrawingTool,
  GeneratedDiagram,
  Participant
} from "../../shared/src/types";

const FABRIC_CUSTOM_PROPS = [
  "objectId",
  "objectType",
  "authorId",
  "excludeFromExport",
  "sourceObjectId",
  "targetObjectId",
  "sourceAnchor",
  "targetAnchor",
  "attachedToObjectId",
  "attachedOffsetX",
  "attachedOffsetY"
];
const PARTICIPANT_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0f766e", "#dc2626"];
type ThemeMode = "dark" | "light";
const DARK_THEME_STROKE = "#d7dde4";
const LIGHT_THEME_STROKE = "#1f2937";
const defaultStrokeForTheme = (theme: ThemeMode) => (theme === "dark" ? DARK_THEME_STROKE : LIGHT_THEME_STROKE);
const readStoredTheme = (): ThemeMode => (window.localStorage.getItem("daedalus-theme") === "light" ? "light" : "dark");
const PLACEMENT_TOOLS: DrawingTool[] = [
  "rectangle",
  "rounded-rectangle",
  "square",
  "ellipse",
  "diamond",
  "triangle",
  "pentagon",
  "octagon",
  "plus-shape",
  "cross",
  "star",
  "callout",
  "cube",
  "folder",
  "table",
  "note",
  "double-document",
  "card",
  "tape",
  "terminator",
  "parallelogram",
  "document",
  "hexagon",
  "trapezoid",
  "predefined-process",
  "internal-storage",
  "manual-input",
  "stored-data",
  "delay",
  "display",
  "off-page-connector",
  "sort",
  "merge",
  "collate",
  "summing-junction",
  "or-junction",
  "database",
  "cloud",
  "actor",
  "uml-class",
  "uml-interface",
  "uml-note",
  "uml-object",
  "component",
  "lifeline",
  "activation",
  "package",
  "er-entity",
  "weak-entity",
  "associative-entity",
  "er-attribute",
  "key-attribute",
  "derived-attribute",
  "multivalue-attribute",
  "er-relationship",
  "identifying-relationship",
  "state-start",
  "state-end",
  "resistor",
  "capacitor",
  "ground",
  "battery",
  "logic-and",
  "logic-or",
  "logic-not",
  "logic-xor",
  "switch",
  "led",
  "inductor",
  "text",
  "sticky"
];

type ConnectionAnchor = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-right" | "bottom-left";

type FabricObjectWithMeta = fabric.Object & {
  objectId?: string;
  objectType?: string;
  authorId?: string;
  excludeFromExport?: boolean;
  sourceObjectId?: string;
  targetObjectId?: string;
  sourceAnchor?: ConnectionAnchor;
  targetAnchor?: ConnectionAnchor;
  attachedToObjectId?: string;
  attachedOffsetX?: number;
  attachedOffsetY?: number;
};

const nowIso = () => new Date().toISOString();
const fileSlug = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "whiteboard";

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function imagePdfBlob(jpegDataUrl: string, width: number, height: number) {
  const encoder = new TextEncoder();
  const imageBytes = dataUrlBytes(jpegDataUrl);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const write = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    write(`${id} 0 obj\n${body}\nendobj\n`);
  };

  write("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Math.round(width)} ${Math.round(height)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  offsets[4] = length;
  write(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(
      height
    )} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`
  );
  write(imageBytes);
  write("\nendstream\nendobj\n");
  const content = `q\n${Math.round(width)} 0 0 ${Math.round(height)} 0 0 cm\n/Im0 Do\nQ`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);

  const xrefStart = length;
  write("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return new Blob([output.buffer as ArrayBuffer], { type: "application/pdf" });
}

function ensureRoomId() {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get("room");

  if (existing) {
    return existing;
  }

  const roomId = crypto.randomUUID().slice(0, 8);
  params.set("room", roomId);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  return roomId;
}

function readClassroomId() {
  return new URLSearchParams(window.location.search).get("classroom") ?? undefined;
}

function isInstructorMode() {
  return new URLSearchParams(window.location.search).get("mode") === "instructor";
}

function isInstructorReview() {
  return new URLSearchParams(window.location.search).get("instructor") === "1";
}

function createParticipant(): Participant {
  const instructorReview = isInstructorReview();
  const stored = window.localStorage.getItem("daedalus-participant");

  if (stored) {
    const parsed = JSON.parse(stored) as Participant;
    return {
      ...parsed,
      name: instructorReview ? "Instructor" : parsed.name,
      color: instructorReview ? "#dc2626" : parsed.color,
      role: instructorReview ? "instructor" : parsed.role,
      tool: "select",
      online: true,
      lastActiveAt: nowIso()
    };
  }

  const id = crypto.randomUUID();
  const participant: Participant = {
    id,
    name: instructorReview ? "Instructor" : `Guest ${id.slice(0, 4)}`,
    color: instructorReview ? "#dc2626" : PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)],
    role: instructorReview ? "instructor" : "owner",
    tool: "select",
    online: true,
    joinedAt: nowIso(),
    lastActiveAt: nowIso()
  };

  window.localStorage.setItem("daedalus-participant", JSON.stringify(participant));
  return participant;
}

function isSerializableObject(object: fabric.Object) {
  const objectWithMeta = object as FabricObjectWithMeta;
  return objectWithMeta.objectType !== "analysis-highlight" && object.type !== "activeSelection";
}

function isPlacementTool(tool: DrawingTool) {
  return PLACEMENT_TOOLS.includes(tool);
}

type ShapePaint = {
  fill: string;
  stroke: string;
  strokeWidth: number;
};

function centeredShape(pointer: fabric.Point, width: number, height: number, paint: ShapePaint) {
  return {
    left: pointer.x - width / 2,
    top: pointer.y - height / 2,
    fill: paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeUniform: true
  };
}

function makePolygon(points: Array<{ x: number; y: number }>, pointer: fabric.Point, width: number, height: number, paint: ShapePaint) {
  return new fabric.Polygon(points as fabric.Point[], centeredShape(pointer, width, height, paint));
}

function makePath(path: string, pointer: fabric.Point, width: number, height: number, paint: ShapePaint) {
  return new fabric.Path(path, {
    ...centeredShape(pointer, width, height, paint),
    strokeLineJoin: "round"
  });
}

function makeLine(x1: number, y1: number, x2: number, y2: number, paint: ShapePaint) {
  return new fabric.Line([x1, y1, x2, y2], {
    stroke: paint.stroke,
    strokeLineCap: "round",
    strokeWidth: paint.strokeWidth,
    strokeUniform: true
  });
}

function makeGroup(pointer: fabric.Point, width: number, height: number, objects: fabric.Object[]) {
  return new fabric.Group(objects, {
    left: pointer.x - width / 2,
    top: pointer.y - height / 2
  });
}

function makeShapeText(text: string, left: number, top: number, width: number, paint: ShapePaint, fontSize = 14) {
  return new fabric.Textbox(text, {
    left,
    top,
    width,
    fill: paint.stroke,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize,
    fontWeight: "700",
    textAlign: "center"
  });
}

function makeDatabase(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 128, 92, [
    new fabric.Rect({
      left: 0,
      top: 15,
      width: 128,
      height: 62,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Ellipse({
      left: 0,
      top: 0,
      rx: 64,
      ry: 16,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Path("M 0 77 C 0 98 128 98 128 77", {
      left: 0,
      top: 0,
      fill: "",
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeActor(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 120, 118, [
    new fabric.Circle({
      left: 42,
      top: 0,
      radius: 18,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(60, 36, 60, 78, paint),
    makeLine(24, 52, 96, 52, paint),
    makeLine(60, 78, 28, 112, paint),
    makeLine(60, 78, 92, 112, paint)
  ]);
}

function makeUmlClass(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 150, 118, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 150,
      height: 118,
      rx: 4,
      ry: 4,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(0, 34, 150, 34, paint),
    makeLine(0, 74, 150, 74, paint),
    makeShapeText("Class", 10, 8, 130, paint, 15),
    makeShapeText("+ attribute", 10, 45, 130, paint, 13),
    makeShapeText("+ method()", 10, 84, 130, paint, 13)
  ]);
}

function makePackage(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 148, 100, [
    new fabric.Rect({
      left: 0,
      top: 18,
      width: 148,
      height: 82,
      rx: 4,
      ry: 4,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 58,
      height: 24,
      rx: 4,
      ry: 4,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeDoubleRect(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 80, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 136,
      height: 80,
      rx: 4,
      ry: 4,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Rect({
      left: 7,
      top: 7,
      width: 122,
      height: 66,
      rx: 3,
      ry: 3,
      fill: "rgba(255,255,255,0)",
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeDoubleEllipse(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 80, [
    new fabric.Ellipse({
      left: 0,
      top: 0,
      rx: 68,
      ry: 40,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Ellipse({
      left: 8,
      top: 7,
      rx: 60,
      ry: 33,
      fill: "rgba(255,255,255,0)",
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeDoubleDiamond(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 88, [
    new fabric.Polygon(
      [
        { x: 68, y: 0 },
        { x: 136, y: 44 },
        { x: 68, y: 88 },
        { x: 0, y: 44 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    ),
    new fabric.Polygon(
      [
        { x: 68, y: 10 },
        { x: 122, y: 44 },
        { x: 68, y: 78 },
        { x: 14, y: 44 }
      ],
      {
        left: 0,
        top: 0,
        fill: "rgba(255,255,255,0)",
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    )
  ]);
}

function makeStateEnd(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 52, 52, [
    new fabric.Circle({
      left: 0,
      top: 0,
      radius: 26,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Circle({
      left: 13,
      top: 13,
      radius: 13,
      fill: paint.stroke,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeResistor(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 128, 64, [
    new fabric.Path("M 0 32 L 24 32 L 32 14 L 48 50 L 64 14 L 80 50 L 96 14 L 104 32 L 128 32", {
      left: 0,
      top: 0,
      fill: "",
      stroke: paint.stroke,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeCapacitor(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 118, 66, [
    makeLine(0, 33, 42, 33, paint),
    makeLine(42, 10, 42, 56, paint),
    makeLine(76, 10, 76, 56, paint),
    makeLine(76, 33, 118, 33, paint)
  ]);
}

function makeGround(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 84, 74, [
    makeLine(42, 0, 42, 28, paint),
    makeLine(12, 28, 72, 28, paint),
    makeLine(22, 46, 62, 46, paint),
    makeLine(32, 64, 52, 64, paint)
  ]);
}

function makeBattery(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 132, 76, [
    makeLine(0, 38, 42, 38, paint),
    makeLine(42, 14, 42, 62, paint),
    makeLine(66, 4, 66, 72, paint),
    makeLine(66, 38, 132, 38, paint),
    makeShapeText("-", 18, 12, 18, paint, 16),
    makeShapeText("+", 82, 8, 24, paint, 18)
  ]);
}

function regularPolygonPoints(sides: number, radius: number, centerX: number, centerY: number, rotation = -Math.PI / 2) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * Math.PI * 2) / sides;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
}

function starPoints(centerX: number, centerY: number, outerRadius: number, innerRadius: number) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
}

function makeFoldedNote(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 118, 92, [
    new fabric.Polygon(
      [
        { x: 0, y: 0 },
        { x: 86, y: 0 },
        { x: 118, y: 32 },
        { x: 118, y: 92 },
        { x: 0, y: 92 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    ),
    new fabric.Polygon(
      [
        { x: 86, y: 0 },
        { x: 86, y: 32 },
        { x: 118, y: 32 }
      ],
      {
        left: 0,
        top: 0,
        fill: "rgba(255,255,255,0)",
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    )
  ]);
}

function makeCallout(pointer: fabric.Point, paint: ShapePaint) {
  return makePolygon(
    [
      { x: 0, y: 0 },
      { x: 132, y: 0 },
      { x: 132, y: 70 },
      { x: 82, y: 70 },
      { x: 62, y: 96 },
      { x: 56, y: 70 },
      { x: 0, y: 70 }
    ],
    pointer,
    132,
    96,
    paint
  );
}

function makeCube(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 132, 102, [
    new fabric.Rect({
      left: 0,
      top: 22,
      width: 96,
      height: 80,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Polygon(
      [
        { x: 0, y: 22 },
        { x: 36, y: 0 },
        { x: 132, y: 0 },
        { x: 96, y: 22 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    ),
    new fabric.Polygon(
      [
        { x: 96, y: 22 },
        { x: 132, y: 0 },
        { x: 132, y: 80 },
        { x: 96, y: 102 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    )
  ]);
}

function makeFolder(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 144, 94, [
    new fabric.Polygon(
      [
        { x: 0, y: 18 },
        { x: 46, y: 18 },
        { x: 58, y: 0 },
        { x: 96, y: 0 },
        { x: 106, y: 18 },
        { x: 144, y: 18 },
        { x: 144, y: 94 },
        { x: 0, y: 94 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    )
  ]);
}

function makeTableShape(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 96, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 136,
      height: 96,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(0, 30, 136, 30, paint),
    makeLine(0, 62, 136, 62, paint),
    makeLine(45, 0, 45, 96, paint),
    makeLine(91, 0, 91, 96, paint)
  ]);
}

function makeDoubleDocument(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 144, 100, [
    new fabric.Path("M 12 0 L 144 0 L 144 68 Q 111 50 78 68 Q 45 86 12 68 Z", {
      left: 0,
      top: 0,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Path("M 0 14 L 132 14 L 132 82 Q 99 64 66 82 Q 33 100 0 82 Z", {
      left: 0,
      top: 0,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makePredefinedProcess(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 76, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 136,
      height: 76,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(20, 0, 20, 76, paint),
    makeLine(116, 0, 116, 76, paint)
  ]);
}

function makeInternalStorage(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 84, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 136,
      height: 84,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(26, 0, 26, 84, paint),
    makeLine(0, 24, 136, 24, paint)
  ]);
}

function makeDisplay(pointer: fabric.Point, paint: ShapePaint) {
  return makePath("M 0 42 Q 22 0 70 0 L 132 0 Q 110 42 132 84 L 70 84 Q 22 84 0 42 Z", pointer, 132, 84, paint);
}

function makeDelay(pointer: fabric.Point, paint: ShapePaint) {
  return makePath("M 0 0 L 72 0 Q 128 0 128 42 Q 128 84 72 84 L 0 84 Z", pointer, 128, 84, paint);
}

function makeCard(pointer: fabric.Point, paint: ShapePaint) {
  return makePolygon(
    [
      { x: 0, y: 0 },
      { x: 136, y: 0 },
      { x: 136, y: 84 },
      { x: 24, y: 84 },
      { x: 0, y: 60 }
    ],
    pointer,
    136,
    84,
    paint
  );
}

function makeTape(pointer: fabric.Point, paint: ShapePaint) {
  return makePath("M 0 42 C 0 8 28 0 52 18 C 82 40 112 40 140 18 L 140 76 C 112 58 82 58 52 76 C 28 94 0 76 0 42 Z", pointer, 140, 94, paint);
}

function makeJunction(pointer: fabric.Point, paint: ShapePaint, label: string) {
  return makeGroup(pointer, 64, 64, [
    new fabric.Circle({
      left: 0,
      top: 0,
      radius: 32,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeShapeText(label, 12, 18, 40, paint, 20)
  ]);
}

function makeAssociativeEntity(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 144, 92, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 144,
      height: 92,
      rx: 4,
      ry: 4,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Polygon(
      [
        { x: 72, y: 12 },
        { x: 120, y: 46 },
        { x: 72, y: 80 },
        { x: 24, y: 46 }
      ],
      {
        left: 0,
        top: 0,
        fill: "rgba(255,255,255,0)",
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    )
  ]);
}

function makeKeyAttribute(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 80, [
    new fabric.Ellipse({
      left: 0,
      top: 0,
      rx: 68,
      ry: 40,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(34, 56, 102, 56, paint)
  ]);
}

function makeDerivedAttribute(pointer: fabric.Point, paint: ShapePaint) {
  return new fabric.Ellipse({
    ...centeredShape(pointer, 128, 76, paint),
    rx: 64,
    ry: 38,
    strokeDashArray: [8, 5]
  });
}

function makeUmlInterface(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 108, 92, [
    new fabric.Circle({
      left: 30,
      top: 0,
      radius: 24,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeShapeText("interface", 0, 58, 108, paint, 13)
  ]);
}

function makeUmlObject(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 142, 76, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 142,
      height: 76,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeShapeText("object:Class", 14, 18, 114, paint, 14),
    makeLine(26, 42, 116, 42, paint)
  ]);
}

function makeComponentShape(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 150, 92, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 150,
      height: 92,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Rect({
      left: 12,
      top: 18,
      width: 28,
      height: 16,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Rect({
      left: 12,
      top: 54,
      width: 28,
      height: 16,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeLifeline(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 104, 170, [
    new fabric.Rect({
      left: 0,
      top: 0,
      width: 104,
      height: 40,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Line([52, 40, 52, 170], {
      stroke: paint.stroke,
      strokeDashArray: [6, 5],
      strokeLineCap: "round",
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeActivation(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 34, 150, [
    new fabric.Rect({
      left: 8,
      top: 0,
      width: 18,
      height: 150,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeLogicNot(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 136, 84, [
    new fabric.Polygon(
      [
        { x: 0, y: 0 },
        { x: 94, y: 42 },
        { x: 0, y: 84 }
      ],
      {
        left: 0,
        top: 0,
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      }
    ),
    new fabric.Circle({
      left: 96,
      top: 32,
      radius: 10,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(116, 42, 136, 42, paint)
  ]);
}

function makeLogicXor(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 138, 84, [
    new fabric.Path("M 10 0 Q 52 42 10 84", {
      left: 0,
      top: 0,
      fill: "",
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    new fabric.Path("M 0 0 Q 42 42 0 84 L 56 84 Q 128 84 128 42 Q 128 0 56 0 Z", {
      left: 10,
      top: 0,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    })
  ]);
}

function makeSwitch(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 130, 68, [makeLine(0, 48, 42, 48, paint), makeLine(88, 48, 130, 48, paint), makeLine(42, 48, 88, 14, paint)]);
}

function makeLed(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 132, 92, [
    makeLogicNot(new fabric.Point(68, 46), paint),
    makeLine(88, 0, 122, 0, paint),
    makeLine(100, 16, 132, 16, paint),
    makeLine(122, 0, 114, 8, paint),
    makeLine(122, 0, 112, -2, paint),
    makeLine(132, 16, 124, 24, paint),
    makeLine(132, 16, 122, 14, paint)
  ]);
}

function makeInductor(pointer: fabric.Point, paint: ShapePaint) {
  return makeGroup(pointer, 140, 64, [
    makeLine(0, 32, 24, 32, paint),
    new fabric.Path("M 24 32 C 24 8 52 8 52 32 C 52 8 80 8 80 32 C 80 8 108 8 108 32 C 108 8 136 8 136 32", {
      left: 0,
      top: 0,
      fill: "",
      stroke: paint.stroke,
      strokeLineCap: "round",
      strokeWidth: paint.strokeWidth,
      strokeUniform: true
    }),
    makeLine(136, 32, 140, 32, paint)
  ]);
}

function createDiagramShape(tool: DrawingTool, pointer: fabric.Point, paint: ShapePaint): fabric.Object | null {
  switch (tool) {
    case "rectangle":
      return new fabric.Rect({
        ...centeredShape(pointer, 128, 76, paint),
        width: 128,
        height: 76,
        rx: 4,
        ry: 4
      });
    case "rounded-rectangle":
      return new fabric.Rect({
        ...centeredShape(pointer, 132, 72, paint),
        width: 132,
        height: 72,
        rx: 18,
        ry: 18
      });
    case "square":
      return new fabric.Rect({
        ...centeredShape(pointer, 92, 92, paint),
        width: 92,
        height: 92,
        rx: 3,
        ry: 3
      });
    case "ellipse":
    case "er-attribute":
      return new fabric.Ellipse({
        ...centeredShape(pointer, 128, 76, paint),
        rx: 64,
        ry: 38
      });
    case "diamond":
    case "er-relationship":
      return makePolygon(
        [
          { x: 64, y: 0 },
          { x: 128, y: 42 },
          { x: 64, y: 84 },
          { x: 0, y: 42 }
        ],
        pointer,
        128,
        84,
        paint
      );
    case "triangle":
      return makePolygon(
        [
          { x: 64, y: 0 },
          { x: 128, y: 96 },
          { x: 0, y: 96 }
        ],
        pointer,
        128,
        96,
        paint
      );
    case "pentagon":
      return makePolygon(regularPolygonPoints(5, 58, 64, 64), pointer, 128, 128, paint);
    case "octagon":
      return makePolygon(regularPolygonPoints(8, 58, 64, 64, Math.PI / 8), pointer, 128, 128, paint);
    case "plus-shape":
      return makePolygon(
        [
          { x: 48, y: 0 },
          { x: 80, y: 0 },
          { x: 80, y: 48 },
          { x: 128, y: 48 },
          { x: 128, y: 80 },
          { x: 80, y: 80 },
          { x: 80, y: 128 },
          { x: 48, y: 128 },
          { x: 48, y: 80 },
          { x: 0, y: 80 },
          { x: 0, y: 48 },
          { x: 48, y: 48 }
        ],
        pointer,
        128,
        128,
        paint
      );
    case "cross":
      return makePolygon(
        [
          { x: 22, y: 0 },
          { x: 64, y: 42 },
          { x: 106, y: 0 },
          { x: 128, y: 22 },
          { x: 86, y: 64 },
          { x: 128, y: 106 },
          { x: 106, y: 128 },
          { x: 64, y: 86 },
          { x: 22, y: 128 },
          { x: 0, y: 106 },
          { x: 42, y: 64 },
          { x: 0, y: 22 }
        ],
        pointer,
        128,
        128,
        paint
      );
    case "star":
      return makePolygon(starPoints(64, 64, 62, 27), pointer, 128, 128, paint);
    case "callout":
      return makeCallout(pointer, paint);
    case "cube":
      return makeCube(pointer, paint);
    case "folder":
      return makeFolder(pointer, paint);
    case "table":
      return makeTableShape(pointer, paint);
    case "note":
    case "uml-note":
      return makeFoldedNote(pointer, paint);
    case "double-document":
      return makeDoubleDocument(pointer, paint);
    case "card":
      return makeCard(pointer, paint);
    case "tape":
      return makeTape(pointer, paint);
    case "terminator":
      return new fabric.Rect({
        ...centeredShape(pointer, 132, 64, paint),
        width: 132,
        height: 64,
        rx: 32,
        ry: 32
      });
    case "parallelogram":
      return makePolygon(
        [
          { x: 26, y: 0 },
          { x: 136, y: 0 },
          { x: 110, y: 76 },
          { x: 0, y: 76 }
        ],
        pointer,
        136,
        76,
        paint
      );
    case "document":
      return makePath("M 0 0 L 132 0 L 132 68 Q 99 50 66 68 Q 33 86 0 68 Z", pointer, 132, 86, paint);
    case "hexagon":
      return makePolygon(
        [
          { x: 28, y: 0 },
          { x: 108, y: 0 },
          { x: 136, y: 42 },
          { x: 108, y: 84 },
          { x: 28, y: 84 },
          { x: 0, y: 42 }
        ],
        pointer,
        136,
        84,
        paint
      );
    case "trapezoid":
      return makePolygon(
        [
          { x: 18, y: 0 },
          { x: 128, y: 0 },
          { x: 110, y: 76 },
          { x: 0, y: 76 }
        ],
        pointer,
        128,
        76,
        paint
      );
    case "predefined-process":
      return makePredefinedProcess(pointer, paint);
    case "internal-storage":
      return makeInternalStorage(pointer, paint);
    case "manual-input":
      return makePolygon(
        [
          { x: 0, y: 22 },
          { x: 136, y: 0 },
          { x: 136, y: 76 },
          { x: 0, y: 76 }
        ],
        pointer,
        136,
        76,
        paint
      );
    case "stored-data":
      return makeDatabase(pointer, paint);
    case "delay":
      return makeDelay(pointer, paint);
    case "display":
      return makeDisplay(pointer, paint);
    case "off-page-connector":
      return makePolygon(
        [
          { x: 0, y: 0 },
          { x: 128, y: 0 },
          { x: 128, y: 64 },
          { x: 64, y: 104 },
          { x: 0, y: 64 }
        ],
        pointer,
        128,
        104,
        paint
      );
    case "sort":
      return makePolygon(
        [
          { x: 64, y: 0 },
          { x: 128, y: 52 },
          { x: 64, y: 104 },
          { x: 0, y: 52 }
        ],
        pointer,
        128,
        104,
        paint
      );
    case "merge":
      return makePolygon(
        [
          { x: 0, y: 0 },
          { x: 128, y: 0 },
          { x: 64, y: 104 }
        ],
        pointer,
        128,
        104,
        paint
      );
    case "collate":
      return makePolygon(
        [
          { x: 0, y: 0 },
          { x: 128, y: 0 },
          { x: 64, y: 52 },
          { x: 128, y: 104 },
          { x: 0, y: 104 },
          { x: 64, y: 52 }
        ],
        pointer,
        128,
        104,
        paint
      );
    case "summing-junction":
      return makeJunction(pointer, paint, "+");
    case "or-junction":
      return makeJunction(pointer, paint, "x");
    case "database":
      return makeDatabase(pointer, paint);
    case "cloud":
      return makePath(
        "M 34 84 C 16 84 0 70 0 52 C 0 36 13 23 30 24 C 38 7 56 0 74 8 C 86 2 104 6 114 20 C 130 23 140 36 140 52 C 140 70 126 84 106 84 Z",
        pointer,
        140,
        88,
        paint
      );
    case "actor":
      return makeActor(pointer, paint);
    case "uml-class":
      return makeUmlClass(pointer, paint);
    case "uml-interface":
      return makeUmlInterface(pointer, paint);
    case "uml-object":
      return makeUmlObject(pointer, paint);
    case "component":
      return makeComponentShape(pointer, paint);
    case "lifeline":
      return makeLifeline(pointer, paint);
    case "activation":
      return makeActivation(pointer, paint);
    case "package":
      return makePackage(pointer, paint);
    case "er-entity":
      return new fabric.Rect({
        ...centeredShape(pointer, 136, 80, paint),
        width: 136,
        height: 80,
        rx: 4,
        ry: 4
      });
    case "weak-entity":
      return makeDoubleRect(pointer, paint);
    case "associative-entity":
      return makeAssociativeEntity(pointer, paint);
    case "key-attribute":
      return makeKeyAttribute(pointer, paint);
    case "derived-attribute":
      return makeDerivedAttribute(pointer, paint);
    case "multivalue-attribute":
      return makeDoubleEllipse(pointer, paint);
    case "identifying-relationship":
      return makeDoubleDiamond(pointer, paint);
    case "state-start":
      return new fabric.Circle({
        left: pointer.x - 22,
        top: pointer.y - 22,
        radius: 22,
        fill: paint.stroke,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        strokeUniform: true
      });
    case "state-end":
      return makeStateEnd(pointer, paint);
    case "resistor":
      return makeResistor(pointer, paint);
    case "capacitor":
      return makeCapacitor(pointer, paint);
    case "ground":
      return makeGround(pointer, paint);
    case "battery":
      return makeBattery(pointer, paint);
    case "logic-and":
      return makePath("M 0 0 L 64 0 Q 128 0 128 42 Q 128 84 64 84 L 0 84 Z", pointer, 128, 84, paint);
    case "logic-or":
      return makePath("M 0 0 Q 42 42 0 84 L 56 84 Q 128 84 128 42 Q 128 0 56 0 Z", pointer, 128, 84, paint);
    case "logic-not":
      return makeLogicNot(pointer, paint);
    case "logic-xor":
      return makeLogicXor(pointer, paint);
    case "switch":
      return makeSwitch(pointer, paint);
    case "led":
      return makeLed(pointer, paint);
    case "inductor":
      return makeInductor(pointer, paint);
    default:
      return null;
  }
}

function serializablePaint(value: fabric.Object["fill"]) {
  return typeof value === "string" ? value : undefined;
}

function fallbackObjectPayload(object: fabric.Object): CanvasObjectPayload | null {
  const objectWithMeta = object as FabricObjectWithMeta;

  if (!objectWithMeta.objectId) {
    return null;
  }

  const payload: CanvasObjectPayload = {
    objectId: objectWithMeta.objectId,
    objectType: objectWithMeta.objectType ?? object.type ?? "object",
    authorId: objectWithMeta.authorId,
    type: object.type,
    left: object.left ?? 0,
    top: object.top ?? 0,
    width: object.width ?? 0,
    height: object.height ?? 0,
    scaleX: object.scaleX ?? 1,
    scaleY: object.scaleY ?? 1,
    angle: object.angle ?? 0,
    fill: serializablePaint(object.fill),
    stroke: serializablePaint(object.stroke),
    strokeWidth: object.strokeWidth ?? 1,
    strokeUniform: object.strokeUniform ?? true,
    opacity: object.opacity ?? 1,
    sourceObjectId: objectWithMeta.sourceObjectId,
    targetObjectId: objectWithMeta.targetObjectId,
    sourceAnchor: objectWithMeta.sourceAnchor,
    targetAnchor: objectWithMeta.targetAnchor,
    attachedToObjectId: objectWithMeta.attachedToObjectId,
    attachedOffsetX: objectWithMeta.attachedOffsetX,
    attachedOffsetY: objectWithMeta.attachedOffsetY
  };

  if (object instanceof fabric.Ellipse) {
    payload.rx = object.rx ?? 0;
    payload.ry = object.ry ?? 0;
  }

  if (object instanceof fabric.Rect) {
    payload.rx = object.rx ?? 0;
    payload.ry = object.ry ?? 0;
  }

  if (object instanceof fabric.Line) {
    payload.x1 = object.x1 ?? 0;
    payload.y1 = object.y1 ?? 0;
    payload.x2 = object.x2 ?? 0;
    payload.y2 = object.y2 ?? 0;
  }

  if (object instanceof fabric.Polygon) {
    payload.points = object.points ?? [];
  }

  if (object instanceof fabric.Text) {
    payload.text = object.text ?? "";
    payload.fontFamily = object.fontFamily;
    payload.fontSize = object.fontSize;
    payload.fontWeight = object.fontWeight;
    payload.fontStyle = object.fontStyle;
    payload.textAlign = object.textAlign;
  }

  if (object instanceof fabric.Path && Array.isArray(object.path)) {
    payload.path = object.path;
  }

  return payload;
}

function isGeneratedTextPayload(object: CanvasObjectPayload) {
  return object.objectType === "text" && /^gen-/.test(object.objectId) && /(?:-label|-body)$/.test(object.objectId);
}

function normalizeGeneratedTextPayload(object: CanvasObjectPayload): CanvasObjectPayload {
  if (!isGeneratedTextPayload(object)) {
    return object;
  }

  return {
    ...object,
    type: "textbox",
    textAlign: "center"
  };
}

function serializeFabricObject(object: fabric.Object): CanvasObjectPayload | null {
  if (!isSerializableObject(object)) {
    return null;
  }

  try {
    object.setCoords();
    return object.toObject(FABRIC_CUSTOM_PROPS) as CanvasObjectPayload;
  } catch (error) {
    console.warn("Falling back to minimal Fabric object serialization", error);
    return fallbackObjectPayload(object);
  }
}

function objectById(canvas: fabric.Canvas, objectId: string) {
  return canvas.getObjects().find((object) => (object as FabricObjectWithMeta).objectId === objectId) as
    | FabricObjectWithMeta
    | undefined;
}

const CONNECTION_ANCHORS: ConnectionAnchor[] = ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"];

function isConnectorObject(object: fabric.Object) {
  return (object as FabricObjectWithMeta).objectType === "connector";
}

function isAttachedObject(object: fabric.Object) {
  return Boolean((object as FabricObjectWithMeta).attachedToObjectId);
}

function isConnectableObject(object?: FabricObjectWithMeta) {
  if (!object || !isSerializableObject(object)) {
    return false;
  }

  const type = object.objectType ?? object.type ?? "object";
  return !["connector", "stroke", "analysis-highlight"].includes(type);
}

function anchorPointForObject(object: fabric.Object, anchor: ConnectionAnchor) {
  object.setCoords();
  const bounds = object.getBoundingRect(true, true);
  const points: Record<ConnectionAnchor, fabric.Point> = {
    top: new fabric.Point(bounds.left + bounds.width / 2, bounds.top),
    right: new fabric.Point(bounds.left + bounds.width, bounds.top + bounds.height / 2),
    bottom: new fabric.Point(bounds.left + bounds.width / 2, bounds.top + bounds.height),
    left: new fabric.Point(bounds.left, bounds.top + bounds.height / 2),
    "top-left": new fabric.Point(bounds.left, bounds.top),
    "top-right": new fabric.Point(bounds.left + bounds.width, bounds.top),
    "bottom-right": new fabric.Point(bounds.left + bounds.width, bounds.top + bounds.height),
    "bottom-left": new fabric.Point(bounds.left, bounds.top + bounds.height)
  };

  return points[anchor];
}

function nearestConnectionAnchor(object: fabric.Object, pointer: fabric.Point): ConnectionAnchor {
  return CONNECTION_ANCHORS.reduce((nearest, anchor) => {
    const nearestPoint = anchorPointForObject(object, nearest);
    const anchorPoint = anchorPointForObject(object, anchor);
    const nearestDistance = Math.hypot(nearestPoint.x - pointer.x, nearestPoint.y - pointer.y);
    const anchorDistance = Math.hypot(anchorPoint.x - pointer.x, anchorPoint.y - pointer.y);
    return anchorDistance < nearestDistance ? anchor : nearest;
  }, "right" as ConnectionAnchor);
}

function connectorTargetFromEvent(canvas: fabric.Canvas, event: MouseEvent) {
  const target = canvas.findTarget(event, false) as FabricObjectWithMeta | undefined;

  if (target?.attachedToObjectId) {
    const attachedTarget = objectById(canvas, target.attachedToObjectId) as FabricObjectWithMeta | undefined;
    return isConnectableObject(attachedTarget) ? attachedTarget : undefined;
  }

  return isConnectableObject(target) ? target : undefined;
}

function attachConnectorEnd(line: fabric.Line, target: FabricObjectWithMeta | undefined, pointer: fabric.Point) {
  if (!target?.objectId || target.objectId === (line as FabricObjectWithMeta).sourceObjectId) {
    delete (line as FabricObjectWithMeta).targetObjectId;
    delete (line as FabricObjectWithMeta).targetAnchor;
    line.set({ x2: pointer.x, y2: pointer.y });
    return;
  }

  const anchor = nearestConnectionAnchor(target, pointer);
  const anchorPoint = anchorPointForObject(target, anchor);
  const lineWithMeta = line as FabricObjectWithMeta;
  lineWithMeta.targetObjectId = target.objectId;
  lineWithMeta.targetAnchor = anchor;
  line.set({ x2: anchorPoint.x, y2: anchorPoint.y });
}

function updateAttachedConnector(canvas: fabric.Canvas, connector: fabric.Object) {
  if (!(connector instanceof fabric.Line)) {
    return;
  }

  const connectorWithMeta = connector as FabricObjectWithMeta;

  if (connectorWithMeta.sourceObjectId && connectorWithMeta.sourceAnchor) {
    const source = objectById(canvas, connectorWithMeta.sourceObjectId);

    if (source) {
      const sourcePoint = anchorPointForObject(source, connectorWithMeta.sourceAnchor);
      connector.set({ x1: sourcePoint.x, y1: sourcePoint.y });
    }
  }

  if (connectorWithMeta.targetObjectId && connectorWithMeta.targetAnchor) {
    const target = objectById(canvas, connectorWithMeta.targetObjectId);

    if (target) {
      const targetPoint = anchorPointForObject(target, connectorWithMeta.targetAnchor);
      connector.set({ x2: targetPoint.x, y2: targetPoint.y });
    }
  }

  connector.setCoords();
  updateAttachedObjectsForObject(canvas, connectorWithMeta);
}

function connectedLinesForObject(canvas: fabric.Canvas, objectId: string) {
  return canvas
    .getObjects()
    .filter((object): object is fabric.Line & FabricObjectWithMeta => {
      const connector = object as FabricObjectWithMeta;
      return object instanceof fabric.Line && connector.objectType === "connector" && (connector.sourceObjectId === objectId || connector.targetObjectId === objectId);
    });
}

function attachedObjectsForObject(canvas: fabric.Canvas, objectId: string) {
  return canvas.getObjects().filter((object): object is fabric.Object & FabricObjectWithMeta => {
    return (object as FabricObjectWithMeta).attachedToObjectId === objectId;
  });
}

function attachmentBasePoint(target: fabric.Object) {
  if (target instanceof fabric.Line) {
    return {
      left: ((target.x1 ?? 0) + (target.x2 ?? 0)) / 2,
      top: ((target.y1 ?? 0) + (target.y2 ?? 0)) / 2
    };
  }

  return {
    left: target.left ?? 0,
    top: target.top ?? 0
  };
}

function updateAttachedObjectsForObject(canvas: fabric.Canvas, target: FabricObjectWithMeta) {
  if (!target.objectId) {
    return [];
  }

  const { left, top } = attachmentBasePoint(target);
  const attachedObjects = attachedObjectsForObject(canvas, target.objectId);

  attachedObjects.forEach((object) => {
    object.set({
      left: left + (object.attachedOffsetX ?? 0),
      top: top + (object.attachedOffsetY ?? 0)
    });
    object.setCoords();
  });

  return attachedObjects;
}

function updateAttachmentOffsetForObject(canvas: fabric.Canvas, target: FabricObjectWithMeta) {
  if (!target.attachedToObjectId) {
    return false;
  }

  const attachedTarget = objectById(canvas, target.attachedToObjectId);

  if (!attachedTarget) {
    return false;
  }

  const { left, top } = attachmentBasePoint(attachedTarget);
  target.attachedOffsetX = (target.left ?? 0) - left;
  target.attachedOffsetY = (target.top ?? 0) - top;
  return true;
}

function inferGeneratedAttachmentMetadata(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((object) => {
    const objectWithMeta = object as FabricObjectWithMeta;

    if (objectWithMeta.attachedToObjectId || objectWithMeta.objectType !== "text" || !objectWithMeta.objectId) {
      return;
    }

    const edgeMatch = objectWithMeta.objectId.match(/^(.*-edge-\d+)-label$/);

    if (edgeMatch?.[1]) {
      const target = objectById(canvas, edgeMatch[1]);

      if (target) {
        const { left, top } = attachmentBasePoint(target);
        objectWithMeta.attachedToObjectId = target.objectId;
        objectWithMeta.attachedOffsetX = (object.left ?? 0) - left;
        objectWithMeta.attachedOffsetY = (object.top ?? 0) - top;
        object.set({
          selectable: true,
          evented: true
        });
      }

      return;
    }

    const match = objectWithMeta.objectId.match(/^(.*)-(?:label|body)$/);
    if (!match?.[1]) {
      return;
    }

    const target = objectById(canvas, `${match[1]}-shape`);
    if (!target) {
      return;
    }

    objectWithMeta.attachedToObjectId = target.objectId;
    objectWithMeta.attachedOffsetX = (object.left ?? 0) - (target.left ?? 0);
    objectWithMeta.attachedOffsetY = (object.top ?? 0) - (target.top ?? 0);
    object.set({
      selectable: true,
      evented: true
    });
  });
}

function applyCanvasObjectInteractivity(canvas: fabric.Canvas, tool: DrawingTool) {
  canvas.getObjects().forEach((object) => {
    const isHighlight = (object as FabricObjectWithMeta).objectType === "analysis-highlight";
    object.selectable = !isHighlight && tool === "select";
    object.evented = !isHighlight && (tool === "select" || tool === "eraser" || tool === "connector");
  });
}

function updateConnectedLinesForObject(canvas: fabric.Canvas, objectId: string) {
  const lines = connectedLinesForObject(canvas, objectId);
  lines.forEach((line) => updateAttachedConnector(canvas, line));
  return lines;
}

function refreshAttachedObjects(canvas: fabric.Canvas) {
  inferGeneratedAttachmentMetadata(canvas);
  canvas.getObjects().forEach((object) => updateAttachedObjectsForObject(canvas, object as FabricObjectWithMeta));
}

function refreshAttachedConnectors(canvas: fabric.Canvas) {
  canvas.getObjects().filter(isConnectorObject).forEach((connector) => updateAttachedConnector(canvas, connector));
}

function BoardApp() {
  const roomId = useMemo(ensureRoomId, []);
  const classroomId = useMemo(readClassroomId, []);
  const participant = useMemo(createParticipant, []);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const activeLineRef = useRef<fabric.Line | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef({ x: 0, y: 0 });
  const lastCursorSentRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const analysisTimerRef = useRef<number | null>(null);
  const didLoadInitialBoardRef = useRef(false);

  const [boardName, setBoardName] = useState("Collaborative AI Whiteboard");
  const [boardTags, setBoardTags] = useState<string[]>([]);
  const [currentTool, setCurrentTool] = useState<DrawingTool>("select");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredTheme());
  const [strokeColor, setStrokeColor] = useState(() => (isInstructorReview() ? "#dc2626" : defaultStrokeForTheme(readStoredTheme())));
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [localToasts, setLocalToasts] = useState<ToastMessage[]>([]);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentPlacing, setCommentPlacing] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  const {
    analysis,
    boardState,
    chat,
    comments,
    connectionStatus,
    participants,
    remoteCursors,
    remoteOperation,
    requestAnalysis,
    sendChat,
    sendCursor,
    sendOperation,
    toasts,
    createComment,
    updateBoardMeta,
    updateComment,
    updateParticipant
  } = useBoardSocket(roomId, participant, classroomId);

  const currentToolRef = useRef(currentTool);
  const strokeColorRef = useRef(strokeColor);
  const fillColorRef = useRef(fillColor);
  const strokeWidthRef = useRef(strokeWidth);
  const commentPlacingRef = useRef(commentPlacing);

  useEffect(() => {
    currentToolRef.current = currentTool;
    updateParticipant({ tool: currentTool });
  }, [currentTool, updateParticipant]);

  useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  useEffect(() => {
    fillColorRef.current = fillColor;
  }, [fillColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
    const canvas = fabricRef.current;

    if (canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [strokeWidth]);

  useEffect(() => {
    commentPlacingRef.current = commentPlacing;
  }, [commentPlacing]);

  const toggleTheme = useCallback(() => {
    setThemeMode((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      window.localStorage.setItem("daedalus-theme", nextTheme);

      if (!isInstructorReview()) {
        setStrokeColor((currentColor) =>
          currentColor.toLowerCase() === defaultStrokeForTheme(currentTheme).toLowerCase() ? defaultStrokeForTheme(nextTheme) : currentColor
        );
      }

      return nextTheme;
    });
  }, []);

  const showLocalToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setLocalToasts((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => {
      setLocalToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2500);
  }, []);

  useEffect(() => {
    if (!didLoadInitialBoardRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateBoardMeta({ boardName, classroomId, tags: boardTags });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [boardName, boardTags, classroomId, updateBoardMeta]);

  const serializeObjects = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return [];
    }

    return canvas
      .getObjects()
      .filter(isSerializableObject)
      .map((object) => {
        const objectWithMeta = object as FabricObjectWithMeta;

        if (!objectWithMeta.objectId) {
          objectWithMeta.objectId = crypto.randomUUID();
        }

        return serializeFabricObject(object);
      })
      .filter((object): object is CanvasObjectPayload => Boolean(object));
  }, []);

  const serializeCanvasImage = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return undefined;
    }

    const previousBackground = canvas.backgroundColor;
    canvas.setBackgroundColor("#ffffff", () => undefined);
    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 1,
      enableRetinaScaling: true
    });
    canvas.setBackgroundColor(previousBackground ?? "", () => undefined);
    canvas.requestRenderAll();
    return dataUrl;
  }, []);

  const updateHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.length > 1);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const pushHistory = useCallback(() => {
    if (isApplyingRemoteRef.current) {
      return;
    }

    const snapshot = JSON.stringify(serializeObjects());
    const lastSnapshot = historyRef.current.at(-1);

    if (snapshot !== lastSnapshot) {
      historyRef.current.push(snapshot);
      historyRef.current = historyRef.current.slice(-100);
      redoRef.current = [];
      updateHistoryFlags();
    }
  }, [serializeObjects, updateHistoryFlags]);

  const sendReplaceOperation = useCallback(
    (objects: CanvasObjectPayload[]) => {
      sendOperation({
        type: "replace",
        userId: participant.id,
        boardVersion: 0,
        objects
      });
    },
    [participant.id, sendOperation]
  );

  const loadObjects = useCallback((objects: CanvasObjectPayload[]) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    isApplyingRemoteRef.current = true;
    canvas.getObjects().forEach((object) => canvas.remove(object));

    if (objects.length === 0) {
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      return;
    }

    fabric.util.enlivenObjects(objects.map(normalizeGeneratedTextPayload), (enlivenedObjects: fabric.Object[]) => {
      enlivenedObjects.forEach((object: fabric.Object) => {
        canvas.add(object);
      });
      refreshAttachedConnectors(canvas);
      refreshAttachedObjects(canvas);
      applyCanvasObjectInteractivity(canvas, currentToolRef.current);
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
    }, "fabric");
  }, []);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);

    try {
      await requestAnalysis(serializeObjects(), serializeCanvasImage());
    } finally {
      setIsAnalyzing(false);
    }
  }, [requestAnalysis, serializeCanvasImage, serializeObjects]);

  const runAnalysisRef = useRef(runAnalysis);

  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  const scheduleAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
    }

    analysisTimerRef.current = window.setTimeout(() => {
      void runAnalysisRef.current();
    }, 2500);
  }, []);

  const assignMetadata = useCallback(
    (object: fabric.Object, objectType: string) => {
      const objectWithMeta = object as FabricObjectWithMeta;
      objectWithMeta.objectId = objectWithMeta.objectId ?? crypto.randomUUID();
      objectWithMeta.objectType = objectType;
      objectWithMeta.authorId = participant.id;
      object.set({
        strokeUniform: true,
        selectable: currentToolRef.current === "select" || isPlacementTool(currentToolRef.current)
      });
      return objectWithMeta;
    },
    [participant.id]
  );

  const broadcastObject = useCallback(
    (object: fabric.Object) => {
      const objectWithMeta = object as FabricObjectWithMeta;

      if (!isSerializableObject(object) || !objectWithMeta.objectId) {
        return;
      }

      const payload = serializeFabricObject(object);

      if (!payload) {
        return;
      }

      sendOperation({
        type: "upsert",
        userId: participant.id,
        boardVersion: 0,
        object: payload
      });
    },
    [participant.id, sendOperation]
  );

  const addObjectAndBroadcast = useCallback(
    (object: fabric.Object, objectType: string) => {
      const canvas = fabricRef.current;

      if (!canvas) {
        return;
      }

      assignMetadata(object, objectType);
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      broadcastObject(object);
      pushHistory();
      scheduleAnalysis();
    },
    [assignMetadata, broadcastObject, pushHistory, scheduleAnalysis]
  );

  const createShapeAt = useCallback(
    (tool: DrawingTool, pointer: fabric.Point) => {
      const paint = {
        stroke: strokeColorRef.current,
        fill: fillColorRef.current,
        strokeWidth: strokeWidthRef.current
      };

      if (tool === "text") {
        const text = new fabric.IText("Label", {
          left: pointer.x,
          top: pointer.y,
          fill: paint.stroke,
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 18
        });
        addObjectAndBroadcast(text, "text");
        text.enterEditing();
        text.selectAll();
      }

      if (tool === "sticky") {
        addObjectAndBroadcast(
          new fabric.Textbox("Sticky note", {
            left: pointer.x,
            top: pointer.y,
            width: 160,
            backgroundColor: "#fff3a3",
            fill: "#3f3414",
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: 16,
            padding: 12
          }),
          "sticky"
        );
      }

      if (tool !== "text" && tool !== "sticky") {
        const shape = createDiagramShape(tool, pointer, paint);

        if (shape) {
          addObjectAndBroadcast(shape, tool);
        }
      }

      currentToolRef.current = "select";
      setCurrentTool("select");
    },
    [addObjectAndBroadcast]
  );

  const clearHighlights = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    canvas
      .getObjects()
      .filter((object) => (object as FabricObjectWithMeta).objectType === "analysis-highlight")
      .forEach((object) => canvas.remove(object));
    canvas.requestRenderAll();
  }, []);

  const drawHighlightForObject = useCallback((objectId: string) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const target = objectById(canvas, objectId);

    if (!target) {
      return;
    }

    const bounds = target.getBoundingRect(true, true);
    const highlight = new fabric.Rect({
      left: bounds.left - 6,
      top: bounds.top - 6,
      width: bounds.width + 12,
      height: bounds.height + 12,
      fill: "rgba(245, 158, 11, 0.12)",
      stroke: "#f59e0b",
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true
    }) as FabricObjectWithMeta;

    highlight.objectId = crypto.randomUUID();
    highlight.objectType = "analysis-highlight";
    canvas.add(highlight);
    highlight.bringToFront();
  }, []);

  useEffect(() => {
    if (!canvasReady) {
      return;
    }

    clearHighlights();

    if (!highlightEnabled || !analysis) {
      return;
    }

    const issueObjectIds = analysis.issues.flatMap((issue) => issue.objectIds);
    const componentObjectIds = analysis.components.map((component) => component.objectId).filter(Boolean) as string[];
    const ids = new Set(issueObjectIds.length > 0 ? issueObjectIds : componentObjectIds);

    ids.forEach(drawHighlightForObject);
    fabricRef.current?.requestRenderAll();
  }, [analysis, canvasReady, clearHighlights, drawHighlightForObject, highlightEnabled]);

  useEffect(() => {
    const canvasElement = canvasElementRef.current;
    const host = canvasHostRef.current;

    if (!canvasElement || !host) {
      return;
    }

    const canvas = new fabric.Canvas(canvasElement, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: ""
    });
    fabricRef.current = canvas;
    historyRef.current = [JSON.stringify([])];
    updateHistoryFlags();

    const resizeCanvas = () => {
      const rect = host.getBoundingClientRect();
      canvas.setDimensions({
        width: rect.width,
        height: rect.height
      });
      canvas.calcOffset();
      canvas.requestRenderAll();
      setViewportRevision((revision) => revision + 1);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(host);
    resizeCanvas();

    canvas.freeDrawingBrush.color = strokeColorRef.current;
    canvas.freeDrawingBrush.width = strokeWidthRef.current;

    const updateSelectionMode = () => {
      const tool = currentToolRef.current;
      canvas.isDrawingMode = tool === "pen";
      canvas.selection = tool === "select";
      canvas.defaultCursor = tool === "pan" ? "grab" : "crosshair";
      applyCanvasObjectInteractivity(canvas, tool);
    };

    const handlePathCreated = (event: fabric.IEvent<MouseEvent>) => {
      const path = (event as fabric.IEvent<MouseEvent> & { path?: fabric.Path }).path;

      if (!path) {
        return;
      }

      assignMetadata(path, "stroke");
      broadcastObject(path);
      pushHistory();
      scheduleAnalysis();
    };

    const handleObjectModified = (event: fabric.IEvent<Event>) => {
      if (isApplyingRemoteRef.current || !event.target || !isSerializableObject(event.target)) {
        return;
      }

      const targetWithMeta = assignMetadata(event.target, (event.target as FabricObjectWithMeta).objectType ?? "object");
      updateAttachmentOffsetForObject(canvas, targetWithMeta);
      const attachedObjects = updateAttachedObjectsForObject(canvas, targetWithMeta);
      const connectedLines = targetWithMeta.objectId ? updateConnectedLinesForObject(canvas, targetWithMeta.objectId) : [];
      broadcastObject(event.target);
      attachedObjects.forEach((object) => broadcastObject(object));
      connectedLines.forEach((line) => broadcastObject(line));
      connectedLines.forEach((line) => {
        if (line.objectId) {
          attachedObjectsForObject(canvas, line.objectId).forEach((object) => broadcastObject(object));
        }
      });
      pushHistory();
      scheduleAnalysis();
    };

    const handleObjectTransforming = (event: fabric.IEvent<Event>) => {
      const targetWithMeta = event.target as FabricObjectWithMeta | undefined;
      const objectId = targetWithMeta?.objectId;

      if (!objectId || !targetWithMeta) {
        return;
      }

      updateAttachmentOffsetForObject(canvas, targetWithMeta);
      updateAttachedObjectsForObject(canvas, targetWithMeta);
      updateConnectedLinesForObject(canvas, objectId);
      canvas.requestRenderAll();
    };

    const handleMouseDown = (event: fabric.IEvent<MouseEvent>) => {
      const tool = currentToolRef.current;
      const existingTarget = canvas.findTarget(event.e, false) as FabricObjectWithMeta | undefined;

      if (isPlacementTool(tool) && existingTarget && isSerializableObject(existingTarget)) {
        currentToolRef.current = "select";
        setCurrentTool("select");
        existingTarget.selectable = true;
        existingTarget.evented = true;
        canvas.setActiveObject(existingTarget);
        canvas.requestRenderAll();
        return;
      }

      updateSelectionMode();
      const pointer = canvas.getPointer(event.e);

      if (commentPlacingRef.current) {
        const body = window.prompt("Comment");

        if (body?.trim()) {
          createComment({
            authorId: participant.id,
            authorName: participant.name,
            body: body.trim(),
            anchor: {
              x: pointer.x,
              y: pointer.y,
              width: 160,
              height: 96
            }
          });
        }

        setCommentPlacing(false);
        return;
      }

      if (tool === "pan") {
        isPanningRef.current = true;
        lastPanPointRef.current = {
          x: event.e.clientX,
          y: event.e.clientY
        };
        canvas.defaultCursor = "grabbing";
        return;
      }

      if (tool === "eraser") {
        const target = canvas.findTarget(event.e, false) as FabricObjectWithMeta | undefined;

        if (target && isSerializableObject(target)) {
          const objectId = target.objectId;
          const connectedLines = objectId ? connectedLinesForObject(canvas, objectId) : [];
          const attachedObjects = new Map<string, fabric.Object & FabricObjectWithMeta>();
          const addAttachedObject = (object: fabric.Object & FabricObjectWithMeta) => {
            if (object.objectId) {
              attachedObjects.set(object.objectId, object);
            }
          };

          if (objectId) {
            attachedObjectsForObject(canvas, objectId).forEach(addAttachedObject);
          }

          connectedLines.forEach((line) => {
            if (line.objectId) {
              attachedObjectsForObject(canvas, line.objectId).forEach(addAttachedObject);
            }
          });

          canvas.remove(target);
          attachedObjects.forEach((object) => canvas.remove(object));
          connectedLines.forEach((line) => canvas.remove(line));

          if (objectId) {
            sendOperation({
              type: "delete",
              userId: participant.id,
              boardVersion: 0,
              objectId
            });
          }

          attachedObjects.forEach((object) => {
            if (!object.objectId) {
              return;
            }

            sendOperation({
              type: "delete",
              userId: participant.id,
              boardVersion: 0,
              objectId: object.objectId
            });
          });

          connectedLines.forEach((line) => {
            if (line.objectId) {
              sendOperation({
                type: "delete",
                userId: participant.id,
                boardVersion: 0,
                objectId: line.objectId
              });
            }
          });

          pushHistory();
          scheduleAnalysis();
        }

        return;
      }

      if (isPlacementTool(tool)) {
        createShapeAt(tool, new fabric.Point(pointer.x, pointer.y));
        return;
      }

      if (tool === "connector") {
        const sourceTarget = connectorTargetFromEvent(canvas, event.e);
        const sourceAnchor = sourceTarget ? nearestConnectionAnchor(sourceTarget, new fabric.Point(pointer.x, pointer.y)) : undefined;
        const sourcePoint = sourceTarget && sourceAnchor ? anchorPointForObject(sourceTarget, sourceAnchor) : new fabric.Point(pointer.x, pointer.y);
        const line = new fabric.Line([sourcePoint.x, sourcePoint.y, pointer.x, pointer.y], {
          stroke: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          strokeDashArray: undefined,
          strokeLineCap: "round",
          strokeUniform: true,
          selectable: false,
          evented: false
        });
        assignMetadata(line, "connector");
        const lineWithMeta = line as FabricObjectWithMeta;
        lineWithMeta.sourceObjectId = sourceTarget?.objectId;
        lineWithMeta.sourceAnchor = sourceAnchor;
        activeLineRef.current = line;
        canvas.add(line);
      }
    };

    const handleMouseMove = (event: fabric.IEvent<MouseEvent>) => {
      const pointer = canvas.getPointer(event.e);
      const timestamp = Date.now();

      if (timestamp - lastCursorSentRef.current > 40) {
        const cursor: CursorPayload = {
          userId: participant.id,
          name: participant.name,
          color: participant.color,
          tool: currentToolRef.current,
          x: pointer.x,
          y: pointer.y
        };
        sendCursor(cursor);
        lastCursorSentRef.current = timestamp;
      }

      if (isPanningRef.current) {
        const transform = canvas.viewportTransform;

        if (transform) {
          transform[4] += event.e.clientX - lastPanPointRef.current.x;
          transform[5] += event.e.clientY - lastPanPointRef.current.y;
          canvas.requestRenderAll();
          setViewportRevision((revision) => revision + 1);
        }

        lastPanPointRef.current = {
          x: event.e.clientX,
          y: event.e.clientY
        };
        return;
      }

      const line = activeLineRef.current;

      if (line) {
        attachConnectorEnd(line, connectorTargetFromEvent(canvas, event.e), new fabric.Point(pointer.x, pointer.y));
        line.setCoords();
        canvas.requestRenderAll();
      }
    };

    const handleMouseUp = (event: fabric.IEvent<MouseEvent>) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvas.defaultCursor = "grab";
      }

      const line = activeLineRef.current;

      if (line) {
        const pointer = canvas.getPointer(event.e);
        attachConnectorEnd(line, connectorTargetFromEvent(canvas, event.e), new fabric.Point(pointer.x, pointer.y));
        updateAttachedConnector(canvas, line);
        activeLineRef.current = null;
        const length = Math.hypot((line.x2 ?? 0) - (line.x1 ?? 0), (line.y2 ?? 0) - (line.y1 ?? 0));

        if (length < 8) {
          canvas.remove(line);
        } else {
          broadcastObject(line);
          pushHistory();
          scheduleAnalysis();
        }
      }
    };

    const handleWheel = (event: fabric.IEvent<WheelEvent>) => {
      event.e.preventDefault();
      event.e.stopPropagation();
      let nextZoom = canvas.getZoom() * 0.999 ** event.e.deltaY;
      nextZoom = Math.min(2.4, Math.max(0.35, nextZoom));
      canvas.zoomToPoint(new fabric.Point(event.e.offsetX, event.e.offsetY), nextZoom);
      setZoom(Math.round(nextZoom * 100));
      setViewportRevision((revision) => revision + 1);
    };

    canvas.on("path:created", handlePathCreated);
    canvas.on("object:moving", handleObjectTransforming);
    canvas.on("object:scaling", handleObjectTransforming);
    canvas.on("object:rotating", handleObjectTransforming);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);
    canvas.on("mouse:wheel", handleWheel);

    setCanvasReady(true);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      fabricRef.current = null;
      setCanvasReady(false);
    };
  }, [
    assignMetadata,
    broadcastObject,
    createShapeAt,
    createComment,
    participant.color,
    participant.id,
    participant.name,
    pushHistory,
    scheduleAnalysis,
    sendCursor,
    sendOperation,
    updateHistoryFlags
  ]);

  useEffect(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    canvas.isDrawingMode = currentTool === "pen";
    canvas.selection = currentTool === "select";
    canvas.defaultCursor = currentTool === "pan" ? "grab" : currentTool === "select" ? "default" : "crosshair";

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = strokeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    }

    applyCanvasObjectInteractivity(canvas, currentTool);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [currentTool, strokeColor, strokeWidth]);

  useEffect(() => {
    if (!canvasReady || !boardState || didLoadInitialBoardRef.current) {
      return;
    }

    setBoardName(boardState.boardName === "Untitled board" ? "Collaborative AI Whiteboard" : boardState.boardName);
    setBoardTags(boardState.tags ?? []);
    loadObjects(boardState.objects);
    historyRef.current = [JSON.stringify(boardState.objects)];
    redoRef.current = [];
    updateHistoryFlags();
    didLoadInitialBoardRef.current = true;
  }, [boardState, canvasReady, loadObjects, updateHistoryFlags]);

  useEffect(() => {
    if (!boardState?.boardName || boardState.boardName === "Untitled board") {
      return;
    }

    setBoardName((current) => (current === boardState.boardName ? current : boardState.boardName));
  }, [boardState?.boardName]);

  useEffect(() => {
    setBoardTags((current) => {
      const incoming = boardState?.tags ?? [];
      return JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming;
    });
  }, [boardState?.tags]);

  useEffect(() => {
    const canvas = fabricRef.current;

    if (!canvasReady || !canvas || !remoteOperation) {
      return;
    }

    if (remoteOperation.userId === participant.id) {
      return;
    }

    isApplyingRemoteRef.current = true;

    if (remoteOperation.type === "replace") {
      loadObjects(remoteOperation.objects);
      scheduleAnalysis();
      return;
    }

    if (remoteOperation.type === "clear") {
      canvas.getObjects().filter(isSerializableObject).forEach((object) => canvas.remove(object));
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
      return;
    }

    if (remoteOperation.type === "delete") {
      const target = objectById(canvas, remoteOperation.objectId);

      if (target) {
        canvas.remove(target);
      }

      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
      return;
    }

    const existing = objectById(canvas, remoteOperation.object.objectId);

    if (existing) {
      canvas.remove(existing);
    }

    fabric.util.enlivenObjects([normalizeGeneratedTextPayload(remoteOperation.object)], ([object]: fabric.Object[]) => {
      canvas.add(object);
      refreshAttachedConnectors(canvas);
      refreshAttachedObjects(canvas);
      applyCanvasObjectInteractivity(canvas, currentToolRef.current);
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
    }, "fabric");
  }, [canvasReady, loadObjects, participant.id, remoteOperation, scheduleAnalysis]);

  const undo = useCallback(() => {
    if (historyRef.current.length <= 1) {
      return;
    }

    const currentSnapshot = historyRef.current.pop();
    const previousSnapshot = historyRef.current.at(-1);

    if (!currentSnapshot || !previousSnapshot) {
      return;
    }

    redoRef.current.push(currentSnapshot);
    const objects = JSON.parse(previousSnapshot) as CanvasObjectPayload[];
    loadObjects(objects);
    sendReplaceOperation(objects);
    updateHistoryFlags();
    scheduleAnalysis();
  }, [loadObjects, scheduleAnalysis, sendReplaceOperation, updateHistoryFlags]);

  const redo = useCallback(() => {
    const nextSnapshot = redoRef.current.pop();

    if (!nextSnapshot) {
      return;
    }

    historyRef.current.push(nextSnapshot);
    const objects = JSON.parse(nextSnapshot) as CanvasObjectPayload[];
    loadObjects(objects);
    sendReplaceOperation(objects);
    updateHistoryFlags();
    scheduleAnalysis();
  }, [loadObjects, scheduleAnalysis, sendReplaceOperation, updateHistoryFlags]);

  const groupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();

    if (!canvas || !(active instanceof fabric.ActiveSelection)) {
      showLocalToast("Select multiple objects first");
      return;
    }

    const group = active.toGroup() as FabricObjectWithMeta;
    group.objectId = group.objectId ?? crypto.randomUUID();
    group.objectType = "group";
    group.authorId = participant.id;
    canvas.requestRenderAll();
    broadcastObject(group);
    pushHistory();
    scheduleAnalysis();
  }, [broadcastObject, participant.id, pushHistory, scheduleAnalysis, showLocalToast]);

  const ungroupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject() as FabricObjectWithMeta | undefined;

    if (!canvas || !active || active.type !== "group") {
      showLocalToast("Select a group first");
      return;
    }

    const activeSelection = (active as unknown as fabric.Group).toActiveSelection();
    activeSelection.getObjects().forEach((object) => {
      assignMetadata(object, (object as FabricObjectWithMeta).objectType ?? "object");
      broadcastObject(object);
    });
    canvas.requestRenderAll();
    pushHistory();
    scheduleAnalysis();
  }, [assignMetadata, broadcastObject, pushHistory, scheduleAnalysis, showLocalToast]);

  const exportPng = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 2,
      enableRetinaScaling: true
    });
    downloadBlob(new Blob([dataUrlBytes(dataUrl)], { type: "image/png" }), `${fileSlug(boardName)}.png`);
  }, [boardName]);

  const exportSvg = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    downloadBlob(new Blob([canvas.toSVG()], { type: "image/svg+xml" }), `${fileSlug(boardName)}.svg`);
  }, [boardName]);

  const exportPdf = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const multiplier = 2;
    const dataUrl = canvas.toDataURL({
      format: "jpeg",
      quality: 0.92,
      multiplier,
      enableRetinaScaling: true
    });

    downloadBlob(imagePdfBlob(dataUrl, canvas.getWidth() * multiplier, canvas.getHeight() * multiplier), `${fileSlug(boardName)}.pdf`);
  }, [boardName]);

  const openDashboard = useCallback(() => {
    const params = new URLSearchParams();
    params.set("mode", "instructor");

    if (classroomId) {
      params.set("classroom", classroomId);
    }

    window.location.href = `${window.location.pathname}?${params.toString()}`;
  }, [classroomId]);

  const shareBoard = useCallback(() => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => showLocalToast("Share link copied"))
      .catch(() => showLocalToast("Copy failed; use the address bar link"));
  }, [showLocalToast]);

  const updateTags = useCallback(
    (tags: string[]) => {
      const normalized = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
      setBoardTags(normalized);
      updateBoardMeta({ tags: normalized });
    },
    [updateBoardMeta]
  );

  const duplicateBoard = useCallback(async () => {
    const response = await fetchWithAuth(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      showLocalToast("Duplicate failed");
      return;
    }

    const duplicated = (await response.json()) as { roomId: string; classroomId?: string };
    const params = new URLSearchParams();
    params.set("room", duplicated.roomId);
    if (duplicated.classroomId) {
      params.set("classroom", duplicated.classroomId);
    }
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  }, [roomId, showLocalToast]);

  const shareSnapshotToSlack = useCallback(async () => {
    const imageDataUrl = serializeCanvasImage();

    if (!imageDataUrl) {
      return;
    }

    const response = await fetchWithAuth(`${API_URL}/api/integrations/slack/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ roomId, imageDataUrl })
    });

    showLocalToast(response.ok ? "Slack snapshot shared" : "Slack sharing is not configured");
  }, [roomId, serializeCanvasImage, showLocalToast]);

  const setZoomLevel = useCallback((nextZoomPercent: number) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const nextZoom = Math.min(240, Math.max(35, nextZoomPercent)) / 100;
    canvas.zoomToPoint(new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2), nextZoom);
    setZoom(Math.round(nextZoom * 100));
    setViewportRevision((revision) => revision + 1);
  }, []);

  const cloneTemplateObjects = useCallback(
    (template: BoardTemplate) =>
      template.objects.map((object) => ({
        ...(JSON.parse(JSON.stringify(object)) as CanvasObjectPayload),
        objectId: `${template.id}-${crypto.randomUUID()}`,
        authorId: participant.id
      })),
    [participant.id]
  );

  const applyTemplate = useCallback(
    (template: BoardTemplate) => {
      const objects = cloneTemplateObjects(template);
      loadObjects(objects);
      sendReplaceOperation(objects);
      historyRef.current.push(JSON.stringify(objects));
      historyRef.current = historyRef.current.slice(-100);
      redoRef.current = [];
      updateHistoryFlags();
      setTemplatesOpen(false);
      scheduleAnalysis();
      showLocalToast(`${template.name} loaded`);
    },
    [cloneTemplateObjects, loadObjects, scheduleAnalysis, sendReplaceOperation, showLocalToast, updateHistoryFlags]
  );

  const restoreVersion = useCallback(
    async (snapshot: BoardVersionSnapshot) => {
      const response = await fetchWithAuth(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/restore/${encodeURIComponent(snapshot.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: participant.id })
      });

      if (!response.ok) {
        showLocalToast("Version restore failed");
        return;
      }

      const operation = (await response.json()) as CanvasOperation;

      if (operation.type === "replace") {
        loadObjects(operation.objects);
        historyRef.current.push(JSON.stringify(operation.objects));
        historyRef.current = historyRef.current.slice(-100);
        redoRef.current = [];
        updateHistoryFlags();
      }

      setHistoryOpen(false);
      scheduleAnalysis();
      showLocalToast(`Restored ${snapshot.label}`);
    },
    [loadObjects, participant.id, roomId, scheduleAnalysis, showLocalToast, updateHistoryFlags]
  );

  const toggleHelpRequested = useCallback(() => {
    const nextValue = !(boardState?.helpRequested ?? false);
    updateBoardMeta({ helpRequested: nextValue });
    showLocalToast(nextValue ? "Instructor help requested" : "Help request cleared");
  }, [boardState?.helpRequested, showLocalToast, updateBoardMeta]);

  const resolveComment = useCallback(
    (commentId: string) => {
      updateComment(commentId, { resolved: true });
      showLocalToast("Comment resolved");
    },
    [showLocalToast, updateComment]
  );

  const acceptSuggestion = useCallback(
    (issue: AnalysisIssue) => {
      const canvas = fabricRef.current;

      if (!canvas) {
        return;
      }

      const target = issue.objectIds[0] ? objectById(canvas, issue.objectIds[0]) : undefined;
      const bounds = target?.getBoundingRect(true, true);
      const note = new fabric.Textbox(`AI note: ${issue.suggestion}`, {
        left: (bounds?.left ?? 80) + (bounds?.width ?? 80) + 18,
        top: bounds?.top ?? 80,
        width: 220,
        backgroundColor: "#fff7c2",
        fill: "#3d3215",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 14,
        padding: 10
      });

      addObjectAndBroadcast(note, "sticky");
      setDismissedIssues((current) => new Set([...current, issue.id]));
      showLocalToast("Suggestion annotated on canvas");
    },
    [addObjectAndBroadcast, showLocalToast]
  );

  const dismissIssue = useCallback((issueId: string) => {
    setDismissedIssues((current) => new Set([...current, issueId]));
  }, []);

  const handleChat = useCallback(
    (message: string) => {
      sendChat(message, serializeObjects(), serializeCanvasImage());
    },
    [sendChat, serializeCanvasImage, serializeObjects]
  );

  const generateDiagram = useCallback(
    async (prompt: string) => {
      if (!canvasReady) {
        showLocalToast("Canvas is still loading");
        return;
      }

      setIsGeneratingDiagram(true);

      try {
        const response = await fetchWithAuth(`${API_URL}/api/ai/generate-diagram`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            roomId,
            prompt,
            userId: participant.id
          })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
          showLocalToast(typeof payload?.error === "string" ? payload.error : "Diagram generation failed");
          return;
        }

        const generated = (await response.json()) as GeneratedDiagram;
        const objects = generated.objects.map((object) => ({
          ...object,
          authorId: typeof object.authorId === "string" ? object.authorId : participant.id
        }));

        loadObjects(objects);
        sendReplaceOperation(objects);
        historyRef.current.push(JSON.stringify(objects));
        historyRef.current = historyRef.current.slice(-100);
        redoRef.current = [];
        updateHistoryFlags();
        setBoardName(generated.title || "Generated Diagram");
        scheduleAnalysis();
        showLocalToast(
          generated.provider === "mock" && generated.warnings.length > 0
            ? "AI provider unavailable; local diagram built"
            : `Built ${generated.diagramType}`
        );
      } catch (error) {
        showLocalToast(error instanceof Error ? error.message : "Diagram generation failed");
      } finally {
        setIsGeneratingDiagram(false);
      }
    },
    [canvasReady, loadObjects, participant.id, roomId, scheduleAnalysis, sendReplaceOperation, showLocalToast, updateHistoryFlags]
  );

  const projectedCursors = useMemo(() => {
    const canvas = fabricRef.current;
    const transform = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];

    return Object.values(remoteCursors).map((cursor) => ({
      ...cursor,
      screenX: cursor.x * transform[0] + transform[4],
      screenY: cursor.y * transform[3] + transform[5]
    }));
  }, [remoteCursors, viewportRevision]);

  const projectedComments = useMemo(() => {
    const canvas = fabricRef.current;
    const transform = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];

    return comments
      .filter((comment) => !comment.resolved)
      .map((comment) => ({
        ...comment,
        screenX: comment.anchor.x * transform[0] + transform[4],
        screenY: comment.anchor.y * transform[3] + transform[5]
      }));
  }, [comments, viewportRevision]);

  const allToasts = [...toasts, ...localToasts];
  const canvasObjectCount = fabricRef.current?.getObjects().filter(isSerializableObject).length ?? boardState?.objects.length ?? 0;
  const canvasSummary = `${boardName}. ${canvasObjectCount} canvas objects. ${
    analysis ? `${analysis.diagramType} with ${analysis.confidence}% AI confidence. ${analysis.summary}` : "No AI analysis has run yet."
  }`;

  return (
    <div className={`app-shell theme-${themeMode}`}>
      <TopBar
        boardName={boardName}
        classroomId={classroomId}
        connectionStatus={connectionStatus}
        helpRequested={boardState?.helpRequested ?? false}
        tags={boardTags}
        themeMode={themeMode}
        onBoardNameChange={setBoardName}
        onDashboardOpen={openDashboard}
        onDuplicate={duplicateBoard}
        onExportPng={exportPng}
        onExportPdf={exportPdf}
        onExportSvg={exportSvg}
        onHelpToggle={toggleHelpRequested}
        onShare={shareBoard}
        onShareSlack={shareSnapshotToSlack}
        onTagsChange={updateTags}
        onThemeToggle={toggleTheme}
        participants={participants}
      />

      <main className="workspace">
        <Toolbar
          canRedo={canRedo}
          canUndo={canUndo}
          currentTool={currentTool}
          fillColor={fillColor}
          gridEnabled={gridEnabled}
          onFillColorChange={setFillColor}
          onGridToggle={() => setGridEnabled((enabled) => !enabled)}
          onGroup={groupSelection}
          onRedo={redo}
          onStrokeColorChange={setStrokeColor}
          onStrokeWidthChange={setStrokeWidth}
          onToolChange={setCurrentTool}
          onUndo={undo}
          onUngroup={ungroupSelection}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
        />

        <section className={gridEnabled ? "canvas-stage grid-enabled" : "canvas-stage"} ref={canvasHostRef}>
          <p className="visually-hidden" id="canvas-accessibility-summary">
            {canvasSummary}
          </p>
          <canvas aria-describedby="canvas-accessibility-summary" aria-label="Collaborative whiteboard canvas" ref={canvasElementRef} role="img" />
          <div className="phase2-controls">
            <button className="text-button" onClick={() => setTemplatesOpen(true)} type="button">
              <LayoutTemplate size={16} />
              Templates
            </button>
            <button className="text-button" onClick={() => setHistoryOpen(true)} type="button">
              <History size={16} />
              History
            </button>
            <button className="text-button" onClick={() => setCommentsOpen(true)} type="button">
              <MessageSquare size={16} />
              Comments
            </button>
            <button className="text-button" onClick={() => setQualityOpen(true)} type="button">
              <ClipboardCheck size={16} />
              Quality
            </button>
          </div>
          <div className="comment-layer">
            {projectedComments.map((comment) => (
              <button
                className="comment-marker"
                key={comment.id}
                onClick={() => setCommentsOpen(true)}
                style={{
                  left: `${comment.screenX}px`,
                  top: `${comment.screenY}px`
                }}
                title={comment.body}
                type="button"
              >
                <MessageSquare size={15} />
              </button>
            ))}
          </div>
          <div className="cursor-layer" aria-hidden="true">
            {projectedCursors.map((cursor) => (
              <div
                className="remote-cursor"
                key={cursor.userId}
                style={{
                  left: `${cursor.screenX}px`,
                  top: `${cursor.screenY}px`,
                  color: cursor.color
                }}
              >
                <span className="cursor-arrow" />
                <span className="cursor-label" style={{ backgroundColor: cursor.color }}>
                  {cursor.name} - {cursor.tool}
                </span>
              </div>
            ))}
          </div>

          <div className="bottom-bar">
            <button className="icon-button" onClick={() => setZoomLevel(zoom - 10)} title="Zoom out" type="button">
              <Minus size={16} />
            </button>
            <span>{zoom}%</span>
            <button className="icon-button" onClick={() => setZoomLevel(zoom + 10)} title="Zoom in" type="button">
              <Plus size={16} />
            </button>
          </div>
          <TemplateLibrary open={templatesOpen} templates={boardTemplates} onApply={applyTemplate} onClose={() => setTemplatesOpen(false)} />
          <VersionHistory
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreVersion}
            open={historyOpen}
            versions={boardState?.versions ?? []}
          />
          <CommentsPanel
            comments={comments}
            onClose={() => setCommentsOpen(false)}
            onResolve={resolveComment}
            onStartPlacing={() => {
              setCommentPlacing(true);
              setCommentsOpen(false);
            }}
            open={commentsOpen}
            placing={commentPlacing}
          />
          <QualityReportPanel onClose={() => setQualityOpen(false)} open={qualityOpen} roomId={roomId} />
        </section>

        <AiPanel
          analysis={analysis}
          chat={chat}
          dismissedIssues={dismissedIssues}
          highlightEnabled={highlightEnabled}
          isAnalyzing={isAnalyzing}
          isGeneratingDiagram={isGeneratingDiagram}
          onAcceptSuggestion={acceptSuggestion}
          onAnalyze={() => void runAnalysis()}
          onChat={handleChat}
          onGenerateDiagram={generateDiagram}
          onDismissIssue={dismissIssue}
          onToggleHighlight={() => setHighlightEnabled((enabled) => !enabled)}
        />
      </main>

      <div className="toast-stack" aria-live="polite">
        {allToasts.map((toast) => (
          <div className="toast" key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return isInstructorMode() ? <InstructorDashboard /> : <BoardApp />;
}
