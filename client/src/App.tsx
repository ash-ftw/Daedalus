import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fabric } from "fabric";
import { ClipboardCheck, History, LayoutTemplate, MessageSquare, Minus, Plus } from "lucide-react";
import { AiPanel } from "./components/AiPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { InstructorDashboard } from "./components/InstructorDashboard";
import { QualityReportPanel } from "./components/QualityReportPanel";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { Toolbar } from "./components/Toolbar";
import { TopBar } from "./components/TopBar";
import { VersionHistory } from "./components/VersionHistory";
import { API_URL, useBoardSocket, type ToastMessage } from "./hooks/useBoardSocket";
import { boardTemplates } from "../../shared/src/templates";
import type {
  AnalysisIssue,
  BoardTemplate,
  BoardVersionSnapshot,
  CanvasObjectPayload,
  CanvasOperation,
  CursorPayload,
  DrawingTool,
  Participant
} from "../../shared/src/types";

const FABRIC_CUSTOM_PROPS = ["objectId", "objectType", "authorId", "excludeFromExport"];
const PARTICIPANT_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0f766e", "#dc2626"];

type FabricObjectWithMeta = fabric.Object & {
  objectId?: string;
  objectType?: string;
  authorId?: string;
  excludeFromExport?: boolean;
};

const nowIso = () => new Date().toISOString();

function ensureRoomId() {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get("room");

  if (existing) {
    return existing;
  }

  const roomId = crypto.randomUUID().slice(0, 8);
  params.set("room", roomId);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  return roomId;
}

function readClassroomId() {
  return new URLSearchParams(window.location.search).get("classroom") ?? undefined;
}

function isInstructorMode() {
  return new URLSearchParams(window.location.search).get("mode") === "instructor";
}

function createParticipant(): Participant {
  const stored = window.localStorage.getItem("daedalus-participant");

  if (stored) {
    const parsed = JSON.parse(stored) as Participant;
    return {
      ...parsed,
      tool: "select",
      online: true,
      lastActiveAt: nowIso()
    };
  }

  const id = crypto.randomUUID();
  const participant: Participant = {
    id,
    name: `Guest ${id.slice(0, 4)}`,
    color: PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)],
    role: "owner",
    tool: "select",
    online: true,
    joinedAt: nowIso(),
    lastActiveAt: nowIso()
  };

  window.localStorage.setItem("daedalus-participant", JSON.stringify(participant));
  return participant;
}

function isSerializableObject(object: fabric.Object) {
  const objectWithMeta = object as FabricObjectWithMeta;
  return objectWithMeta.objectType !== "analysis-highlight";
}

function objectById(canvas: fabric.Canvas, objectId: string) {
  return canvas.getObjects().find((object) => (object as FabricObjectWithMeta).objectId === objectId) as
    | FabricObjectWithMeta
    | undefined;
}

function BoardApp() {
  const roomId = useMemo(ensureRoomId, []);
  const classroomId = useMemo(readClassroomId, []);
  const participant = useMemo(createParticipant, []);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const activeLineRef = useRef<fabric.Line | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef({ x: 0, y: 0 });
  const lastCursorSentRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const analysisTimerRef = useRef<number | null>(null);
  const didLoadInitialBoardRef = useRef(false);

  const [boardName, setBoardName] = useState("Collaborative AI Whiteboard");
  const [currentTool, setCurrentTool] = useState<DrawingTool>("select");
  const [strokeColor, setStrokeColor] = useState("#1f2937");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [localToasts, setLocalToasts] = useState<ToastMessage[]>([]);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentPlacing, setCommentPlacing] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  const {
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
  } = useBoardSocket(roomId, participant, classroomId);

  const currentToolRef = useRef(currentTool);
  const strokeColorRef = useRef(strokeColor);
  const fillColorRef = useRef(fillColor);
  const strokeWidthRef = useRef(strokeWidth);
  const commentPlacingRef = useRef(commentPlacing);

  useEffect(() => {
    currentToolRef.current = currentTool;
    updateParticipant({ tool: currentTool });
  }, [currentTool, updateParticipant]);

  useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  useEffect(() => {
    fillColorRef.current = fillColor;
  }, [fillColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
    const canvas = fabricRef.current;

    if (canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [strokeWidth]);

  useEffect(() => {
    commentPlacingRef.current = commentPlacing;
  }, [commentPlacing]);

  const showLocalToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setLocalToasts((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => {
      setLocalToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2500);
  }, []);

  useEffect(() => {
    if (!didLoadInitialBoardRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateBoardMeta({ boardName, classroomId });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [boardName, classroomId, updateBoardMeta]);

  const serializeObjects = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return [];
    }

    return canvas
      .getObjects()
      .filter(isSerializableObject)
      .map((object) => {
        const objectWithMeta = object as FabricObjectWithMeta;

        if (!objectWithMeta.objectId) {
          objectWithMeta.objectId = crypto.randomUUID();
        }

        return object.toObject(FABRIC_CUSTOM_PROPS) as CanvasObjectPayload;
      });
  }, []);

  const serializeCanvasImage = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return undefined;
    }

    const previousBackground = canvas.backgroundColor;
    canvas.setBackgroundColor("#ffffff", () => undefined);
    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 1,
      enableRetinaScaling: true
    });
    canvas.setBackgroundColor(previousBackground ?? "", () => undefined);
    canvas.requestRenderAll();
    return dataUrl;
  }, []);

  const updateHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.length > 1);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const pushHistory = useCallback(() => {
    if (isApplyingRemoteRef.current) {
      return;
    }

    const snapshot = JSON.stringify(serializeObjects());
    const lastSnapshot = historyRef.current.at(-1);

    if (snapshot !== lastSnapshot) {
      historyRef.current.push(snapshot);
      historyRef.current = historyRef.current.slice(-100);
      redoRef.current = [];
      updateHistoryFlags();
    }
  }, [serializeObjects, updateHistoryFlags]);

  const sendReplaceOperation = useCallback(
    (objects: CanvasObjectPayload[]) => {
      sendOperation({
        type: "replace",
        userId: participant.id,
        boardVersion: 0,
        objects
      });
    },
    [participant.id, sendOperation]
  );

  const loadObjects = useCallback((objects: CanvasObjectPayload[]) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    isApplyingRemoteRef.current = true;
    canvas.getObjects().forEach((object) => canvas.remove(object));

    if (objects.length === 0) {
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      return;
    }

    fabric.util.enlivenObjects(objects, (enlivenedObjects: fabric.Object[]) => {
      enlivenedObjects.forEach((object: fabric.Object) => {
        canvas.add(object);
      });
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
    }, "fabric");
  }, []);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);

    try {
      await requestAnalysis(serializeObjects(), serializeCanvasImage());
    } finally {
      setIsAnalyzing(false);
    }
  }, [requestAnalysis, serializeCanvasImage, serializeObjects]);

  const runAnalysisRef = useRef(runAnalysis);

  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  const scheduleAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
    }

    analysisTimerRef.current = window.setTimeout(() => {
      void runAnalysisRef.current();
    }, 2500);
  }, []);

  const assignMetadata = useCallback(
    (object: fabric.Object, objectType: string) => {
      const objectWithMeta = object as FabricObjectWithMeta;
      objectWithMeta.objectId = objectWithMeta.objectId ?? crypto.randomUUID();
      objectWithMeta.objectType = objectType;
      objectWithMeta.authorId = participant.id;
      object.set({
        strokeUniform: true,
        selectable: currentToolRef.current === "select"
      });
      return objectWithMeta;
    },
    [participant.id]
  );

  const broadcastObject = useCallback(
    (object: fabric.Object) => {
      const objectWithMeta = object as FabricObjectWithMeta;

      if (!isSerializableObject(object) || !objectWithMeta.objectId) {
        return;
      }

      sendOperation({
        type: "upsert",
        userId: participant.id,
        boardVersion: 0,
        object: object.toObject(FABRIC_CUSTOM_PROPS) as CanvasObjectPayload
      });
    },
    [participant.id, sendOperation]
  );

  const addObjectAndBroadcast = useCallback(
    (object: fabric.Object, objectType: string) => {
      const canvas = fabricRef.current;

      if (!canvas) {
        return;
      }

      assignMetadata(object, objectType);
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      broadcastObject(object);
      pushHistory();
      scheduleAnalysis();
    },
    [assignMetadata, broadcastObject, pushHistory, scheduleAnalysis]
  );

  const createShapeAt = useCallback(
    (tool: DrawingTool, pointer: fabric.Point) => {
      const stroke = strokeColorRef.current;
      const fill = fillColorRef.current;
      const width = strokeWidthRef.current;

      if (tool === "rectangle") {
        addObjectAndBroadcast(
          new fabric.Rect({
            left: pointer.x - 64,
            top: pointer.y - 38,
            width: 128,
            height: 76,
            rx: 4,
            ry: 4,
            fill,
            stroke,
            strokeWidth: width
          }),
          "rectangle"
        );
      }

      if (tool === "ellipse") {
        addObjectAndBroadcast(
          new fabric.Ellipse({
            left: pointer.x - 64,
            top: pointer.y - 38,
            rx: 64,
            ry: 38,
            fill,
            stroke,
            strokeWidth: width
          }),
          "ellipse"
        );
      }

      if (tool === "diamond") {
        addObjectAndBroadcast(
          new fabric.Polygon(
            [
              { x: 64, y: 0 },
              { x: 128, y: 42 },
              { x: 64, y: 84 },
              { x: 0, y: 42 }
            ],
            {
              left: pointer.x - 64,
              top: pointer.y - 42,
              fill,
              stroke,
              strokeWidth: width
            }
          ),
          "diamond"
        );
      }

      if (tool === "text") {
        const text = new fabric.IText("Label", {
          left: pointer.x,
          top: pointer.y,
          fill: stroke,
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 18
        });
        addObjectAndBroadcast(text, "text");
        text.enterEditing();
        text.selectAll();
      }

      if (tool === "sticky") {
        addObjectAndBroadcast(
          new fabric.Textbox("Sticky note", {
            left: pointer.x,
            top: pointer.y,
            width: 160,
            backgroundColor: "#fff3a3",
            fill: "#3f3414",
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: 16,
            padding: 12
          }),
          "sticky"
        );
      }
    },
    [addObjectAndBroadcast]
  );

  const clearHighlights = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    canvas
      .getObjects()
      .filter((object) => (object as FabricObjectWithMeta).objectType === "analysis-highlight")
      .forEach((object) => canvas.remove(object));
    canvas.requestRenderAll();
  }, []);

  const drawHighlightForObject = useCallback((objectId: string) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const target = objectById(canvas, objectId);

    if (!target) {
      return;
    }

    const bounds = target.getBoundingRect(true, true);
    const highlight = new fabric.Rect({
      left: bounds.left - 6,
      top: bounds.top - 6,
      width: bounds.width + 12,
      height: bounds.height + 12,
      fill: "rgba(245, 158, 11, 0.12)",
      stroke: "#f59e0b",
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true
    }) as FabricObjectWithMeta;

    highlight.objectId = crypto.randomUUID();
    highlight.objectType = "analysis-highlight";
    canvas.add(highlight);
    highlight.bringToFront();
  }, []);

  useEffect(() => {
    if (!canvasReady) {
      return;
    }

    clearHighlights();

    if (!highlightEnabled || !analysis) {
      return;
    }

    const issueObjectIds = analysis.issues.flatMap((issue) => issue.objectIds);
    const componentObjectIds = analysis.components.map((component) => component.objectId).filter(Boolean) as string[];
    const ids = new Set(issueObjectIds.length > 0 ? issueObjectIds : componentObjectIds);

    ids.forEach(drawHighlightForObject);
    fabricRef.current?.requestRenderAll();
  }, [analysis, canvasReady, clearHighlights, drawHighlightForObject, highlightEnabled]);

  useEffect(() => {
    const canvasElement = canvasElementRef.current;
    const host = canvasHostRef.current;

    if (!canvasElement || !host) {
      return;
    }

    const canvas = new fabric.Canvas(canvasElement, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: ""
    });
    fabricRef.current = canvas;
    historyRef.current = [JSON.stringify([])];
    updateHistoryFlags();

    const resizeCanvas = () => {
      const rect = host.getBoundingClientRect();
      canvas.setDimensions({
        width: rect.width,
        height: rect.height
      });
      canvas.calcOffset();
      canvas.requestRenderAll();
      setViewportRevision((revision) => revision + 1);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(host);
    resizeCanvas();

    canvas.freeDrawingBrush.color = strokeColorRef.current;
    canvas.freeDrawingBrush.width = strokeWidthRef.current;

    const updateSelectionMode = () => {
      const tool = currentToolRef.current;
      canvas.isDrawingMode = tool === "pen";
      canvas.selection = tool === "select";
      canvas.defaultCursor = tool === "pan" ? "grab" : "crosshair";
      canvas.getObjects().forEach((object) => {
        object.selectable = tool === "select";
        object.evented = tool === "select" || tool === "eraser";
      });
    };

    const handlePathCreated = (event: fabric.IEvent<MouseEvent>) => {
      const path = (event as fabric.IEvent<MouseEvent> & { path?: fabric.Path }).path;

      if (!path) {
        return;
      }

      assignMetadata(path, "stroke");
      broadcastObject(path);
      pushHistory();
      scheduleAnalysis();
    };

    const handleObjectModified = (event: fabric.IEvent<Event>) => {
      if (isApplyingRemoteRef.current || !event.target || !isSerializableObject(event.target)) {
        return;
      }

      assignMetadata(event.target, (event.target as FabricObjectWithMeta).objectType ?? "object");
      broadcastObject(event.target);
      pushHistory();
      scheduleAnalysis();
    };

    const handleMouseDown = (event: fabric.IEvent<MouseEvent>) => {
      updateSelectionMode();
      const tool = currentToolRef.current;
      const pointer = canvas.getPointer(event.e);

      if (commentPlacingRef.current) {
        const body = window.prompt("Comment");

        if (body?.trim()) {
          createComment({
            authorId: participant.id,
            authorName: participant.name,
            body: body.trim(),
            anchor: {
              x: pointer.x,
              y: pointer.y,
              width: 160,
              height: 96
            }
          });
        }

        setCommentPlacing(false);
        return;
      }

      if (tool === "pan") {
        isPanningRef.current = true;
        lastPanPointRef.current = {
          x: event.e.clientX,
          y: event.e.clientY
        };
        canvas.defaultCursor = "grabbing";
        return;
      }

      if (tool === "eraser") {
        const target = canvas.findTarget(event.e, false) as FabricObjectWithMeta | undefined;

        if (target && isSerializableObject(target)) {
          const objectId = target.objectId;
          canvas.remove(target);

          if (objectId) {
            sendOperation({
              type: "delete",
              userId: participant.id,
              boardVersion: 0,
              objectId
            });
          }

          pushHistory();
          scheduleAnalysis();
        }

        return;
      }

      if (["rectangle", "ellipse", "diamond", "text", "sticky"].includes(tool)) {
        createShapeAt(tool, new fabric.Point(pointer.x, pointer.y));
        return;
      }

      if (tool === "connector") {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          strokeLineCap: "round",
          strokeUniform: true,
          selectable: false
        });
        assignMetadata(line, "connector");
        activeLineRef.current = line;
        canvas.add(line);
      }
    };

    const handleMouseMove = (event: fabric.IEvent<MouseEvent>) => {
      const pointer = canvas.getPointer(event.e);
      const timestamp = Date.now();

      if (timestamp - lastCursorSentRef.current > 40) {
        const cursor: CursorPayload = {
          userId: participant.id,
          name: participant.name,
          color: participant.color,
          tool: currentToolRef.current,
          x: pointer.x,
          y: pointer.y
        };
        sendCursor(cursor);
        lastCursorSentRef.current = timestamp;
      }

      if (isPanningRef.current) {
        const transform = canvas.viewportTransform;

        if (transform) {
          transform[4] += event.e.clientX - lastPanPointRef.current.x;
          transform[5] += event.e.clientY - lastPanPointRef.current.y;
          canvas.requestRenderAll();
          setViewportRevision((revision) => revision + 1);
        }

        lastPanPointRef.current = {
          x: event.e.clientX,
          y: event.e.clientY
        };
        return;
      }

      const line = activeLineRef.current;

      if (line) {
        line.set({
          x2: pointer.x,
          y2: pointer.y
        });
        line.setCoords();
        canvas.requestRenderAll();
      }
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvas.defaultCursor = "grab";
      }

      const line = activeLineRef.current;

      if (line) {
        activeLineRef.current = null;
        const length = Math.hypot((line.x2 ?? 0) - (line.x1 ?? 0), (line.y2 ?? 0) - (line.y1 ?? 0));

        if (length < 8) {
          canvas.remove(line);
        } else {
          broadcastObject(line);
          pushHistory();
          scheduleAnalysis();
        }
      }
    };

    const handleWheel = (event: fabric.IEvent<WheelEvent>) => {
      event.e.preventDefault();
      event.e.stopPropagation();
      let nextZoom = canvas.getZoom() * 0.999 ** event.e.deltaY;
      nextZoom = Math.min(2.4, Math.max(0.35, nextZoom));
      canvas.zoomToPoint(new fabric.Point(event.e.offsetX, event.e.offsetY), nextZoom);
      setZoom(Math.round(nextZoom * 100));
      setViewportRevision((revision) => revision + 1);
    };

    canvas.on("path:created", handlePathCreated);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);
    canvas.on("mouse:wheel", handleWheel);

    setCanvasReady(true);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      fabricRef.current = null;
      setCanvasReady(false);
    };
  }, [
    assignMetadata,
    broadcastObject,
    createShapeAt,
    createComment,
    participant.color,
    participant.id,
    participant.name,
    pushHistory,
    scheduleAnalysis,
    sendCursor,
    sendOperation,
    updateHistoryFlags
  ]);

  useEffect(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    canvas.isDrawingMode = currentTool === "pen";
    canvas.selection = currentTool === "select";
    canvas.defaultCursor = currentTool === "pan" ? "grab" : currentTool === "select" ? "default" : "crosshair";

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = strokeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    }

    canvas.getObjects().forEach((object) => {
      const isHighlight = (object as FabricObjectWithMeta).objectType === "analysis-highlight";
      object.selectable = !isHighlight && currentTool === "select";
      object.evented = !isHighlight && (currentTool === "select" || currentTool === "eraser");
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [currentTool, strokeColor, strokeWidth]);

  useEffect(() => {
    if (!canvasReady || !boardState || didLoadInitialBoardRef.current) {
      return;
    }

    setBoardName(boardState.boardName === "Untitled board" ? "Collaborative AI Whiteboard" : boardState.boardName);
    loadObjects(boardState.objects);
    historyRef.current = [JSON.stringify(boardState.objects)];
    redoRef.current = [];
    updateHistoryFlags();
    didLoadInitialBoardRef.current = true;
  }, [boardState, canvasReady, loadObjects, updateHistoryFlags]);

  useEffect(() => {
    if (!boardState?.boardName || boardState.boardName === "Untitled board") {
      return;
    }

    setBoardName((current) => (current === boardState.boardName ? current : boardState.boardName));
  }, [boardState?.boardName]);

  useEffect(() => {
    const canvas = fabricRef.current;

    if (!canvasReady || !canvas || !remoteOperation) {
      return;
    }

    if (remoteOperation.userId === participant.id) {
      return;
    }

    isApplyingRemoteRef.current = true;

    if (remoteOperation.type === "replace") {
      loadObjects(remoteOperation.objects);
      scheduleAnalysis();
      return;
    }

    if (remoteOperation.type === "clear") {
      canvas.getObjects().filter(isSerializableObject).forEach((object) => canvas.remove(object));
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
      return;
    }

    if (remoteOperation.type === "delete") {
      const target = objectById(canvas, remoteOperation.objectId);

      if (target) {
        canvas.remove(target);
      }

      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
      return;
    }

    const existing = objectById(canvas, remoteOperation.object.objectId);

    if (existing) {
      canvas.remove(existing);
    }

    fabric.util.enlivenObjects([remoteOperation.object], ([object]: fabric.Object[]) => {
      canvas.add(object);
      canvas.requestRenderAll();
      isApplyingRemoteRef.current = false;
      scheduleAnalysis();
    }, "fabric");
  }, [canvasReady, loadObjects, participant.id, remoteOperation, scheduleAnalysis]);

  const undo = useCallback(() => {
    if (historyRef.current.length <= 1) {
      return;
    }

    const currentSnapshot = historyRef.current.pop();
    const previousSnapshot = historyRef.current.at(-1);

    if (!currentSnapshot || !previousSnapshot) {
      return;
    }

    redoRef.current.push(currentSnapshot);
    const objects = JSON.parse(previousSnapshot) as CanvasObjectPayload[];
    loadObjects(objects);
    sendReplaceOperation(objects);
    updateHistoryFlags();
    scheduleAnalysis();
  }, [loadObjects, scheduleAnalysis, sendReplaceOperation, updateHistoryFlags]);

  const redo = useCallback(() => {
    const nextSnapshot = redoRef.current.pop();

    if (!nextSnapshot) {
      return;
    }

    historyRef.current.push(nextSnapshot);
    const objects = JSON.parse(nextSnapshot) as CanvasObjectPayload[];
    loadObjects(objects);
    sendReplaceOperation(objects);
    updateHistoryFlags();
    scheduleAnalysis();
  }, [loadObjects, scheduleAnalysis, sendReplaceOperation, updateHistoryFlags]);

  const exportPng = useCallback(() => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 2,
      enableRetinaScaling: true
    });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${boardName.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "whiteboard"}.png`;
    link.click();
  }, [boardName]);

  const openDashboard = useCallback(() => {
    const params = new URLSearchParams();
    params.set("mode", "instructor");

    if (classroomId) {
      params.set("classroom", classroomId);
    }

    window.location.href = `${window.location.pathname}?${params.toString()}`;
  }, [classroomId]);

  const shareBoard = useCallback(() => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => showLocalToast("Share link copied"))
      .catch(() => showLocalToast("Copy failed; use the address bar link"));
  }, [showLocalToast]);

  const setZoomLevel = useCallback((nextZoomPercent: number) => {
    const canvas = fabricRef.current;

    if (!canvas) {
      return;
    }

    const nextZoom = Math.min(240, Math.max(35, nextZoomPercent)) / 100;
    canvas.zoomToPoint(new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2), nextZoom);
    setZoom(Math.round(nextZoom * 100));
    setViewportRevision((revision) => revision + 1);
  }, []);

  const cloneTemplateObjects = useCallback(
    (template: BoardTemplate) =>
      template.objects.map((object) => ({
        ...(JSON.parse(JSON.stringify(object)) as CanvasObjectPayload),
        objectId: `${template.id}-${crypto.randomUUID()}`,
        authorId: participant.id
      })),
    [participant.id]
  );

  const applyTemplate = useCallback(
    (template: BoardTemplate) => {
      const objects = cloneTemplateObjects(template);
      loadObjects(objects);
      sendReplaceOperation(objects);
      historyRef.current.push(JSON.stringify(objects));
      historyRef.current = historyRef.current.slice(-100);
      redoRef.current = [];
      updateHistoryFlags();
      setTemplatesOpen(false);
      scheduleAnalysis();
      showLocalToast(`${template.name} loaded`);
    },
    [cloneTemplateObjects, loadObjects, scheduleAnalysis, sendReplaceOperation, showLocalToast, updateHistoryFlags]
  );

  const restoreVersion = useCallback(
    async (snapshot: BoardVersionSnapshot) => {
      const response = await fetch(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/restore/${encodeURIComponent(snapshot.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: participant.id })
      });

      if (!response.ok) {
        showLocalToast("Version restore failed");
        return;
      }

      const operation = (await response.json()) as CanvasOperation;

      if (operation.type === "replace") {
        loadObjects(operation.objects);
        historyRef.current.push(JSON.stringify(operation.objects));
        historyRef.current = historyRef.current.slice(-100);
        redoRef.current = [];
        updateHistoryFlags();
      }

      setHistoryOpen(false);
      scheduleAnalysis();
      showLocalToast(`Restored ${snapshot.label}`);
    },
    [loadObjects, participant.id, roomId, scheduleAnalysis, showLocalToast, updateHistoryFlags]
  );

  const toggleHelpRequested = useCallback(() => {
    const nextValue = !(boardState?.helpRequested ?? false);
    updateBoardMeta({ helpRequested: nextValue });
    showLocalToast(nextValue ? "Instructor help requested" : "Help request cleared");
  }, [boardState?.helpRequested, showLocalToast, updateBoardMeta]);

  const resolveComment = useCallback(
    (commentId: string) => {
      updateComment(commentId, { resolved: true });
      showLocalToast("Comment resolved");
    },
    [showLocalToast, updateComment]
  );

  const acceptSuggestion = useCallback(
    (issue: AnalysisIssue) => {
      const canvas = fabricRef.current;

      if (!canvas) {
        return;
      }

      const target = issue.objectIds[0] ? objectById(canvas, issue.objectIds[0]) : undefined;
      const bounds = target?.getBoundingRect(true, true);
      const note = new fabric.Textbox(`AI note: ${issue.suggestion}`, {
        left: (bounds?.left ?? 80) + (bounds?.width ?? 80) + 18,
        top: bounds?.top ?? 80,
        width: 220,
        backgroundColor: "#fff7c2",
        fill: "#3d3215",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 14,
        padding: 10
      });

      addObjectAndBroadcast(note, "sticky");
      setDismissedIssues((current) => new Set([...current, issue.id]));
      showLocalToast("Suggestion annotated on canvas");
    },
    [addObjectAndBroadcast, showLocalToast]
  );

  const dismissIssue = useCallback((issueId: string) => {
    setDismissedIssues((current) => new Set([...current, issueId]));
  }, []);

  const handleChat = useCallback(
    (message: string) => {
      sendChat(message, serializeObjects(), serializeCanvasImage());
    },
    [sendChat, serializeCanvasImage, serializeObjects]
  );

  const projectedCursors = useMemo(() => {
    const canvas = fabricRef.current;
    const transform = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];

    return Object.values(remoteCursors).map((cursor) => ({
      ...cursor,
      screenX: cursor.x * transform[0] + transform[4],
      screenY: cursor.y * transform[3] + transform[5]
    }));
  }, [remoteCursors, viewportRevision]);

  const projectedComments = useMemo(() => {
    const canvas = fabricRef.current;
    const transform = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];

    return comments
      .filter((comment) => !comment.resolved)
      .map((comment) => ({
        ...comment,
        screenX: comment.anchor.x * transform[0] + transform[4],
        screenY: comment.anchor.y * transform[3] + transform[5]
      }));
  }, [comments, viewportRevision]);

  const allToasts = [...toasts, ...localToasts];

  return (
    <div className="app-shell">
      <TopBar
        boardName={boardName}
        classroomId={classroomId}
        connectionStatus={connectionStatus}
        helpRequested={boardState?.helpRequested ?? false}
        onBoardNameChange={setBoardName}
        onDashboardOpen={openDashboard}
        onExportPng={exportPng}
        onHelpToggle={toggleHelpRequested}
        onShare={shareBoard}
        participants={participants}
      />

      <main className="workspace">
        <Toolbar
          canRedo={canRedo}
          canUndo={canUndo}
          currentTool={currentTool}
          fillColor={fillColor}
          gridEnabled={gridEnabled}
          onFillColorChange={setFillColor}
          onGridToggle={() => setGridEnabled((enabled) => !enabled)}
          onRedo={redo}
          onStrokeColorChange={setStrokeColor}
          onStrokeWidthChange={setStrokeWidth}
          onToolChange={setCurrentTool}
          onUndo={undo}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
        />

        <section className={gridEnabled ? "canvas-stage grid-enabled" : "canvas-stage"} ref={canvasHostRef}>
          <canvas ref={canvasElementRef} />
          <div className="phase2-controls">
            <button className="text-button" onClick={() => setTemplatesOpen(true)} type="button">
              <LayoutTemplate size={16} />
              Templates
            </button>
            <button className="text-button" onClick={() => setHistoryOpen(true)} type="button">
              <History size={16} />
              History
            </button>
            <button className="text-button" onClick={() => setCommentsOpen(true)} type="button">
              <MessageSquare size={16} />
              Comments
            </button>
            <button className="text-button" onClick={() => setQualityOpen(true)} type="button">
              <ClipboardCheck size={16} />
              Quality
            </button>
          </div>
          <div className="comment-layer">
            {projectedComments.map((comment) => (
              <button
                className="comment-marker"
                key={comment.id}
                onClick={() => setCommentsOpen(true)}
                style={{
                  left: `${comment.screenX}px`,
                  top: `${comment.screenY}px`
                }}
                title={comment.body}
                type="button"
              >
                <MessageSquare size={15} />
              </button>
            ))}
          </div>
          <div className="cursor-layer" aria-hidden="true">
            {projectedCursors.map((cursor) => (
              <div
                className="remote-cursor"
                key={cursor.userId}
                style={{
                  left: `${cursor.screenX}px`,
                  top: `${cursor.screenY}px`,
                  color: cursor.color
                }}
              >
                <span className="cursor-arrow" />
                <span className="cursor-label" style={{ backgroundColor: cursor.color }}>
                  {cursor.name} - {cursor.tool}
                </span>
              </div>
            ))}
          </div>

          <div className="bottom-bar">
            <button className="icon-button" onClick={() => setZoomLevel(zoom - 10)} title="Zoom out" type="button">
              <Minus size={16} />
            </button>
            <span>{zoom}%</span>
            <button className="icon-button" onClick={() => setZoomLevel(zoom + 10)} title="Zoom in" type="button">
              <Plus size={16} />
            </button>
          </div>
          <TemplateLibrary open={templatesOpen} templates={boardTemplates} onApply={applyTemplate} onClose={() => setTemplatesOpen(false)} />
          <VersionHistory
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreVersion}
            open={historyOpen}
            versions={boardState?.versions ?? []}
          />
          <CommentsPanel
            comments={comments}
            onClose={() => setCommentsOpen(false)}
            onResolve={resolveComment}
            onStartPlacing={() => {
              setCommentPlacing(true);
              setCommentsOpen(false);
            }}
            open={commentsOpen}
            placing={commentPlacing}
          />
          <QualityReportPanel onClose={() => setQualityOpen(false)} open={qualityOpen} roomId={roomId} />
        </section>

        <AiPanel
          analysis={analysis}
          chat={chat}
          dismissedIssues={dismissedIssues}
          highlightEnabled={highlightEnabled}
          isAnalyzing={isAnalyzing}
          onAcceptSuggestion={acceptSuggestion}
          onAnalyze={() => void runAnalysis()}
          onChat={handleChat}
          onDismissIssue={dismissIssue}
          onToggleHighlight={() => setHighlightEnabled((enabled) => !enabled)}
        />
      </main>

      <div className="toast-stack" aria-live="polite">
        {allToasts.map((toast) => (
          <div className="toast" key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return isInstructorMode() ? <InstructorDashboard /> : <BoardApp />;
}
