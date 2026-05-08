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
- Phase 4 starter features: AI Lab for diagram-to-code artifacts, auto-layout suggestions/application, preferred explanation language, institution tuning profile, and instructor AI debriefs.
- Phase 5 starter features: durable file-backed board storage for rooms, canvas objects, analyses, chat, comments, versions, and board metadata, with instructor-visible storage status.
- Account-based room flow: students, instructors, or users sign in, create collaboration rooms, reopen accessible rooms, and join rooms by code or invite link.
- Room access control: private/public room visibility, persisted memberships, invite links, owner/editor/viewer/instructor roles, owner rename/archive controls, and server-side edit permission checks.
- Export endpoints and UI for PNG, SVG, PDF board export, plus instructor JSON session packages.

## Run Locally

```bash
npm.cmd install
npm.cmd run dev
```

Client: `http://127.0.0.1:5173`

API: `http://127.0.0.1:3001`

Sign in from the browser landing screen, create a private or public room from the room lobby, then use two browser tabs with the same room URL to test collaboration. Private rooms require membership or an invite link; public rooms can be joined by room code as viewers.

Add `&classroom=demo-lab` to a board URL to associate it with a classroom. Open instructor mode with:

```text
http://127.0.0.1:5173?mode=instructor&classroom=demo-lab
```

Instructor mode can download a Markdown session summary. Slack sharing is active when `SLACK_WEBHOOK_URL` is set; Canvas LMS, Moodle, and Google Classroom entries expose configuration status for the next OAuth/API implementation pass.

The board AI Lab opens from the canvas controls. It can generate SQL, pseudocode, TypeScript, state-machine configs, or implementation notes depending on the latest diagram analysis. It also surfaces auto-layout suggestions and multilingual AI explanation wrappers for English, Spanish, Hindi, and Mandarin.

Board data is persisted to `data/boards.snapshot.json` by default, while login sessions, room ownership, memberships, and invite records are persisted to `data/auth.snapshot.json`. Set `DATABASE_URL` to move board persistence to PostgreSQL; migrations in `server/migrations` are applied on server startup. Set `BOARD_STORE_PERSISTENCE=off` to run memory-only for board state.

Real-time collaboration runs in-process by default. Set `REDIS_URL` to enable the Socket.IO Redis adapter and shared Redis presence snapshots across multiple server instances.

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

Board persistence settings:

```bash
BOARD_STORE_PERSISTENCE=on
BOARD_STORE_PATH=data/boards.snapshot.json
AUTH_STORE_PATH=data/auth.snapshot.json
DATABASE_URL=postgres://user:password@localhost:5432/daedalus
DATABASE_SSL=false
DATABASE_MIGRATIONS_PATH=server/migrations
REDIS_URL=redis://localhost:6379
REDIS_PRESENCE_PREFIX=daedalus:presence
REDIS_PRESENCE_TTL_SECONDS=120
```

Optional institution-specific AI tuning placeholders:

```bash
INSTITUTION_AI_PROFILE=Example University CS101 rubric
INSTITUTION_AI_RUBRIC=Prefer Chen ER notation|Require labeled decision branches|Use beginner-friendly explanations
INSTITUTION_DEFAULT_LANGUAGE=en
```

The server-side AI boundary is isolated in `server/src/ai/` so providers can change without rewriting the canvas UI.

## Next PRD Milestones

1. Replace last-write canvas sync with Yjs/CRDT semantics.
2. Implement real Canvas LMS, Moodle, and Google Classroom OAuth/API flows.
3. Add Slack snapshot image upload.
4. Add side-by-side instructor annotation mode.
5. Move auth/session storage to PostgreSQL as part of the final auth hardening pass.
