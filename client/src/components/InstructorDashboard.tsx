import { AlertTriangle, ArrowLeft, Download, ExternalLink, RefreshCw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BoardSummary, IntegrationStatus } from "../../../shared/src/types";
import { fetchWithAuth } from "../auth";
import { API_URL } from "../hooks/useBoardSocket";

function dashboardClassroomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("classroom") ?? undefined;
}

function boardUrl(roomId: string, classroomId?: string) {
  const params = new URLSearchParams();
  params.set("room", roomId);
  params.set("instructor", "1");
  const currentToken = new URLSearchParams(window.location.search).get("token");

  if (classroomId) {
    params.set("classroom", classroomId);
  }

  if (currentToken) {
    params.set("token", currentToken);
  }

  return `${window.location.pathname}?${params.toString()}`;
}

function numeric(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectBounds(object: Record<string, unknown>) {
  const type = String(object.objectType ?? object.type ?? "");
  const left = numeric(object.left, numeric(object.x1));
  const top = numeric(object.top, numeric(object.y1));

  if (type === "connector" || object.type === "line") {
    const x1 = numeric(object.x1, left);
    const y1 = numeric(object.y1, top);
    const x2 = numeric(object.x2, left + 80);
    const y2 = numeric(object.y2, top + 40);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(8, Math.abs(x2 - x1)),
      height: Math.max(8, Math.abs(y2 - y1))
    };
  }

  return {
    x: left,
    y: top,
    width: numeric(object.width, numeric(object.rx, 48) * 2),
    height: numeric(object.height, numeric(object.ry, 28) * 2)
  };
}

function BoardThumbnail({ board }: { board: BoardSummary }) {
  const objects = board.previewObjects;
  const bounds = objects.map(objectBounds);
  const minX = Math.min(0, ...bounds.map((bound) => bound.x)) - 20;
  const minY = Math.min(0, ...bounds.map((bound) => bound.y)) - 20;
  const maxX = Math.max(260, ...bounds.map((bound) => bound.x + bound.width)) + 20;
  const maxY = Math.max(160, ...bounds.map((bound) => bound.y + bound.height)) + 20;

  return (
    <svg className="board-thumbnail-svg" role="img" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}>
      <rect fill="#ffffff" height={maxY - minY} width={maxX - minX} x={minX} y={minY} />
      {objects.slice(0, 48).map((object) => {
        const type = String(object.objectType ?? object.type ?? "");
        const boundsForObject = objectBounds(object);
        const stroke = String(object.stroke ?? "#176b87");
        const fill = String(object.fill ?? (type === "sticky" ? "#fff7b0" : "#f8fbfd"));

        if (type === "connector" || object.type === "line") {
          return (
            <line
              key={object.objectId}
              stroke={stroke}
              strokeLinecap="round"
              strokeWidth={Math.max(2, numeric(object.strokeWidth, 3))}
              x1={numeric(object.x1, boundsForObject.x)}
              x2={numeric(object.x2, boundsForObject.x + boundsForObject.width)}
              y1={numeric(object.y1, boundsForObject.y)}
              y2={numeric(object.y2, boundsForObject.y + boundsForObject.height)}
            />
          );
        }

        if (type === "ellipse") {
          return (
            <ellipse
              cx={boundsForObject.x + boundsForObject.width / 2}
              cy={boundsForObject.y + boundsForObject.height / 2}
              fill={fill}
              key={object.objectId}
              rx={boundsForObject.width / 2}
              ry={boundsForObject.height / 2}
              stroke={stroke}
              strokeWidth={Math.max(2, numeric(object.strokeWidth, 2))}
            />
          );
        }

        if (type === "text") {
          return (
            <text fill="#1f2933" fontSize="24" key={object.objectId} x={boundsForObject.x} y={boundsForObject.y + 24}>
              {String(object.text ?? "Text").slice(0, 18)}
            </text>
          );
        }

        return (
          <rect
            fill={fill}
            height={boundsForObject.height}
            key={object.objectId}
            rx={type === "diamond" ? 0 : 6}
            stroke={stroke}
            strokeWidth={Math.max(2, numeric(object.strokeWidth, 2))}
            transform={type === "diamond" ? `rotate(45 ${boundsForObject.x + boundsForObject.width / 2} ${boundsForObject.y + boundsForObject.height / 2})` : undefined}
            width={boundsForObject.width}
            x={boundsForObject.x}
            y={boundsForObject.y}
          />
        );
      })}
    </svg>
  );
}

export function InstructorDashboard() {
  const classroomId = useMemo(dashboardClassroomId, []);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<BoardSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const loadBoards = async () => {
    setStatus("loading");

    try {
      const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : "";
      const response = await fetchWithAuth(`${API_URL}/api/boards${query}`);

      if (!response.ok) {
        throw new Error(`Dashboard request failed with ${response.status}`);
      }

      setBoards((await response.json()) as BoardSummary[]);
      const integrationResponse = await fetchWithAuth(`${API_URL}/api/integrations`);
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
    const response = await fetchWithAuth(`${API_URL}/api/classrooms/${encodeURIComponent(targetClassroom)}/summary?format=markdown`);
    const text = await response.text();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    link.download = `${targetClassroom}-summary.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadExportPackage = async () => {
    const targetClassroom = classroomId ?? "all";
    const response = await fetchWithAuth(`${API_URL}/api/classrooms/${encodeURIComponent(targetClassroom)}/export-package`);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${targetClassroom}-daedalus-export.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const shareToSlack = async () => {
    await fetchWithAuth(`${API_URL}/api/integrations/slack/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ classroomId })
    });
    void loadBoards();
  };

  const spotlightBoard = async (board: BoardSummary) => {
    await fetchWithAuth(`${API_URL}/api/classrooms/${encodeURIComponent(classroomId ?? "all")}/spotlight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ roomId: board.roomId })
    });
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
        <button className="small-button" onClick={() => void downloadExportPackage()} type="button">
          <Download size={15} />
          Package
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

      <section className={selectedBoard ? "dashboard-review-layout" : "dashboard-board-area"}>
        <div className="board-grid">
          {boards.map((board) => (
            <article className={board.helpRequested ? "board-tile needs-help" : "board-tile"} key={board.roomId}>
            <div className="board-tile-preview">
              <BoardThumbnail board={board} />
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
                {board.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div className="board-tile-actions">
              <button className="small-button" onClick={() => window.open(boardUrl(board.roomId, board.classroomId), "_blank")} type="button">
                <ExternalLink size={15} />
                Open
              </button>
              <button className="small-button" onClick={() => void spotlightBoard(board)} type="button">
                Spotlight
              </button>
              <button className="small-button primary" onClick={() => setSelectedBoard(board)} type="button">
                Review
              </button>
            </div>
          </article>
          ))}
        </div>
        {selectedBoard ? (
          <aside className="review-pane">
            <div className="review-pane-header">
              <div>
                <span className="panel-kicker">Side-by-side review</span>
                <strong>{selectedBoard.boardName}</strong>
              </div>
              <button className="small-button" onClick={() => setSelectedBoard(null)} type="button">
                Close
              </button>
            </div>
            <iframe className="review-frame" src={boardUrl(selectedBoard.roomId, selectedBoard.classroomId)} title={`Review ${selectedBoard.boardName}`} />
          </aside>
        ) : null}
      </section>

      {status === "ready" && boards.length === 0 ? (
        <div className="dashboard-empty">
          <p>No active student boards in this classroom yet.</p>
        </div>
      ) : null}
    </main>
  );
}
