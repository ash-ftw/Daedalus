import { useMemo, useState } from "react";
import {
  Battery,
  Box,
  ChevronDown,
  Circle,
  CircleDot,
  Cloud,
  Component,
  Database,
  Diamond,
  DiamondPlus,
  Disc,
  Disc3,
  Eraser,
  FileText,
  Folder,
  GitFork,
  Grid2X2,
  Group,
  Hand,
  Hexagon,
  Lightbulb,
  MousePointer2,
  MoveRight,
  Package,
  Pencil,
  Plus,
  Redo2,
  Rows3,
  Search,
  Signal,
  Square,
  SquareStack,
  Star,
  StickyNote,
  Table,
  TableProperties,
  ToggleRight,
  Triangle,
  Type,
  Undo2,
  Ungroup,
  User
} from "lucide-react";
import type { DrawingTool } from "../../../shared/src/types";

interface ToolbarProps {
  currentTool: DrawingTool;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  gridEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onGridToggle: () => void;
  onGroup: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onUngroup: () => void;
}

type ToolDefinition = { tool: DrawingTool; label: string; icon: typeof MousePointer2 };
type ToolSection = { title: string; tools: ToolDefinition[] };

const quickTools: ToolDefinition[] = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "pan", label: "Pan", icon: Hand },
  { tool: "pen", label: "Pen", icon: Pencil },
  { tool: "eraser", label: "Eraser", icon: Eraser },
  { tool: "connector", label: "Connector", icon: MoveRight },
  { tool: "text", label: "Text", icon: Type }
];

const shapeSections: ToolSection[] = [
  {
    title: "General",
    tools: [
      { tool: "rectangle", label: "Rectangle", icon: Square },
      { tool: "rounded-rectangle", label: "Rounded rectangle", icon: Square },
      { tool: "square", label: "Square", icon: Square },
      { tool: "ellipse", label: "Ellipse", icon: Circle },
      { tool: "diamond", label: "Diamond", icon: Diamond },
      { tool: "triangle", label: "Triangle", icon: Triangle },
      { tool: "pentagon", label: "Pentagon", icon: Hexagon },
      { tool: "octagon", label: "Octagon", icon: Hexagon },
      { tool: "plus-shape", label: "Plus", icon: Plus },
      { tool: "cross", label: "Cross", icon: Plus },
      { tool: "star", label: "Star", icon: Star },
      { tool: "callout", label: "Callout", icon: StickyNote },
      { tool: "text", label: "Text", icon: Type },
      { tool: "sticky", label: "Sticky note", icon: StickyNote },
      { tool: "cloud", label: "Cloud", icon: Cloud },
      { tool: "cube", label: "Cube", icon: Box },
      { tool: "folder", label: "Folder", icon: Folder },
      { tool: "table", label: "Table", icon: Table },
      { tool: "note", label: "Note", icon: FileText },
      { tool: "database", label: "Database", icon: Database },
      { tool: "document", label: "Document", icon: FileText },
      { tool: "double-document", label: "Double document", icon: FileText },
      { tool: "card", label: "Card", icon: TableProperties },
      { tool: "tape", label: "Tape", icon: Disc3 }
    ]
  },
  {
    title: "Flowchart",
    tools: [
      { tool: "terminator", label: "Terminator", icon: CircleDot },
      { tool: "rectangle", label: "Process", icon: Square },
      { tool: "diamond", label: "Decision", icon: Diamond },
      { tool: "predefined-process", label: "Predefined process", icon: SquareStack },
      { tool: "internal-storage", label: "Internal storage", icon: Table },
      { tool: "parallelogram", label: "Input/output", icon: Box },
      { tool: "manual-input", label: "Manual input", icon: TableProperties },
      { tool: "document", label: "Document", icon: FileText },
      { tool: "stored-data", label: "Stored data", icon: Database },
      { tool: "hexagon", label: "Preparation", icon: Hexagon },
      { tool: "trapezoid", label: "Manual operation", icon: Triangle },
      { tool: "delay", label: "Delay", icon: Circle },
      { tool: "display", label: "Display", icon: TableProperties },
      { tool: "off-page-connector", label: "Off-page connector", icon: Hexagon },
      { tool: "sort", label: "Sort", icon: Triangle },
      { tool: "merge", label: "Merge", icon: Triangle },
      { tool: "collate", label: "Collate", icon: Triangle },
      { tool: "summing-junction", label: "Summing junction", icon: Plus },
      { tool: "or-junction", label: "Or junction", icon: Circle },
      { tool: "database", label: "Data store", icon: Database }
    ]
  },
  {
    title: "Entity Relation",
    tools: [
      { tool: "er-entity", label: "Entity", icon: TableProperties },
      { tool: "weak-entity", label: "Weak entity", icon: SquareStack },
      { tool: "associative-entity", label: "Associative entity", icon: DiamondPlus },
      { tool: "er-attribute", label: "Attribute", icon: Circle },
      { tool: "key-attribute", label: "Key attribute", icon: CircleDot },
      { tool: "derived-attribute", label: "Derived attribute", icon: Disc },
      { tool: "multivalue-attribute", label: "Multivalued attribute", icon: Disc3 },
      { tool: "er-relationship", label: "Relationship", icon: Diamond },
      { tool: "identifying-relationship", label: "Identifying relationship", icon: DiamondPlus }
    ]
  },
  {
    title: "UML",
    tools: [
      { tool: "uml-class", label: "Class", icon: Rows3 },
      { tool: "uml-interface", label: "Interface", icon: Circle },
      { tool: "uml-note", label: "UML note", icon: FileText },
      { tool: "uml-object", label: "Object", icon: Square },
      { tool: "component", label: "Component", icon: Component },
      { tool: "actor", label: "Actor", icon: User },
      { tool: "lifeline", label: "Lifeline", icon: User },
      { tool: "activation", label: "Activation", icon: Rows3 },
      { tool: "package", label: "Package", icon: Package }
    ]
  },
  {
    title: "State",
    tools: [
      { tool: "state-start", label: "Initial state", icon: Disc },
      { tool: "state-end", label: "Final state", icon: CircleDot },
      { tool: "ellipse", label: "State", icon: Circle },
      { tool: "connector", label: "Transition", icon: MoveRight }
    ]
  },
  {
    title: "Circuit / Logic",
    tools: [
      { tool: "battery", label: "Battery", icon: Battery },
      { tool: "resistor", label: "Resistor", icon: Signal },
      { tool: "capacitor", label: "Capacitor", icon: Box },
      { tool: "ground", label: "Ground", icon: Signal },
      { tool: "logic-and", label: "AND gate", icon: GitFork },
      { tool: "logic-or", label: "OR gate", icon: GitFork },
      { tool: "logic-not", label: "NOT gate", icon: Triangle },
      { tool: "logic-xor", label: "XOR gate", icon: GitFork },
      { tool: "switch", label: "Switch", icon: ToggleRight },
      { tool: "led", label: "LED", icon: Lightbulb },
      { tool: "inductor", label: "Inductor", icon: Signal }
    ]
  }
];

export function Toolbar({
  canRedo,
  canUndo,
  currentTool,
  fillColor,
  gridEnabled,
  strokeColor,
  strokeWidth,
  onFillColorChange,
  onGridToggle,
  onGroup,
  onRedo,
  onStrokeColorChange,
  onStrokeWidthChange,
  onToolChange,
  onUndo,
  onUngroup
}: ToolbarProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = useMemo(
    () =>
      shapeSections
        .map((section) => ({
          ...section,
          tools: section.tools.filter(
            (tool) =>
              !normalizedQuery ||
              section.title.toLowerCase().includes(normalizedQuery) ||
              tool.label.toLowerCase().includes(normalizedQuery) ||
              tool.tool.includes(normalizedQuery)
          )
        }))
        .filter((section) => section.tools.length > 0),
    [normalizedQuery]
  );

  const renderToolButton = ({ tool, label, icon: Icon }: ToolDefinition) => (
    <button
      aria-label={label}
      className={currentTool === tool ? "tool-button active" : "tool-button"}
      key={`${tool}-${label}`}
      onClick={() => onToolChange(tool)}
      title={label}
      type="button"
    >
      <Icon size={18} />
    </button>
  );

  return (
    <aside className="toolbar" aria-label="Whiteboard tools">
      <div className="toolbar-menu-grid">{quickTools.map(renderToolButton)}</div>

      <label className="shape-search">
        <Search size={15} />
        <span className="visually-hidden">Search shapes</span>
        <input placeholder="Search shapes" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>

      <div className="shape-section-list">
        {filteredSections.map((section) => (
          <details className="shape-section" key={section.title} open>
            <summary>
              <ChevronDown size={14} />
              <span>{section.title}</span>
            </summary>
            <div className="shape-grid">{section.tools.map(renderToolButton)}</div>
          </details>
        ))}
        {filteredSections.length === 0 ? <p className="shape-empty">No matching shapes</p> : null}
      </div>

      <div className="toolbar-controls">
        <div className="toolbar-control-row">
          <label className="swatch-control" title="Stroke color">
            <span className="visually-hidden">Stroke color</span>
            <input type="color" value={strokeColor} onChange={(event) => onStrokeColorChange(event.target.value)} />
          </label>
          <label className="swatch-control fill" title="Fill color">
            <span className="visually-hidden">Fill color</span>
            <input type="color" value={fillColor} onChange={(event) => onFillColorChange(event.target.value)} />
          </label>
          <span className="stroke-readout">{strokeWidth}px</span>
        </div>
        <label className="visually-hidden" htmlFor="stroke-width">
          Stroke width
        </label>
        <input
          id="stroke-width"
          max="18"
          min="1"
          onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
          type="range"
          value={strokeWidth}
        />
      </div>

      <div className="toolbar-menu-grid utility-grid">
        <button
          aria-label="Toggle grid"
          className={gridEnabled ? "tool-button active" : "tool-button"}
          onClick={onGridToggle}
          title="Toggle grid"
          type="button"
        >
          <Grid2X2 size={18} />
        </button>
        <button aria-label="Undo" className="tool-button" disabled={!canUndo} onClick={onUndo} title="Undo" type="button">
          <Undo2 size={18} />
        </button>
        <button aria-label="Redo" className="tool-button" disabled={!canRedo} onClick={onRedo} title="Redo" type="button">
          <Redo2 size={18} />
        </button>
        <button aria-label="Group selection" className="tool-button" onClick={onGroup} title="Group selection" type="button">
          <Group size={18} />
        </button>
        <button aria-label="Ungroup selection" className="tool-button" onClick={onUngroup} title="Ungroup selection" type="button">
          <Ungroup size={18} />
        </button>
      </div>
    </aside>
  );
}
