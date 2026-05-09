import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { QualityReport } from "../../../shared/src/types";
import { fetchWithAuth } from "../auth";
import { API_URL } from "../hooks/useBoardSocket";

interface QualityReportPanelProps {
  open: boolean;
  roomId: string;
  onClose: () => void;
}

export function QualityReportPanel({ open, roomId, onClose }: QualityReportPanelProps) {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);

    try {
      const response = await fetchWithAuth(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/quality-report`);
      setReport((await response.json()) as QualityReport);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadReport();
    }
  }, [open, roomId]);

  if (!open) {
    return null;
  }

  return (
    <aside className="floating-drawer right" aria-label="Quality report">
      <div className="floating-drawer-header">
        <div>
          <span className="panel-kicker">Quality Report</span>
          <h2>{report ? `${report.score}/100` : "Loading"}</h2>
        </div>
        <div className="drawer-header-actions">
          <button className="icon-button" onClick={() => void loadReport()} title="Refresh report" type="button">
            <RefreshCw size={18} />
          </button>
          <button className="icon-button" onClick={onClose} title="Close report" type="button">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="quality-body">
        {report ? (
          <>
            <div className={`quality-score ${report.grade}`}>
              <strong>{report.diagramType}</strong>
              <span>{report.grade.replace("-", " ")}</span>
            </div>
            <section>
              <h3>Strengths</h3>
              {report.strengths.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </section>
            <section>
              <h3>Risks</h3>
              {report.risks.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </section>
            <section>
              <h3>Next Steps</h3>
              {report.nextSteps.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </section>
          </>
        ) : (
          <div className="empty-state compact">
            <p>{loading ? "Loading report..." : "No report available."}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
