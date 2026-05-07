import { RotateCcw, X } from "lucide-react";
import type { BoardVersionSnapshot } from "../../../shared/src/types";

interface VersionHistoryProps {
  open: boolean;
  versions: BoardVersionSnapshot[];
  onClose: () => void;
  onRestore: (snapshot: BoardVersionSnapshot) => void;
}

export function VersionHistory({ open, versions, onClose, onRestore }: VersionHistoryProps) {
  if (!open) {
    return null;
  }

  return (
    <aside className="floating-drawer right" aria-label="Version history">
      <div className="floating-drawer-header">
        <div>
          <span className="panel-kicker">History</span>
          <h2>Last 10 Snapshots</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="Close history" type="button">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-list">
        {versions.length > 0 ? (
          versions
            .slice()
            .reverse()
            .map((snapshot) => (
              <article className="version-row" key={snapshot.id}>
                <div>
                  <strong>{snapshot.label}</strong>
                  <p>
                    {snapshot.objectCount} objects · {new Date(snapshot.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <button className="icon-button" onClick={() => onRestore(snapshot)} title="Restore version" type="button">
                  <RotateCcw size={16} />
                </button>
              </article>
            ))
        ) : (
          <div className="empty-state compact">
            <p>Snapshots appear after canvas edits.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
