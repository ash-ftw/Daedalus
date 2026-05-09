import type {
  AnalysisResult,
  BoardComment,
  BoardVersionSnapshot,
  CanvasObjectPayload,
  ChatMessage
} from "../../../shared/src/types";

export interface PersistedBoardRoom {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  tags: string[];
  helpRequested: boolean;
  objects: CanvasObjectPayload[];
  analyses: AnalysisResult[];
  chat: ChatMessage[];
  comments: BoardComment[];
  versions: BoardVersionSnapshot[];
  version: number;
  updatedAt: string;
}

export interface BackendStatus {
  name: string;
  configured: boolean;
  durable: boolean;
}

export interface BoardPersistence {
  status: BackendStatus;
  initialize(): Promise<void>;
  loadRooms(): Promise<PersistedBoardRoom[]>;
  saveRoom(room: PersistedBoardRoom): Promise<void>;
}
