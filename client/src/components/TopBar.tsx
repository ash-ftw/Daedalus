import { Download, LayoutDashboard, LifeBuoy, Share2, Users, Wifi, WifiOff } from "lucide-react";
import type { Participant } from "../../../shared/src/types";
import type { ConnectionStatus } from "../hooks/useBoardSocket";

interface TopBarProps {
  boardName: string;
  classroomId?: string;
  connectionStatus: ConnectionStatus;
  helpRequested: boolean;
  participants: Participant[];
  onBoardNameChange: (name: string) => void;
  onDashboardOpen: () => void;
  onExportPng: () => void;
  onHelpToggle: () => void;
  onShare: () => void;
}

export function TopBar({
  boardName,
  classroomId,
  connectionStatus,
  helpRequested,
  participants,
  onBoardNameChange,
  onDashboardOpen,
  onExportPng,
  onHelpToggle,
  onShare
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
      <button className="text-button primary" onClick={onExportPng} type="button">
        <Download size={16} />
        Export PNG
      </button>
    </header>
  );
}
