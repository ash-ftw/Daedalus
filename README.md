# Collaborative AI Whiteboard

MVP implementation for the PRD in `PRD_Collaborative_AI_Whiteboard.md`.

## What Is Built

- React 18 + TypeScript browser whiteboard using Fabric.js.
- Drawing tools for selection, pan, freehand pen, eraser, rectangles, ellipses, diamonds, connectors, text, and sticky notes.
- Room links via `?room=<id>` with live participants, cursor presence, join/leave toasts, and Socket.IO canvas sync.
- Yjs-backed server CRDT state for canvas objects, operation dedupe, and client-side reconnect replay for unsent edits.
- AI Explainer panel with automatic 2.5 second idle analysis, manual analysis, correction suggestions, canvas highlights, and chat.
- Mock AI service that classifies early flowchart and ER diagram structure and returns explain/correct output matching the PRD contract.
- Export to PNG, grid toggle, zoom controls, and local undo/redo snapshots.
- Phase 2 starter features: template library, persisted 30-snapshot version history, classroom help flag, live instructor dashboard, and expanded AI prompts for circuits, UML class diagrams, and state machines.
- Phase 3 starter features: collaborative anchored comments, diagram quality report, instructor Markdown session summary export, Slack webhook share boundary, and LMS/Google Classroom integration status boundaries.
- Production backend boundary with file-local persistence by default, PostgreSQL board storage, Redis presence, and S3-compatible snapshot archival when configured.
- Production auth endpoints for password accounts, refresh tokens, Google/Microsoft OAuth callbacks, board sharing, room-scoped guests, and role enforcement.
- Production AI boundaries for Groq or Anthropic vision analysis, request rate limits, moderation terms, and SSE analysis streaming.
- Billing and runtime hooks for Stripe Checkout/Billing Portal, Prometheus-style metrics, Docker deployment, and production static asset serving.

## Run Locally

```bash
npm.cmd install
npm.cmd run dev
```

Client: `http://127.0.0.1:5173`

API: `http://127.0.0.1:3001`

Use two browser tabs with the same room URL to test collaboration.

Verification commands:

```bash
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Add `&classroom=demo-lab` to a board URL to associate it with a classroom. Open instructor mode with:

```text
http://127.0.0.1:5173?mode=instructor&classroom=demo-lab
```

Instructor mode shows live board thumbnails, opens boards in a side-by-side review pane, can spotlight one board to all active classroom boards, and can download a Markdown summary or bundled ZIP export package. Slack sharing is active with `SLACK_WEBHOOK_URL`; board snapshot uploads are active with `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`.

## Project Structure

```text
client/src/        React app, Fabric canvas, AI panel, collaboration UI
server/src/        Express API, Socket.IO server, board store, persistence adapters
shared/src/        Shared TypeScript contracts for canvas, AI, chat, presence
```

## Environment

Copy `.env.example` to `.env` when you need to override ports or prepare a real AI provider.

Local development persists board state to `data/boards.snapshot.json` by default. For production-style storage, set:

```bash
BOARD_STORAGE=postgres
DATABASE_URL=postgres://user:password@host:5432/daedalus
REDIS_URL=redis://host:6379
S3_BUCKET=your-snapshot-bucket
S3_REGION=us-east-1
S3_PREFIX=whiteboard
```

PostgreSQL stores boards, comments, analyses, chat, and version snapshots. Redis stores live participant presence with a TTL. S3-compatible object storage archives the latest board JSON and version snapshots.

Authentication is optional in local development and enforced when `AUTH_REQUIRED=true`. Production auth uses signed bearer tokens for HTTP and Socket.IO, room-scoped guest tokens, and server-side role checks:

```bash
AUTH_REQUIRED=true
AUTH_JWT_SECRET=replace-with-a-long-random-secret
AUTH_INVITE_SECRET=replace-with-an-invite-issuer-secret
GUEST_TOKEN_TTL_SECONDS=86400
```

Guest tokens are issued with `POST /api/auth/guest-token` by an owner/instructor token or by passing `x-invite-secret` from a trusted invite service. Use `?token=<jwt>` in board URLs or an `Authorization: Bearer <jwt>` header for authenticated API calls.

Account and board sharing endpoints:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
GET  /api/auth/me
GET  /api/auth/oauth/:provider/start
GET  /api/auth/oauth/:provider/callback
POST /api/boards/:roomId/share
POST /api/boards/:roomId/duplicate
```

Real integration endpoints are active when provider credentials are configured:

```text
GET  /api/integrations/canvas/courses/:courseId/roster
POST /api/integrations/canvas/courses/:courseId/assignments/:assignmentId/submissions
GET  /api/integrations/moodle/courses/:courseId/roster
POST /api/integrations/moodle/assignments/:assignmentId/submissions
GET  /api/integrations/google-classroom/courses/:courseId/roster
GET  /api/integrations/google-classroom/courses/:courseId/coursework
POST /api/integrations/slack/share
```

Canvas uses `CANVAS_LMS_BASE_URL` + `CANVAS_LMS_TOKEN`, Moodle uses `MOODLE_BASE_URL` + `MOODLE_TOKEN`, and Google Classroom uses `GOOGLE_CLASSROOM_ACCESS_TOKEN`.

AI can run with `AI_PROVIDER=mock`, `AI_PROVIDER=groq`, or `AI_PROVIDER=anthropic`. `POST /api/ai/analyze/stream` exposes an SSE-compatible analysis boundary. `AI_RATE_LIMIT_PER_MINUTE`, `AI_MAX_IMAGE_BYTES`, and `AI_BLOCKED_TERMS` control rate limiting and moderation behavior.

Billing and runtime endpoints:

```text
POST /api/billing/checkout
POST /api/billing/portal
GET  /metrics
```

Stripe uses `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`. Production containers can be built with the included `Dockerfile`.

The default AI provider is `mock`. To use Groq vision analysis, set:

```bash
AI_PROVIDER=groq
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_API_KEY=your_key_here
```

The server-side AI boundary is isolated in `server/src/ai/` so providers can change without rewriting the canvas UI.

## Next PRD Milestones

1. Validate PostgreSQL, Redis, S3, Stripe, Slack, Anthropic, and OAuth flows against real provider accounts.
2. Run load/performance tests for 25 users per board and 500 boards per server.
3. Expand test coverage beyond the initial auth/AI guardrail unit tests into API, Socket.IO, and browser e2e coverage.
