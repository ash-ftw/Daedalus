export type DrawingTool =
  | "select"
  | "pan"
  | "pen"
  | "eraser"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "connector"
  | "text"
  | "sticky";

export type ParticipantRole = "owner" | "editor" | "viewer" | "instructor";

export interface Participant {
  id: string;
  name: string;
  color: string;
  role: ParticipantRole;
  tool: DrawingTool;
  online: boolean;
  joinedAt: string;
  lastActiveAt: string;
}

export interface CursorPayload {
  userId: string;
  name: string;
  color: string;
  tool: DrawingTool;
  x: number;
  y: number;
}

export type CanvasObjectPayload = Record<string, unknown> & {
  objectId: string;
  objectType?: string;
  authorId?: string;
};

interface CanvasOperationMetadata {
  operationId?: string;
  clientTimestamp?: string;
  baseVersion?: number;
  duplicate?: boolean;
}

export type CanvasOperation =
  | {
      type: "upsert";
      userId: string;
      boardVersion: number;
      object: CanvasObjectPayload;
    } & CanvasOperationMetadata
  | {
      type: "delete";
      userId: string;
      boardVersion: number;
      objectId: string;
    } & CanvasOperationMetadata
  | {
      type: "replace";
      userId: string;
      boardVersion: number;
      objects: CanvasObjectPayload[];
    } & CanvasOperationMetadata
  | {
      type: "clear";
      userId: string;
      boardVersion: number;
    } & CanvasOperationMetadata;

export type DiagramType =
  | "Blank Canvas"
  | "Flowchart"
  | "ER Diagram - Chen Notation"
  | "ER Diagram - Crow's Foot Notation"
  | "UML Class Diagram"
  | "State Machine Diagram"
  | "Basic Circuit Diagram"
  | "Logic Gate Diagram"
  | "Mind Map"
  | "Unknown Diagram";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalysisComponent {
  id: string;
  objectId?: string;
  label: string;
  description: string;
  confidence: number;
  bounds?: Bounds;
}

export interface AnalysisIssue {
  id: string;
  severity: "error" | "warning" | "suggestion";
  title: string;
  explanation: string;
  why: string;
  objectIds: string[];
  suggestion: string;
}

export interface AnalysisResult {
  id: string;
  roomId: string;
  createdAt: string;
  provider: "mock" | "anthropic" | "groq";
  diagramType: DiagramType;
  confidence: number;
  summary: string;
  components: AnalysisComponent[];
  issues: AnalysisIssue[];
  hints: string[];
  complexityScore: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sender: "user" | "ai";
  authorName: string;
  content: string;
  createdAt: string;
}

export interface BoardComment {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  anchor: Bounds;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoardVersionSnapshot {
  id: string;
  roomId: string;
  version: number;
  label: string;
  createdAt: string;
  objectCount: number;
  objects: CanvasObjectPayload[];
}

export interface BoardSnapshot {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  tags: string[];
  helpRequested: boolean;
  objects: CanvasObjectPayload[];
  version: number;
  updatedAt: string;
  participants: Participant[];
  analyses: AnalysisResult[];
  chat: ChatMessage[];
  comments: BoardComment[];
  versions: BoardVersionSnapshot[];
}

export interface BoardSummary {
  roomId: string;
  boardName: string;
  classroomId?: string;
  ownerName?: string;
  tags: string[];
  helpRequested: boolean;
  objectCount: number;
  commentCount: number;
  participantCount: number;
  version: number;
  updatedAt: string;
  lastAnalysis?: AnalysisResult;
  previewObjects: CanvasObjectPayload[];
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  diagramType: DiagramType;
  objects: CanvasObjectPayload[];
}

export interface QualityReport {
  roomId: string;
  generatedAt: string;
  diagramType: DiagramType;
  score: number;
  grade: "excellent" | "good" | "needs-work" | "blocked";
  strengths: string[];
  risks: string[];
  nextSteps: string[];
  issueCount: number;
  componentCount: number;
}

export interface SessionSummary {
  classroomId?: string;
  generatedAt: string;
  boardCount: number;
  helpRequestedCount: number;
  averageQualityScore: number;
  boards: Array<{
    roomId: string;
    boardName: string;
    ownerName?: string;
    diagramType?: DiagramType;
    qualityScore: number;
    helpRequested: boolean;
    unresolvedCommentCount: number;
    summary: string;
  }>;
}

export interface IntegrationStatus {
  id: "canvas-lms" | "moodle" | "google-classroom" | "slack";
  name: string;
  configured: boolean;
  status: "ready" | "stub" | "missing-config";
  description: string;
}
