import { X } from "lucide-react";
import type { BoardTemplate } from "../../../shared/src/types";

interface TemplateLibraryProps {
  open: boolean;
  templates: BoardTemplate[];
  onApply: (template: BoardTemplate) => void;
  onClose: () => void;
}

export function TemplateLibrary({ open, templates, onApply, onClose }: TemplateLibraryProps) {
  if (!open) {
    return null;
  }

  return (
    <aside className="floating-drawer" aria-label="Template library">
      <div className="floating-drawer-header">
        <div>
          <span className="panel-kicker">Templates</span>
          <h2>Starter Diagrams</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="Close templates" type="button">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-list">
        {templates.map((template) => (
          <article className="template-card" key={template.id}>
            <div>
              <strong>{template.name}</strong>
              <span>{template.diagramType}</span>
              <p>{template.description}</p>
            </div>
            <button className="small-button primary" onClick={() => onApply(template)} type="button">
              Use
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}
