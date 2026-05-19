import { Copy, Download, LayoutDashboard, LifeBuoy, Moon, Send, Share2, Sun, Tags, Users, Wifi, WifiOff } from "lucide-react";
import type { Participant } from "../../../shared/src/types";
import type { ConnectionStatus } from "../hooks/useBoardSocket";

type ThemeMode = "dark" | "light";

interface TopBarProps {
  boardName: string;
  classroomId?: string;
  connectionStatus: ConnectionStatus;
  helpRequested: boolean;
  participants: Participant[];
  tags: string[];
  themeMode: ThemeMode;
  onBoardNameChange: (name: string) => void;
  onDashboardOpen: () => void;
  onDuplicate: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportSvg: () => void;
  onHelpToggle: () => void;
  onShare: () => void;
  onShareSlack: () => void;
  onTagsChange: (tags: string[]) => void;
  onThemeToggle: () => void;
}

export function TopBar({
  boardName,
  classroomId,
  connectionStatus,
  helpRequested,
  participants,
  tags,
  themeMode,
  onBoardNameChange,
  onDashboardOpen,
  onDuplicate,
  onExportPng,
  onExportPdf,
  onExportSvg,
  onHelpToggle,
  onShare,
  onShareSlack,
  onTagsChange,
  onThemeToggle
}: TopBarProps) {
  const connected = connectionStatus === "connected";

  return (
    <header className="topbar">
      <div className="brand-mark">D</div>
      <input
        aria-label="Board name"
        className="board-title-input"
        onChange={(event) => onBoardNameChange(event.target.value)}
        value={boardName}
      />

      <div className="topbar-spacer" />

      <div className={connected ? "connection-pill connected" : "connection-pill offline"}>
        {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>{connected ? "Live" : "Offline"}</span>
      </div>

      <div className="participant-stack" aria-label={`${participants.length} participants`}>
        <Users size={16} />
        {participants.slice(0, 5).map((participant) => (
          <span
            className="avatar-dot"
            key={participant.id}
            style={{ backgroundColor: participant.color }}
            title={participant.name}
          >
            {participant.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
        <span className="participant-count">{participants.length}</span>
      </div>

      {classroomId ? (
        <button className="text-button" onClick={onDashboardOpen} type="button">
          <LayoutDashboard size={16} />
          Dashboard
        </button>
      ) : null}
      <button className={helpRequested ? "text-button danger" : "text-button"} onClick={onHelpToggle} type="button">
        <LifeBuoy size={16} />
        {helpRequested ? "Help requested" : "Need help"}
      </button>
      <button className="text-button" onClick={onShare} type="button">
        <Share2 size={16} />
        Share
      </button>
      <button className="text-button" onClick={() => onTagsChange(window.prompt("Board tags, comma separated", tags.join(", "))?.split(",") ?? tags)} type="button">
        <Tags size={16} />
        Tags
      </button>
      <button className="text-button" onClick={onThemeToggle} type="button">
        {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        {themeMode === "dark" ? "Light" : "Dark"}
      </button>
      <button className="text-button" onClick={onDuplicate} type="button">
        <Copy size={16} />
        Duplicate
      </button>
      <button className="text-button" onClick={onShareSlack} type="button">
        <Send size={16} />
        Slack
      </button>
      <button className="text-button primary" onClick={onExportPng} type="button">
        <Download size={16} />
        PNG
      </button>
      <button className="text-button" onClick={onExportSvg} type="button">
        <Download size={16} />
        SVG
      </button>
      <button className="text-button" onClick={onExportPdf} type="button">
        <Download size={16} />
        PDF
      </button>
    </header>
  );
}
