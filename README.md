# Collaborative AI Whiteboard

MVP implementation for the PRD in `PRD_Collaborative_AI_Whiteboard.md`.

## What Is Built

- React 18 + TypeScript browser whiteboard using Fabric.js.
- Drawing tools for selection, pan, freehand pen, eraser, rectangles, ellipses, diamonds, connectors, text, and sticky notes.
- Room links via `?room=<id>` with live participants, cursor presence, join/leave toasts, and Socket.IO canvas sync.
- AI Explainer panel with automatic 2.5 second idle analysis, manual analysis, correction suggestions, canvas highlights, and chat.
- Mock AI service that classifies early flowchart and ER diagram structure and returns explain/correct output matching the PRD contract.
- Export to PNG, grid toggle, zoom controls, and local undo/redo snapshots.
- Phase 2 starter features: template library, in-memory 10-snapshot version history, classroom help flag, live instructor dashboard, and expanded AI prompts for circuits, UML class diagrams, and state machines.
- Phase 3 starter features: collaborative anchored comments, diagram quality report, instructor Markdown session summary export, Slack webhook share boundary, and LMS/Google Classroom integration status boundaries.

## Run Locally

```bash
npm.cmd install
npm.cmd run dev
```

Client: `http://127.0.0.1:5173`

API: `http://127.0.0.1:3001`

Use two browser tabs with the same room URL to test collaboration.

Add `&classroom=demo-lab` to a board URL to associate it with a classroom. Open instructor mode with:

```text
http://127.0.0.1:5173?mode=instructor&classroom=demo-lab
```

Instructor mode can download a Markdown session summary. Slack sharing is active when `SLACK_WEBHOOK_URL` is set; Canvas LMS, Moodle, and Google Classroom entries expose configuration status for the next OAuth/API implementation pass.

## Project Structure

```text
client/src/        React app, Fabric canvas, AI panel, collaboration UI
server/src/        Express API, Socket.IO server, in-memory board store
shared/src/        Shared TypeScript contracts for canvas, AI, chat, presence
```

## Environment

Copy `.env.example` to `.env` when you need to override ports or prepare a real AI provider.

The default AI provider is `mock`. To use Groq vision analysis, set:

```bash
AI_PROVIDER=groq
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_API_KEY=your_key_here
```

The server-side AI boundary is isolated in `server/src/ai/` so providers can change without rewriting the canvas UI.

## Next PRD Milestones

1. Move board state, comments, and version snapshots from in-memory storage to PostgreSQL.
2. Move presence to Redis and replace last-write sync with Yjs/CRDT semantics.
3. Implement real Canvas LMS, Moodle, and Google Classroom OAuth/API flows.
4. Add SVG/PDF export and Slack snapshot image upload.
5. Add live board thumbnails and side-by-side instructor annotation mode.
