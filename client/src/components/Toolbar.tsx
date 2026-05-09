import {
  Circle,
  Diamond,
  Eraser,
  Grid2X2,
  Group,
  Hand,
  MousePointer2,
  MoveRight,
  Pencil,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
  Ungroup
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

const tools: Array<{ tool: DrawingTool; label: string; icon: typeof MousePointer2 }> = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "pan", label: "Pan", icon: Hand },
  { tool: "pen", label: "Pen", icon: Pencil },
  { tool: "eraser", label: "Eraser", icon: Eraser },
  { tool: "rectangle", label: "Rectangle", icon: Square },
  { tool: "ellipse", label: "Ellipse", icon: Circle },
  { tool: "diamond", label: "Decision", icon: Diamond },
  { tool: "connector", label: "Connector", icon: MoveRight },
  { tool: "text", label: "Text", icon: Type },
  { tool: "sticky", label: "Sticky note", icon: StickyNote }
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
  return (
    <aside className="toolbar" aria-label="Whiteboard tools">
      <div className="toolbar-group">
        {tools.map(({ tool, label, icon: Icon }) => (
          <button
            aria-label={label}
            className={currentTool === tool ? "tool-button active" : "tool-button"}
            key={tool}
            onClick={() => onToolChange(tool)}
            title={label}
            type="button"
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <label className="swatch-control" title="Stroke color">
          <span className="visually-hidden">Stroke color</span>
          <input type="color" value={strokeColor} onChange={(event) => onStrokeColorChange(event.target.value)} />
        </label>
        <label className="swatch-control fill" title="Fill color">
          <span className="visually-hidden">Fill color</span>
          <input type="color" value={fillColor} onChange={(event) => onFillColorChange(event.target.value)} />
        </label>
      </div>

      <div className="toolbar-group slider-group">
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
        <span>{strokeWidth}px</span>
      </div>

      <div className="toolbar-group">
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
