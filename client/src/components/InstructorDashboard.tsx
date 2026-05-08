import { AlertTriangle, ArrowLeft, Download, ExternalLink, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BoardSummary, IntegrationStatus, SessionDebrief, StorageStatus } from "../../../shared/src/types";
import { API_URL } from "../hooks/useBoardSocket";

interface StorageOverview {
  boards: StorageStatus;
  auth: {
    path: string;
    userCount: number;
    roomCount: number;
    lastError?: string;
  };
  realtime?: {
    provider: "memory" | "redis";
    enabled: boolean;
    presenceShared: boolean;
    lastError?: string;
  };
}

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

function authHeaders() {
  const token = window.localStorage.getItem("daedalus-auth-token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export function InstructorDashboard() {
  const classroomId = useMemo(dashboardClassroomId, []);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [debrief, setDebrief] = useState<SessionDebrief | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageOverview | null>(null);
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
      const storageResponse = await fetch(`${API_URL}/api/storage/status`);
      setStorageStatus((await storageResponse.json()) as StorageOverview);
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

  const downloadPackage = async () => {
    const targetClassroom = classroomId ?? "all";
    const response = await fetch(`${API_URL}/api/classrooms/${encodeURIComponent(targetClassroom)}/export/package`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    const text = JSON.stringify(await response.json(), null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = `${targetClassroom}-session-package.json`;
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

  const generateDebrief = async () => {
    const targetClassroom = classroomId ?? "all";
    const response = await fetch(`${API_URL}/api/classrooms/${encodeURIComponent(targetClassroom)}/debrief`);

    if (response.ok) {
      setDebrief((await response.json()) as SessionDebrief);
    }
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
        <button className="small-button" onClick={() => void downloadPackage()} type="button">
          <Download size={15} />
          Package
        </button>
        <button className="small-button" onClick={() => void generateDebrief()} type="button">
          <Sparkles size={15} />
          Debrief
        </button>
        <button className="small-button primary" onClick={() => void shareToSlack()} type="button">
          <Send size={15} />
          Slack
        </button>
        {storageStatus ? (
          <span
            className={storageStatus.boards.persistent && !storageStatus.boards.lastError && !storageStatus.auth.lastError ? "integration-pill ready" : "integration-pill"}
            title={storageStatus.boards.lastError ?? storageStatus.auth.lastError ?? storageStatus.boards.path ?? "Memory-only board storage"}
          >
            Storage: {storageStatus.boards.provider}, {storageStatus.auth.userCount} users
          </span>
        ) : null}
        {storageStatus?.realtime ? (
          <span
            className={storageStatus.realtime.enabled && !storageStatus.realtime.lastError ? "integration-pill ready" : "integration-pill"}
            title={storageStatus.realtime.lastError ?? "Realtime scale status"}
          >
            Realtime: {storageStatus.realtime.provider}
          </span>
        ) : null}
      </section>

      {debrief ? (
        <section className="debrief-panel">
          <div>
            <span className="panel-kicker">AI Session Debrief</span>
            <h2>{debrief.headline}</h2>
          </div>
          <div className="debrief-grid">
            <article>
              <h3>Themes</h3>
              {debrief.themes.map((theme) => (
                <p key={theme}>{theme}</p>
              ))}
            </article>
            <article>
              <h3>Instructor Actions</h3>
              {debrief.instructorActions.map((action) => (
                <p key={action}>{action}</p>
              ))}
            </article>
            <article>
              <h3>Needs Help</h3>
              {debrief.studentGroupsNeedingHelp.length > 0 ? (
                debrief.studentGroupsNeedingHelp.map((group) => (
                  <p key={group.roomId}>
                    <strong>{group.boardName}</strong>: {group.reason}
                  </p>
                ))
              ) : (
                <p>No urgent help queues detected.</p>
              )}
            </article>
            <article>
              <h3>Celebrate</h3>
              {debrief.celebrationPoints.map((point) => (
                <p key={point}>{point}</p>
              ))}
            </article>
          </div>
        </section>
      ) : null}

      {status === "error" ? (
        <div className="dashboard-empty">
          <AlertTriangle size={24} />
          <p>Could not load boards.</p>
        </div>
      ) : null}

      <section className="board-grid">
        {boards.map((board) => (
          <article className={board.helpRequested ? "board-tile needs-help" : "board-tile"} key={board.roomId}>
            <div className={board.thumbnailDataUrl ? "board-tile-preview has-image" : "board-tile-preview"}>
              {board.thumbnailDataUrl ? (
                <img alt="" src={board.thumbnailDataUrl} />
              ) : (
                <>
                  <span>{board.objectCount}</span>
                  <small>objects</small>
                </>
              )}
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
