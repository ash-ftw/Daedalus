import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AnalysisResult,
  BoardSnapshot,
  BoardComment,
  CanvasObjectPayload,
  CanvasOperation,
  ChatMessage,
  CursorPayload,
  Participant
} from "../../../shared/src/types";
import { getAuthToken } from "../auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export interface ToastMessage {
  id: string;
  message: string;
}

export interface RemoteCursor extends CursorPayload {
  seenAt: number;
}

export function useBoardSocket(roomId: string, participant: Participant, classroomId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const boardVersionRef = useRef(0);
  const pendingOperationsRef = useRef<CanvasOperation[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [boardState, setBoardState] = useState<BoardSnapshot | null>(null);
  const [remoteOperation, setRemoteOperation] = useState<CanvasOperation | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});

  const pushToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-3), { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const emitOperation = useCallback((socket: Socket, operation: CanvasOperation) => {
    socket.emit("canvas-operation", operation);
  }, []);

  const flushPendingOperations = useCallback(() => {
    const socket = socketRef.current;

    if (!socket?.connected || pendingOperationsRef.current.length === 0) {
      return;
    }

    const pending = pendingOperationsRef.current;
    pendingOperationsRef.current = [];
    pending.forEach((operation) => emitOperation(socket, operation));
  }, [emitOperation]);

  useEffect(() => {
    const socket = io(API_URL, {
      auth: {
        token: getAuthToken()
      },
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("join-board", { roomId, participant, classroomId });
      window.setTimeout(flushPendingOperations, 0);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("offline");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("offline");
    });

    socket.on("board-state", (state: BoardSnapshot) => {
      boardVersionRef.current = state.version;
      setBoardState(state);
      setParticipants(state.participants);
      setAnalysis(state.analyses.at(-1) ?? null);
      setChat(state.chat);
      setComments(state.comments);
    });

    socket.on("canvas-operation", (operation: CanvasOperation) => {
      setRemoteOperation(operation);
    });

    socket.on("participants-updated", (updated: Participant[]) => {
      setParticipants(updated);
    });

    socket.on("cursor-update", (cursor: CursorPayload) => {
      if (cursor.userId === participant.id) {
        return;
      }

      setRemoteCursors((current) => ({
        ...current,
        [cursor.userId]: {
          ...cursor,
          seenAt: Date.now()
        }
      }));
    });

    socket.on("ai-analysis", (result: AnalysisResult) => {
      setAnalysis(result);
    });

    socket.on("chat-message", (message: ChatMessage) => {
      setChat((current) => [...current, message].slice(-100));
    });

    socket.on("comments-updated", (updated: BoardComment[]) => {
      setComments(updated);
    });

    socket.on("toast", pushToast);

    socket.on("spotlight-board", (payload: { boardName?: string }) => {
      pushToast(`Instructor spotlight: ${payload.boardName ?? "student board"}`);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [classroomId, flushPendingOperations, participant, pushToast, roomId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const cutoff = Date.now() - 5000;
      setRemoteCursors((current) =>
        Object.fromEntries(Object.entries(current).filter(([, cursor]) => cursor.seenAt > cutoff))
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const sendOperation = useCallback((operation: CanvasOperation) => {
    const operationWithMetadata: CanvasOperation = {
      ...operation,
      operationId: operation.operationId ?? crypto.randomUUID(),
      clientTimestamp: operation.clientTimestamp ?? new Date().toISOString(),
      baseVersion: operation.baseVersion ?? boardVersionRef.current
    };
    const socket = socketRef.current;

    if (!socket?.connected) {
      pendingOperationsRef.current = [...pendingOperationsRef.current, operationWithMetadata].slice(-500);
      setConnectionStatus("offline");
      return;
    }

    emitOperation(socket, operationWithMetadata);
  }, [emitOperation]);

  const sendCursor = useCallback((cursor: CursorPayload) => {
    socketRef.current?.emit("cursor-update", cursor);
  }, []);

  const requestAnalysis = useCallback(
    (objects: CanvasObjectPayload[], imageDataUrl?: string) =>
      new Promise<AnalysisResult | null>((resolve) => {
        const socket = socketRef.current;

        if (!socket?.connected) {
          resolve(null);
          return;
        }

        socket.emit("request-analysis", { roomId, objects, imageDataUrl }, (result: AnalysisResult) => {
          setAnalysis(result);
          resolve(result);
        });
      }),
    [roomId]
  );

  const sendChat = useCallback(
    (content: string, objects: CanvasObjectPayload[], imageDataUrl?: string) => {
      socketRef.current?.emit("ai-chat", {
        roomId,
        content,
        authorName: participant.name,
        objects,
        imageDataUrl
      });
    },
    [participant.name, roomId]
  );

  const updateParticipant = useCallback((patch: Partial<Participant>) => {
    socketRef.current?.emit("participant-update", patch);
  }, []);

  const updateBoardMeta = useCallback((patch: { boardName?: string; classroomId?: string; tags?: string[]; helpRequested?: boolean }) => {
    socketRef.current?.emit("board-meta-update", patch);
  }, []);

  const createComment = useCallback((comment: Omit<BoardComment, "id" | "roomId" | "resolved" | "createdAt" | "updatedAt">) => {
    socketRef.current?.emit("comment-create", comment);
  }, []);

  const updateComment = useCallback((commentId: string, patch: { body?: string; resolved?: boolean }) => {
    socketRef.current?.emit("comment-update", { commentId, ...patch });
  }, []);

  return {
    analysis,
    boardState,
    chat,
    comments,
    connectionStatus,
    participants,
    remoteCursors,
    remoteOperation,
    requestAnalysis,
    sendChat,
    sendCursor,
    sendOperation,
    toasts,
    createComment,
    updateBoardMeta,
    updateComment,
    updateParticipant
  };
}
