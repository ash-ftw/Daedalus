export type DrawingTool =
  | "select"
  | "pan"
  | "pen"
  | "eraser"
  | "rectangle"
  | "rounded-rectangle"
  | "square"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "octagon"
  | "plus-shape"
  | "cross"
  | "star"
  | "callout"
  | "cube"
  | "folder"
  | "table"
  | "note"
  | "double-document"
  | "card"
  | "tape"
  | "terminator"
  | "parallelogram"
  | "document"
  | "hexagon"
  | "trapezoid"
  | "predefined-process"
  | "internal-storage"
  | "manual-input"
  | "stored-data"
  | "delay"
  | "display"
  | "off-page-connector"
  | "sort"
  | "merge"
  | "collate"
  | "summing-junction"
  | "or-junction"
  | "database"
  | "cloud"
  | "actor"
  | "uml-class"
  | "uml-interface"
  | "uml-note"
  | "uml-object"
  | "component"
  | "lifeline"
  | "activation"
  | "package"
  | "er-entity"
  | "weak-entity"
  | "associative-entity"
  | "er-attribute"
  | "key-attribute"
  | "derived-attribute"
  | "multivalue-attribute"
  | "er-relationship"
  | "identifying-relationship"
  | "state-start"
  | "state-end"
  | "resistor"
  | "capacitor"
  | "ground"
  | "battery"
  | "logic-and"
  | "logic-or"
  | "logic-not"
  | "logic-xor"
  | "switch"
  | "led"
  | "inductor"
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

export type AuthRole = "student" | "instructor" | "user";

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  role: AuthRole;
  color: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  createdAt: string;
}

export type RoomVisibility = "private" | "public";
export type RoomMemberRole = "owner" | "editor" | "viewer" | "instructor";

export interface CollaborationRoom {
  roomId: string;
  name: string;
  classroomId?: string;
  ownerId: string;
  ownerName: string;
  visibility: RoomVisibility;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  memberRole?: RoomMemberRole;
  memberCount?: number;
  objectCount?: number;
  thumbnailDataUrl?: string;
}

export interface RoomMembership {
  roomId: string;
  userId: string;
  userName: string;
  role: RoomMemberRole;
  invitedBy?: string;
  joinedAt: string;
  updatedAt: string;
}

export interface RoomInvite {
  code: string;
  roomId: string;
  role: Exclude<RoomMemberRole, "owner">;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface RoomAccess {
  room: CollaborationRoom;
  membership: RoomMembership;
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
  clientId?: string;
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

export type LanguageCode = "en" | "es" | "hi" | "zh";

export interface GeneratedArtifact {
  id: string;
  roomId: string;
  kind: "sql" | "pseudocode" | "typescript" | "state-machine" | "circuit-notes" | "markdown";
  title: string;
  language: string;
  content: string;
  warnings: string[];
  createdAt: string;
}

export interface GeneratedDiagram {
  id: string;
  roomId: string;
  provider: "mock" | "anthropic" | "groq";
  prompt: string;
  title: string;
  diagramType: DiagramType;
  summary: string;
  objects: CanvasObjectPayload[];
  warnings: string[];
  createdAt: string;
}

export interface LayoutSuggestion {
  id: string;
  roomId: string;
  title: string;
  description: string;
  impact: "low" | "medium" | "high";
  objectIds: string[];
  createdAt: string;
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
  thumbnailDataUrl?: string;
  preferredLanguage?: LanguageCode;
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
  thumbnailDataUrl?: string;
  preferredLanguage?: LanguageCode;
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

export interface StorageStatus {
  provider: "memory" | "file" | "postgres";
  persistent: boolean;
  roomCount: number;
  path?: string;
  lastPersistedAt?: string;
  lastError?: string;
}

export interface InstitutionTuningProfile {
  configured: boolean;
  label: string;
  rubric: string[];
  defaultLanguage: LanguageCode;
}

export interface SessionDebrief {
  classroomId?: string;
  generatedAt: string;
  headline: string;
  themes: string[];
  instructorActions: string[];
  studentGroupsNeedingHelp: Array<{
    roomId: string;
    boardName: string;
    reason: string;
  }>;
  celebrationPoints: string[];
}
