import type { BoardSnapshot, CanvasObjectPayload, QualityReport, SessionDebrief, SessionSummary } from "../../shared/src/types";

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfEscape(value: string) {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function objectKind(object: CanvasObjectPayload) {
  return asString(object.objectType) || asString(object.type) || "object";
}

function objectText(object: CanvasObjectPayload) {
  return asString(object.text);
}

function color(value: unknown, fallback: string) {
  const candidate = asString(value);
  return candidate && candidate !== "transparent" ? candidate : fallback;
}

function objectBounds(object: CanvasObjectPayload) {
  const left = asNumber(object.left);
  const top = asNumber(object.top);
  const width = Math.max(12, asNumber(object.width, asNumber(object.rx, 40) * 2 || 80) * asNumber(object.scaleX, 1));
  const height = Math.max(12, asNumber(object.height, asNumber(object.ry, 30) * 2 || 50) * asNumber(object.scaleY, 1));
  return { left, top, width, height };
}

function drawingBounds(object: CanvasObjectPayload) {
  const kind = objectKind(object);

  if (kind === "connector" || kind === "line") {
    const x1 = asNumber(object.x1);
    const y1 = asNumber(object.y1);
    const x2 = asNumber(object.x2);
    const y2 = asNumber(object.y2);
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.max(12, Math.abs(x2 - x1)),
      height: Math.max(12, Math.abs(y2 - y1))
    };
  }

  return objectBounds(object);
}

function svgForObject(object: CanvasObjectPayload) {
  const kind = objectKind(object);
  const bounds = objectBounds(object);
  const stroke = color(object.stroke, "#1f2937");
  const fill = color(object.fill, kind === "text" || kind === "textbox" || kind === "i-text" ? "#1f2937" : "#ffffff");
  const strokeWidth = Math.max(1, asNumber(object.strokeWidth, 2));

  if (kind === "rectangle" || kind === "rect" || kind === "sticky") {
    return `<rect x="${bounds.left}" y="${bounds.top}" width="${bounds.width}" height="${bounds.height}" rx="6" fill="${xmlEscape(
      fill
    )}" stroke="${xmlEscape(stroke)}" stroke-width="${strokeWidth}" />`;
  }

  if (kind === "ellipse" || kind === "circle") {
    return `<ellipse cx="${bounds.left + bounds.width / 2}" cy="${bounds.top + bounds.height / 2}" rx="${bounds.width / 2}" ry="${
      bounds.height / 2
    }" fill="${xmlEscape(fill)}" stroke="${xmlEscape(stroke)}" stroke-width="${strokeWidth}" />`;
  }

  if (kind === "diamond" || kind === "polygon") {
    const points = [
      `${bounds.left + bounds.width / 2},${bounds.top}`,
      `${bounds.left + bounds.width},${bounds.top + bounds.height / 2}`,
      `${bounds.left + bounds.width / 2},${bounds.top + bounds.height}`,
      `${bounds.left},${bounds.top + bounds.height / 2}`
    ].join(" ");
    return `<polygon points="${points}" fill="${xmlEscape(fill)}" stroke="${xmlEscape(stroke)}" stroke-width="${strokeWidth}" />`;
  }

  if (kind === "connector" || kind === "line") {
    return `<line x1="${asNumber(object.x1)}" y1="${asNumber(object.y1)}" x2="${asNumber(object.x2)}" y2="${asNumber(
      object.y2
    )}" stroke="${xmlEscape(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
  }

  if (objectText(object)) {
    return `<text x="${bounds.left}" y="${bounds.top + 18}" fill="${xmlEscape(fill)}" font-family="Inter, Arial, sans-serif" font-size="${asNumber(
      object.fontSize,
      16
    )}">${xmlEscape(objectText(object))}</text>`;
  }

  return `<rect x="${bounds.left}" y="${bounds.top}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#94a3b8" stroke-dasharray="4 4" />`;
}

export function boardToSvg(board: BoardSnapshot) {
  const maxRight = Math.max(960, ...board.objects.map((object) => objectBounds(object).left + objectBounds(object).width + 80));
  const maxBottom = Math.max(640, ...board.objects.map((object) => objectBounds(object).top + objectBounds(object).height + 80));
  const objects = board.objects.map(svgForObject).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(maxRight)}" height="${Math.ceil(maxBottom)}" viewBox="0 0 ${Math.ceil(
    maxRight
  )} ${Math.ceil(maxBottom)}" role="img" aria-label="${xmlEscape(board.boardName)}">\n  <rect width="100%" height="100%" fill="#fbfbf8" />\n  ${objects}\n</svg>\n`;
}

function pdfDocument(contentLines: string[]) {
  const stream = `${contentLines.join("\n")}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects
    .map((object) => {
      xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
      offset += Buffer.byteLength(object, "utf8");
      return object;
    })
    .join("");
  const xrefOffset = offset;
  const trailer = `xref\n0 ${objects.length + 1}\n${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(`%PDF-1.4\n${body}${trailer}`, "utf8");
}

function parsePdfColor(value: unknown, fallback: string): [number, number, number] {
  const candidate = color(value, fallback).trim();
  const shortHex = candidate.match(/^#([0-9a-f]{3})$/i);
  const longHex = candidate.match(/^#([0-9a-f]{6})$/i);
  const rgb = candidate.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i);

  if (shortHex) {
    return shortHex[1].split("").map((part) => parseInt(`${part}${part}`, 16) / 255) as [number, number, number];
  }

  if (longHex) {
    return [0, 2, 4].map((index) => parseInt(longHex[1].slice(index, index + 2), 16) / 255) as [number, number, number];
  }

  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }

  return parsePdfColor(fallback, "#1f2937");
}

function colorCommand(value: unknown, fallback: string, operator: "rg" | "RG") {
  return `${parsePdfColor(value, fallback)
    .map((channel) => channel.toFixed(3))
    .join(" ")} ${operator}`;
}

function textCommand(text: string, x: number, y: number, size = 11, fill = "#1f2937") {
  return ["BT", colorCommand(fill, "#1f2937", "rg"), `/F1 ${size.toFixed(1)} Tf`, `${x.toFixed(2)} ${y.toFixed(2)} Td`, `(${pdfEscape(text)}) Tj`, "ET"].join("\n");
}

function wrappedText(text: string, maxLength: number, maxLines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function boardPdfBounds(board: BoardSnapshot) {
  const bounds = board.objects.map(drawingBounds);
  const minX = Math.min(0, ...bounds.map((bound) => bound.left)) - 24;
  const minY = Math.min(0, ...bounds.map((bound) => bound.top)) - 24;
  const maxX = Math.max(960, ...bounds.map((bound) => bound.left + bound.width)) + 24;
  const maxY = Math.max(640, ...bounds.map((bound) => bound.top + bound.height)) + 24;
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function pdfForObject(
  object: CanvasObjectPayload,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  scale: number
) {
  const kind = objectKind(object);
  const bounds = objectBounds(object);
  const strokeWidth = Math.max(0.6, asNumber(object.strokeWidth, 2) * scale);
  const stroke = colorCommand(object.stroke, "#1f2937", "RG");
  const fill = colorCommand(object.fill, kind === "text" || kind === "textbox" || kind === "i-text" ? "#1f2937" : "#ffffff", "rg");

  if (kind === "connector" || kind === "line") {
    return ["q", stroke, `${strokeWidth.toFixed(2)} w`, `${mapX(asNumber(object.x1)).toFixed(2)} ${mapY(asNumber(object.y1)).toFixed(2)} m`, `${mapX(asNumber(object.x2)).toFixed(2)} ${mapY(asNumber(object.y2)).toFixed(2)} l`, "S", "Q"].join("\n");
  }

  if (objectText(object)) {
    const x = mapX(bounds.left);
    const y = mapY(bounds.top + Math.min(bounds.height, asNumber(object.fontSize, 16) * 1.2));
    const size = Math.max(6, Math.min(14, asNumber(object.fontSize, 16) * scale));
    return textCommand(objectText(object).slice(0, 90), x, y, size, color(object.fill ?? object.stroke, "#1f2937"));
  }

  const x = mapX(bounds.left);
  const y = mapY(bounds.top + bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;

  if (kind === "ellipse" || kind === "circle") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const k = 0.5522847498;
    return [
      "q",
      fill,
      stroke,
      `${strokeWidth.toFixed(2)} w`,
      `${(cx + rx).toFixed(2)} ${cy.toFixed(2)} m`,
      `${(cx + rx).toFixed(2)} ${(cy + ry * k).toFixed(2)} ${(cx + rx * k).toFixed(2)} ${(cy + ry).toFixed(2)} ${cx.toFixed(2)} ${(cy + ry).toFixed(2)} c`,
      `${(cx - rx * k).toFixed(2)} ${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)} ${(cy + ry * k).toFixed(2)} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} c`,
      `${(cx - rx).toFixed(2)} ${(cy - ry * k).toFixed(2)} ${(cx - rx * k).toFixed(2)} ${(cy - ry).toFixed(2)} ${cx.toFixed(2)} ${(cy - ry).toFixed(2)} c`,
      `${(cx + rx * k).toFixed(2)} ${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)} ${(cy - ry * k).toFixed(2)} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} c`,
      "B",
      "Q"
    ].join("\n");
  }

  if (kind === "diamond" || kind === "polygon") {
    return [
      "q",
      fill,
      stroke,
      `${strokeWidth.toFixed(2)} w`,
      `${(x + width / 2).toFixed(2)} ${(y + height).toFixed(2)} m`,
      `${(x + width).toFixed(2)} ${(y + height / 2).toFixed(2)} l`,
      `${(x + width / 2).toFixed(2)} ${y.toFixed(2)} l`,
      `${x.toFixed(2)} ${(y + height / 2).toFixed(2)} l`,
      "h",
      "B",
      "Q"
    ].join("\n");
  }

  return ["q", fill, stroke, `${strokeWidth.toFixed(2)} w`, `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`, "B", "Q"].join("\n");
}

export function boardToPdf(board: BoardSnapshot, report: QualityReport) {
  const pageWidth = 612;
  const pageHeight = 842;
  const boardBox = { x: 40, y: 290, width: 532, height: 430 };
  const bounds = boardPdfBounds(board);
  const scale = Math.min(boardBox.width / bounds.width, boardBox.height / bounds.height);
  const renderedWidth = bounds.width * scale;
  const renderedHeight = bounds.height * scale;
  const offsetX = boardBox.x + (boardBox.width - renderedWidth) / 2;
  const offsetY = boardBox.y + (boardBox.height - renderedHeight) / 2;
  const mapX = (x: number) => offsetX + (x - bounds.minX) * scale;
  const mapY = (y: number) => offsetY + renderedHeight - (y - bounds.minY) * scale;
  const analysisSummary = board.analyses.at(-1)?.summary ?? "No AI analysis yet.";
  const content = [
    "q",
    "1 1 1 rg",
    `0 0 ${pageWidth} ${pageHeight} re`,
    "f",
    "Q",
    textCommand("Daedalus Board Export", 40, 805, 18, "#17212b"),
    textCommand(board.boardName, 40, 782, 12, "#176b87"),
    textCommand(`Room: ${board.roomId} | Updated: ${board.updatedAt}`, 40, 764, 9, "#53616d"),
    textCommand(`Objects: ${board.objects.length} | Quality: ${report.grade} (${report.score}) | Diagram: ${report.diagramType}`, 40, 748, 9, "#53616d"),
    "q",
    "0.984 0.984 0.973 rg",
    "0.859 0.894 0.922 RG",
    "1 w",
    `${boardBox.x} ${boardBox.y} ${boardBox.width} ${boardBox.height} re`,
    "B",
    "Q",
    ...board.objects.map((object) => pdfForObject(object, mapX, mapY, scale)),
    textCommand("Latest Analysis", 40, 250, 13, "#17212b"),
    ...wrappedText(analysisSummary, 88, 4).map((line, index) => textCommand(line, 40, 231 - index * 15, 10, "#53616d")),
    textCommand("Object Index", 40, 155, 13, "#17212b"),
    ...board.objects
      .slice(0, 10)
      .map((object, index) => textCommand(`${index + 1}. ${objectKind(object)} ${objectText(object)}`.trim(), 40, 136 - index * 13, 9, "#53616d"))
  ];

  return pdfDocument(content);
}

export function sessionPackage(input: {
  summary: SessionSummary;
  debrief: SessionDebrief;
  boards: Array<{ board: BoardSnapshot; qualityReport: QualityReport }>;
}) {
  return {
    exportedAt: new Date().toISOString(),
    format: "daedalus-session-package-v1",
    ...input
  };
}
