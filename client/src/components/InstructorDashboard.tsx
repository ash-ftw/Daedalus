import { AlertTriangle, ArrowLeft, Download, ExternalLink, RefreshCw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BoardSummary, IntegrationStatus } from "../../../shared/src/types";
import { API_URL } from "../hooks/useBoardSocket";

function dashboardClassroomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("classroom") ?? undefined;
}

function boardUrl(roomId: string, classroomId?: string) {
  const params = new URLSearchParams();
  params.set("room", roomId);

  if (classroomId) {
    params.set("classroom", classroomId);
  }

  return `${window.location.pathname}?${params.toString()}`;
}

export function InstructorDashboard() {
  const classroomId = useMemo(dashboardClassroomId, []);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const loadBoards = async () => {
    setStatus("loading");

    try {
      const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : "";
      const response = await fetch(`${API_URL}/api/boards${query}`);

      if (!response.ok) {
        throw new Error(`Dashboard request failed with ${response.status}`);
      }

      setBoards((await response.json()) as BoardSummary[]);
      const integrationResponse = await fetch(`${API_URL}/api/integrations`);
      setIntegrations((await integrationResponse.json()) as IntegrationStatus[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    void loadBoards();
    const intervalId = window.setInterval(() => void loadBoards(), 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  const downloadSummary = async () => {
    const targetClassroom = classroomId ?? "all";
    const response = await fetch(`${API_URL}/api/classrooms/${encodeURIComponent(targetClassroom)}/summary?format=markdown`);
    const text = await response.text();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    link.download = `${targetClassroom}-summary.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const shareToSlack = async () => {
    await fetch(`${API_URL}/api/integrations/slack/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ classroomId })
    });
    void loadBoards();
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <button className="text-button" onClick={() => window.history.back()} type="button">
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <span className="panel-kicker">Instructor Mode</span>
          <h1>{classroomId ? `Classroom ${classroomId}` : "All Active Boards"}</h1>
        </div>
        <button className="text-button" onClick={() => void loadBoards()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <section className="integration-strip">
        {integrations.map((integration) => (
          <span className={integration.configured ? "integration-pill ready" : "integration-pill"} key={integration.id} title={integration.description}>
            {integration.name}: {integration.status}
          </span>
        ))}
        <button className="small-button" onClick={() => void downloadSummary()} type="button">
          <Download size={15} />
          Summary
        </button>
        <button className="small-button primary" onClick={() => void shareToSlack()} type="button">
          <Send size={15} />
          Slack
        </button>
      </section>

      {status === "error" ? (
        <div className="dashboard-empty">
          <AlertTriangle size={24} />
          <p>Could not load boards.</p>
        </div>
      ) : null}

      <section className="board-grid">
        {boards.map((board) => (
          <article className={board.helpRequested ? "board-tile needs-help" : "board-tile"} key={board.roomId}>
            <div className="board-tile-preview">
              <span>{board.objectCount}</span>
              <small>objects</small>
            </div>
            <div className="board-tile-body">
              <div className="board-tile-title">
                <strong>{board.boardName}</strong>
                {board.helpRequested ? <span>Help requested</span> : null}
              </div>
              <p>{board.lastAnalysis?.summary ?? "No AI analysis yet."}</p>
              <div className="board-tile-meta">
                <span>{board.ownerName ?? "Guest board"}</span>
                <span>{board.participantCount} online</span>
                <span>v{board.version}</span>
              </div>
            </div>
            <div className="board-tile-actions">
              <button className="small-button" onClick={() => window.open(boardUrl(board.roomId, board.classroomId), "_blank")} type="button">
                <ExternalLink size={15} />
                Open
              </button>
              <button className="small-button primary" onClick={() => (window.location.href = boardUrl(board.roomId, board.classroomId))} type="button">
                Review
              </button>
            </div>
          </article>
        ))}
      </section>

      {status === "ready" && boards.length === 0 ? (
        <div className="dashboard-empty">
          <p>No active student boards in this classroom yet.</p>
        </div>
      ) : null}
    </main>
  );
}
