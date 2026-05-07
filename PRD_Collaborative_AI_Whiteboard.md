# Product Requirements Document
## Collaborative Whiteboard with AI Explainer

---

**Document Version:** 1.0  
**Status:** Draft  
**Owner:** Product Team  
**Last Updated:** May 2026  
**Classification:** Internal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Personas](#4-user-personas)
5. [Scope & Non-Scope](#5-scope--non-scope)
6. [Feature Requirements](#6-feature-requirements)
7. [User Stories & Acceptance Criteria](#7-user-stories--acceptance-criteria)
8. [System Architecture](#8-system-architecture)
9. [Technical Requirements](#9-technical-requirements)
10. [UI/UX Requirements](#10-uiux-requirements)
11. [AI Model Requirements](#11-ai-model-requirements)
12. [Real-Time Collaboration Requirements](#12-real-time-collaboration-requirements)
13. [Security & Privacy](#13-security--privacy)
14. [Performance Requirements](#14-performance-requirements)
15. [Integrations](#15-integrations)
16. [Phased Rollout Plan](#16-phased-rollout-plan)
17. [Risks & Mitigations](#17-risks--mitigations)
18. [Open Questions](#18-open-questions)
19. [Appendix](#19-appendix)

---

## 1. Executive Summary

**Collaborative Whiteboard with AI Explainer** is a real-time, browser-based shared whiteboard platform designed for educational and professional settings. Users can sketch technical diagrams — including flowcharts, entity-relationship (ER) diagrams, circuit diagrams, UML class diagrams, and more — while an embedded AI co-pilot continuously observes the canvas, identifies what is being drawn, provides contextual explanations, and proactively suggests corrections or improvements.

The platform combines the immediacy of real-time collaboration (multiple participants sketching simultaneously) with the intelligence of a vision-capable AI layer that acts as an always-on tutor or reviewer. It is primarily targeted at engineering students, university instructors, and technical teams conducting design reviews.

---

## 2. Problem Statement

### 2.1 Context

Technical diagramming is a cornerstone of CS, ECE, and engineering education. Students regularly draw flowcharts to model algorithms, ER diagrams for database design, and circuit diagrams for hardware courses. Despite its importance, the activity suffers from several well-known pain points:

- **Delayed feedback:** Instructors review diagrams asynchronously (after submission), giving students no opportunity to fix errors before bad habits form.
- **Isolated iteration:** Students working alone have no sounding board to check whether their diagram is logically correct, well-structured, or following notation conventions.
- **Fragmented tooling:** Existing tools (Miro, FigJam, draw.io) offer collaboration but no intelligence; AI chat tools (ChatGPT, Claude) offer intelligence but no live canvas integration.
- **Notation errors:** Students frequently mix notations (e.g., using crow's foot and Chen notation in the same ER diagram), producing diagrams that are technically ambiguous.

### 2.2 The Gap

No existing product combines **real-time multi-user sketching** with **instant AI-powered diagram identification, explanation, and correction** in a single, seamless interface. This gap causes slower learning, more grading burden on instructors, and lower confidence among students.

---

## 3. Goals & Success Metrics

### 3.1 Primary Goals

| Goal | Description |
|------|-------------|
| Accelerate learning | Reduce time-to-understanding of technical diagram concepts |
| Surface errors early | Help students identify and fix notation/logic errors before submission |
| Enable collaborative review | Let teams review system designs and database schemas together in real time |
| Scale instructor attention | Allow one instructor to support many students simultaneously via AI augmentation |

### 3.2 Success Metrics (OKRs)

**Objective 1: Drive adoption in educational settings**
- KR1: 10,000 active monthly users within 6 months of launch
- KR2: Average session length ≥ 25 minutes
- KR3: ≥ 60% of sessions involve 2+ simultaneous participants

**Objective 2: Deliver high-quality AI assistance**
- KR1: AI diagram identification accuracy ≥ 88% across supported diagram types
- KR2: AI explanation rated "helpful" or "very helpful" by ≥ 80% of users (in-app rating)
- KR3: AI correction suggestions accepted (not dismissed) in ≥ 55% of cases

**Objective 3: Performance and reliability**
- KR1: Canvas sync latency ≤ 100ms (P95) for collaborative edits
- KR2: AI response time ≤ 3 seconds (P90) from stroke completion
- KR3: Platform uptime ≥ 99.5% monthly

---

## 4. User Personas

### 4.1 Priya — The Engineering Student
- **Age:** 21 | Junior CS student
- **Context:** Works on database design assignments and algorithm flowcharts, often in study groups
- **Goals:** Get quick feedback on her ER diagrams, understand why her design is wrong, not just that it is wrong
- **Pain Points:** Waits days for TA feedback; unsure if notation is correct; Zoom + Miro is clunky
- **Tech Comfort:** High — uses VS Code, Figma, Discord daily

### 4.2 Dr. Arjun — The Instructor
- **Age:** 45 | Associate Professor, Computer Engineering
- **Context:** Runs weekly lab sessions where students submit circuit and logic diagrams
- **Goals:** Monitor 30 students' progress simultaneously; inject targeted hints without grading everything manually
- **Pain Points:** Can't be in 30 places at once; AI tools his students use often give wrong circuit theory explanations
- **Tech Comfort:** Moderate — uses PowerPoint and LMS, open to new tools if they're reliable

### 4.3 Sofia — The Startup Engineer
- **Age:** 29 | Backend Engineer at a series-A startup
- **Context:** Participates in remote system design reviews; sketches microservice architecture and DB schemas during meetings
- **Goals:** Quickly validate DB schema designs with teammates; get AI sanity checks on system architecture decisions
- **Pain Points:** Existing whiteboards require one person to "share screen"; no structured feedback on design quality
- **Tech Comfort:** Very high — uses Notion, Miro, Figma, GitHub daily

### 4.4 Marcus — The Solo Learner
- **Age:** 17 | High school student prepping for CS olympiads
- **Context:** Self-studying algorithms and data structures, practices sketching flowcharts and pseudocode diagrams
- **Goals:** Understand what he's drawing, learn correct notation, get hints when stuck
- **Pain Points:** No peers or teachers to review his work; online resources are static
- **Tech Comfort:** High for a student — uses YouTube, Khan Academy, LeetCode

---

## 5. Scope & Non-Scope

### 5.1 In Scope (v1.0)

- Browser-based infinite canvas with freehand and shape drawing tools
- Real-time multi-user collaboration (up to 25 simultaneous participants per board)
- AI diagram identification for: flowcharts, ER diagrams, circuit diagrams, UML class diagrams, state machine diagrams
- AI explanation panel that describes what was drawn and explains its components
- AI correction/suggestion panel highlighting notation errors with fix suggestions
- Session rooms with shareable links (no account required for guests)
- Board history / version snapshots (last 30 versions)
- Export to PNG, SVG, and PDF
- Text annotations and sticky notes on canvas
- Instructor mode with oversight dashboard (view all student boards in a grid)

### 5.2 Out of Scope (v1.0, considered for future)

- Mobile native apps (iOS/Android) — browser only for v1.0
- Offline mode / local-first sync
- AI auto-drawing (AI draws the diagram for you based on text prompt)
- Integration with LMS platforms (Canvas, Moodle) — planned for v2.0
- Voice/audio commentary during sessions
- Diagram-to-code generation (planned for v2.0)
- Support for hardware description languages (VHDL, Verilog) visualization
- Custom AI fine-tuning per institution

---

## 6. Feature Requirements

### 6.1 Canvas & Drawing Tools

| Feature | Priority | Description |
|---------|----------|-------------|
| Infinite canvas | P0 | Pannable/zoomable canvas with no fixed boundaries |
| Freehand pen | P0 | Smooth, pressure-sensitive freehand strokes |
| Shape library | P0 | Pre-built shapes for flowchart, ER, circuit, and UML elements |
| Selection & move | P0 | Select, resize, rotate, group objects |
| Undo/Redo | P0 | Multi-step undo/redo (up to 100 steps) |
| Text tool | P0 | Add labels and annotations anywhere on canvas |
| Color picker | P1 | Stroke and fill color customization |
| Eraser tool | P0 | Erase strokes and shapes |
| Sticky notes | P1 | Color-coded sticky note elements |
| Grid/snap | P1 | Optional grid overlay with snap-to-grid for precise diagramming |
| Arrow/connector | P0 | Smart connectors that link between shapes |
| Laser pointer | P2 | Ephemeral pointer for presentation mode |

### 6.2 AI Explainer Panel

| Feature | Priority | Description |
|---------|----------|-------------|
| Auto-trigger analysis | P0 | AI analyzes canvas automatically after a brief pause in drawing (2–3 seconds idle) |
| Manual trigger | P0 | "Analyze Now" button for on-demand AI analysis |
| Diagram type identification | P0 | AI labels the overall diagram type and confidence score |
| Component explanation | P0 | AI explains each identified element (e.g., "This diamond shape represents a decision node") |
| Notation validation | P0 | AI flags incorrect or ambiguous notation with plain-language reasons |
| Correction suggestions | P0 | AI proposes specific fixes with before/after explanation |
| Complexity scoring | P1 | AI rates diagram completeness and structural quality |
| Contextual hints | P1 | AI offers next-step hints ("You have entities but no relationships yet — consider adding cardinality") |
| Chat with AI | P1 | Free-form Q&A with AI about the current diagram |
| Explanation history | P2 | Scrollable log of past AI analyses in the session |
| AI confidence indicator | P1 | Visual confidence badge on each AI statement |

### 6.3 Collaboration Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Shareable room link | P0 | Instant link sharing, no account needed for guests |
| Live cursors | P0 | Named, colored cursors for all participants |
| Real-time canvas sync | P0 | All strokes and edits visible to all participants with ≤ 100ms latency |
| Participant list | P0 | Sidebar showing all active users with online status |
| Roles: Owner, Editor, Viewer | P1 | Permission tiers for board access |
| Follow mode | P1 | Viewer follows a presenter's viewport |
| Chat sidebar | P1 | Text chat alongside the whiteboard |
| Reactions / emoji | P2 | Quick emoji reactions to specific canvas areas |
| Commenting | P1 | Anchor a comment to a specific region of the canvas |

### 6.4 Session & Board Management

| Feature | Priority | Description |
|---------|----------|-------------|
| Board dashboard | P0 | Grid view of all boards owned or shared with the user |
| Board naming and tagging | P1 | Name boards and add descriptive tags |
| Version history | P1 | Snapshot timeline with ability to restore previous states |
| Export (PNG, SVG, PDF) | P0 | Export entire board or selected region |
| Duplicate board | P1 | Clone a board as a starting point |
| Template library | P2 | Pre-built diagram templates (basic ER, flowchart starter, circuit starter) |

### 6.5 Instructor / Admin Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Classroom mode | P1 | Instructor creates a session; students join sub-boards |
| Oversight dashboard | P1 | Grid view of all student boards, live-updated |
| Spotlight a student board | P1 | Broadcast a student's board to all session participants |
| Annotation on student board | P1 | Instructor can draw directly on a student's board (with visual distinction) |
| Session summary export | P2 | Export AI analysis summaries for all boards in a session |

---

## 7. User Stories & Acceptance Criteria

### US-001: Automatic AI Diagram Identification

**As a** student drawing an ER diagram,  
**I want** the AI to automatically identify what I've drawn  
**So that** I can confirm I'm on the right track without having to ask.

**Acceptance Criteria:**
- [ ] After 2.5 seconds of drawing inactivity, the AI panel updates with a diagram type label
- [ ] Label displays the identified diagram type (e.g., "ER Diagram — Chen Notation") with a confidence percentage
- [ ] If confidence < 60%, the AI states "I'm not certain — this could be an ER diagram or a flowchart" with reasoning
- [ ] If the canvas is blank or contains only unrecognizable strokes, the AI panel shows "I don't see a recognizable diagram yet. Keep drawing!"
- [ ] The analysis does not block canvas interaction — it runs in the background

### US-002: Notation Error Correction

**As a** student who mixed two ER notation styles,  
**I want** the AI to flag the inconsistency  
**So that** I can fix my diagram before submitting it.

**Acceptance Criteria:**
- [ ] AI highlights the inconsistent elements with a yellow border overlay on the canvas
- [ ] The AI panel lists each flagged element with a plain-language explanation of the issue
- [ ] Each correction suggestion includes a "Why?" expandable section with further context
- [ ] User can click "Accept suggestion" to have the AI annotate the fix on the canvas, or "Dismiss" to ignore it
- [ ] Dismissed suggestions do not re-appear unless the canvas element is modified

### US-003: Real-Time Collaborative Sketching

**As a** study group of 4 students working remotely,  
**I want** to draw on the same whiteboard simultaneously  
**So that** we can build our ER diagram together in real time.

**Acceptance Criteria:**
- [ ] All 4 participants see each other's strokes within 100ms (P95 under normal network conditions)
- [ ] Each participant's cursor is labelled with their name and a unique color
- [ ] Conflicts (simultaneous edits to the same element) are resolved with last-write-wins and both changes are preserved in history
- [ ] Participant join/leave events show a toast notification to all active users
- [ ] Session continues and canvas is preserved if one participant loses connection and reconnects within 60 seconds

### US-004: Instructor Oversight

**As an** instructor running a lab session,  
**I want** to see all student boards in a grid view  
**So that** I can identify who needs help without leaving my dashboard.

**Acceptance Criteria:**
- [ ] Instructor sees a live-updating grid of all boards in the classroom session
- [ ] Each board tile shows the board owner's name, last AI analysis result, and a "needs help" flag if a student has asked for help
- [ ] Clicking a board tile opens a side-by-side view of the student's board
- [ ] Instructor can draw on a student's board in a distinct color (e.g., red) labeled "Instructor"
- [ ] AI analysis for each student board runs independently and is visible to the instructor but not pushed to other students

### US-005: AI Chat About the Diagram

**As a** user confused about why my circuit diagram is flagged,  
**I want** to ask the AI follow-up questions about the current diagram  
**So that** I can understand the underlying concept, not just the fix.

**Acceptance Criteria:**
- [ ] A chat input box is available below the AI explanation panel
- [ ] The AI's chat context always includes the most recent canvas snapshot
- [ ] Responses are generated within 5 seconds for typical questions
- [ ] AI answers are grounded in what is visible on the canvas, not generic explanations
- [ ] Chat history persists for the duration of the session

---

## 8. System Architecture

### 8.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Canvas UI   │  │ AI Explainer │  │ Collab Layer  │  │
│  │ (React +     │  │    Panel     │  │  (WebSocket   │  │
│  │  Fabric.js)  │  │              │  │   Client)     │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          ▼                 ▼                  ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│   REST API /    │  │  AI Service  │  │  Collaboration   │
│   GraphQL       │  │  (Vision LLM │  │  Server          │
│   (Node.js)     │  │  + Claude)   │  │  (WebSocket /    │
│                 │  │              │  │  CRDTs / Redis)  │
└────────┬────────┘  └──────┬───────┘  └────────┬─────────┘
         │                  │                   │
         ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                    Data & Storage Layer                   │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ PostgreSQL │  │  Redis      │  │  Object Storage    │ │
│  │ (users,    │  │  (session   │  │  (canvas snapshots,│ │
│  │  boards,   │  │  state,     │  │  exports, media)   │ │
│  │  history)  │  │  presence)  │  │                    │ │
│  └────────────┘  └─────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Key Architectural Decisions

**Canvas State Sync (CRDTs):** Canvas state is managed using Conflict-free Replicated Data Types (CRDTs) via Yjs. This allows optimistic local updates with eventual consistency across peers, handling concurrent edits gracefully without server round-trips for every stroke.

**AI Analysis Pipeline:** When a user pauses drawing, the client captures a high-resolution PNG snapshot of the current canvas viewport and sends it to the AI Service endpoint. The AI Service passes the image to a vision-capable multimodal model (Claude) with a system prompt tailored to the diagram type context. Results stream back to the client via SSE (Server-Sent Events).

**Session Rooms:** Each board session is a named WebSocket room managed by the Collaboration Server. Presence data (cursors, online status) is stored in Redis with TTL-based expiry.

---

## 9. Technical Requirements

### 9.1 Frontend

| Requirement | Detail |
|-------------|--------|
| Framework | React 18+ with TypeScript |
| Canvas Engine | Fabric.js (v5+) or Konva.js for the drawing layer |
| CRDT Library | Yjs with WebSocket provider for real-time sync |
| State Management | Zustand or Redux Toolkit |
| AI Panel | Streaming text rendering with react-markdown |
| WebSocket Client | Socket.IO client or native WebSocket |
| Bundle Size Target | < 500KB gzipped initial load |
| Browser Support | Chrome 100+, Firefox 110+, Safari 16+, Edge 100+ |

### 9.2 Backend

| Requirement | Detail |
|-------------|--------|
| API Server | Node.js with Express or Fastify |
| WebSocket Server | Socket.IO or µWebSockets.js |
| AI Integration | Anthropic Claude API (claude-sonnet, vision-capable model) |
| Database | PostgreSQL 15+ for persistent data |
| Cache / Presence | Redis 7+ |
| Object Storage | AWS S3 or compatible (canvas snapshots, exports) |
| Authentication | JWT with refresh tokens; guest access via signed session tokens |
| Rate Limiting | Per-user AI request rate limiting (max 20 AI analyses per minute per board) |

### 9.3 Infrastructure

| Requirement | Detail |
|-------------|--------|
| Hosting | AWS (ECS / EKS) or equivalent |
| CDN | CloudFront for static assets |
| CI/CD | GitHub Actions with staging → production pipeline |
| Monitoring | Datadog or Grafana + Prometheus |
| Error Tracking | Sentry |
| Load Balancing | Application Load Balancer with sticky sessions for WebSocket connections |

---

## 10. UI/UX Requirements

### 10.1 Layout Principles

- **Canvas-first:** The whiteboard canvas occupies 70–75% of the viewport at all times
- **Minimal chrome:** Toolbars are compact and collapsible; they do not obstruct drawing
- **AI panel is docked:** The AI Explainer panel is a collapsible right-hand drawer, defaulting to 280px width
- **Non-intrusive analysis:** AI analysis results appear in the panel; they do not overlay the canvas unless the user clicks "Highlight on canvas"

### 10.2 Key Screens

**Board Canvas View (Primary Screen)**
- Top bar: Board name (editable inline), share button, participants avatars, export button
- Left toolbar: Drawing tools (pen, shapes, text, eraser, selection, connector)
- Right drawer: AI Explainer panel with tabs: "Explain", "Correct", "Chat"
- Bottom bar: Zoom controls, page/layer selector (v2), undo/redo

**AI Explainer Panel — "Explain" Tab**
- Diagram type badge (with confidence %)
- Scrollable list of identified components, each with an icon and plain-English description
- "Highlight on Canvas" toggle that draws bounding boxes around identified elements

**AI Explainer Panel — "Correct" Tab**
- Numbered list of flagged issues, severity-coded (error / warning / suggestion)
- Each item: brief title, detailed explanation, "Fix it" and "Dismiss" actions
- "Clear all dismissed" button at the bottom

**AI Explainer Panel — "Chat" Tab**
- Standard chat UI; input box at the bottom
- AI avatar label distinguishes AI messages from user messages
- "Analyzing current canvas…" loading indicator when generating response

**Instructor Dashboard**
- Grid of board thumbnails (3–5 per row), live-updated every 5 seconds
- Each tile: student name, last AI summary sentence, "Help requested" badge
- "Spotlight" button on each tile broadcasts that board to all session participants

### 10.3 Accessibility

- All interactive elements have ARIA labels
- Keyboard navigation supported for toolbar and AI panel
- Minimum color contrast ratio of 4.5:1 for all UI text
- AI explanations are screen-reader compatible
- Canvas alt-text summary available for users with assistive technology

---

## 11. AI Model Requirements

### 11.1 Model Capabilities Required

The AI backend must support:

- **Vision input:** Accept a canvas screenshot (PNG/JPEG) as primary input
- **Diagram classification:** Identify the diagram type from a predefined taxonomy
- **Element identification:** Enumerate and label individual diagram components
- **Notation validation:** Identify deviations from standard notations
- **Natural language generation:** Produce explanations suitable for a student audience (clear, jargon-light, educational tone)
- **Streaming output:** Results should stream to the client progressively

### 11.2 Supported Diagram Taxonomy (v1.0)

| Category | Diagram Types |
|----------|--------------|
| Software Engineering | Flowchart, UML Class Diagram, UML Sequence Diagram, State Machine Diagram |
| Database | ER Diagram (Chen Notation), ER Diagram (Crow's Foot Notation) |
| Electrical Engineering | Basic Circuit Diagram, Logic Gate Diagram |
| General | Mind Map, Tree/Hierarchy Diagram |

### 11.3 AI System Prompt Design

The AI system prompt will be dynamically composed based on:
- The diagram type detected in the previous analysis (to provide continuity)
- The user's stated proficiency level (beginner/intermediate/advanced, set in profile)
- Instructor-provided context (e.g., "This is a DB 101 class; enforce third normal form")

### 11.4 AI Guardrails

- AI must not fabricate diagram elements that are not visible on the canvas
- AI must express uncertainty explicitly when confidence is low ("I'm not certain, but this appears to be…")
- AI corrections must always include a "Why" explanation — not just what to change
- AI must not produce offensive, off-topic, or personally critical output
- Content moderation layer runs on all AI outputs before display

### 11.5 Fallback Behavior

- If AI service is unavailable: the panel shows "AI analysis is temporarily unavailable. Your canvas is still syncing." No degradation to the canvas or collaboration features.
- If canvas snapshot is too complex (e.g., extremely dense): AI will analyze the selected/focused region and note this in its response.

---

## 12. Real-Time Collaboration Requirements

### 12.1 Canvas Sync

- CRDT-based sync (Yjs) ensures all concurrent edits converge to the same state
- Stroke-level granularity: each stroke is an independent CRDT operation
- Awareness protocol tracks cursor position, selection state, and user presence
- Reconnection: clients maintain a local operation queue and replay on reconnect

### 12.2 Conflict Resolution

- Concurrent strokes from different users are always both preserved (no stroke is dropped)
- Concurrent edits to the same shape property (e.g., two users resizing the same box) resolve as last-write-wins with operation timestamps
- Undo is local per user: undoing your own actions does not affect others' strokes

### 12.3 Presence & Cursors

- Cursor positions are broadcast via awareness protocol at 30fps during active movement
- Each user has a persistent color assigned for the session
- Cursors display the user's display name and tool in use
- Inactive users (no activity for 2 minutes) are shown as greyed out

### 12.4 Network Resilience

- Optimistic local rendering: strokes appear immediately for the drawing user; sync happens in background
- Exponential backoff reconnection strategy (max 5 retries, then prompt to reload)
- Canvas state is persisted to the server every 30 seconds as a checkpoint

---

## 13. Security & Privacy

### 13.1 Authentication & Authorization

- User accounts secured with hashed passwords (bcrypt, cost factor ≥ 12) and optional SSO (OAuth2 with Google/Microsoft)
- Guest access via cryptographically signed, time-limited session tokens (expiry 24 hours)
- Board access enforced server-side: all WebSocket events verify the user has permission on the board
- Roles enforced at API layer: Viewers cannot write to canvas; Editors cannot change board settings

### 13.2 Data Privacy

- Canvas snapshots sent to the AI service are ephemeral: they are not stored by the AI provider beyond the request lifecycle
- Canvas data at rest is encrypted (AES-256)
- Data in transit is encrypted via TLS 1.3
- Users can delete their boards and all associated data permanently (right to erasure)
- GDPR and COPPA compliance required; parental consent flow for users under 13

### 13.3 Content Security

- Canvas content is user-generated; a content moderation layer scans AI outputs and flags user-submitted text for ToS violations
- No user canvas data is used to train AI models without explicit opt-in consent

---

## 14. Performance Requirements

| Metric | Target | Priority |
|--------|--------|----------|
| Canvas initial load time | < 2 seconds (P90) | P0 |
| Stroke rendering latency (local) | < 16ms (60fps) | P0 |
| Collaborative sync latency | < 100ms (P95) | P0 |
| AI analysis trigger-to-first-token | < 1.5 seconds (P90) | P0 |
| AI full response time | < 5 seconds (P90) | P1 |
| Canvas snapshot capture | < 200ms | P0 |
| Board load from storage | < 1 second (P95) | P1 |
| Export to PNG/PDF | < 8 seconds for boards up to A0 size | P1 |
| Concurrent users per board | ≥ 25 without degradation | P0 |
| Concurrent boards per server | ≥ 500 | P1 |

---

## 15. Integrations

### 15.1 v1.0 Integrations

| Integration | Purpose |
|-------------|---------|
| Anthropic Claude API | Vision-capable AI for diagram analysis and chat |
| AWS S3 | Canvas snapshot storage, export file storage |
| Google OAuth | Social login |
| Microsoft OAuth | Social login (enterprise/university users) |
| Sentry | Error tracking |
| Stripe | Billing for paid plans |

### 15.2 Planned Integrations (v2.0+)

| Integration | Purpose |
|-------------|---------|
| Canvas LMS / Moodle | Assignment submission directly from the whiteboard |
| Google Classroom | Classroom session setup and student roster import |
| Notion / Confluence | Export boards as embedded documents |
| GitHub | Link diagrams to repositories (architecture docs) |
| Figma | Import/export design components |
| Slack | Share board snapshots with AI summary directly to channels |

---

## 16. Phased Rollout Plan

### Phase 1 — MVP (Months 1–3)

**Goal:** Validate core value proposition with a small beta cohort

**Deliverables:**
- Freehand canvas with basic shapes and connectors
- Single-user AI analysis (flowchart and ER diagram only)
- Real-time collaboration for up to 5 users
- Shareable board links (no account required)
- Export to PNG
- Basic AI Explain + Correct panel

**Success Gate:** 500 beta users; AI helpfulness rating ≥ 70%; P95 sync latency < 150ms

### Phase 2 — Expanded Diagram Support (Months 4–6)

**Goal:** Broaden AI capability and add classroom features

**Deliverables:**
- AI support for circuit diagrams, UML class diagrams, state machines
- Instructor/Classroom mode with oversight dashboard
- Board version history (10 snapshots)
- AI Chat tab
- Guest access for collaborative sessions
- Template library (starter templates)

**Success Gate:** 5,000 MAU; AI accuracy ≥ 85%; at least 3 university pilot partnerships

### Phase 3 — Scale & Integrations (Months 7–10)

**Goal:** Scale to 50,000 MAU and integrate with academic ecosystems

**Deliverables:**
- LMS integration (Canvas, Moodle)
- Google Classroom integration
- Session summary export for instructors
- Collaborative commenting
- AI complexity scoring and diagram quality report
- Mobile-responsive web (touch drawing support)
- Slack integration for snapshot sharing

**Success Gate:** 50,000 MAU; NPS ≥ 45; 20+ institutional license agreements

### Phase 4 — AI Enhancements (Months 11–14)

**Goal:** Differentiate with advanced AI features

**Deliverables:**
- Diagram-to-code generation (ER → SQL schema, flowchart → pseudocode)
- AI auto-layout suggestions (re-arrange elements for clarity)
- Institution-specific AI fine-tuning (optional)
- AI-generated session debrief for instructors
- Multi-language AI explanations (Spanish, Hindi, Mandarin)

---

## 17. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI misidentifies diagram type, causing incorrect explanations | Medium | High | Display confidence score; show "I'm not sure" below 60%; allow user to manually specify diagram type |
| High AI API cost at scale due to frequent canvas snapshots | High | High | Throttle AI calls (debounce 2.5s); send only changed canvas region, not full canvas; cache results for identical canvases |
| WebSocket scalability limits under high concurrent load | Medium | High | Horizontal scaling with sticky sessions; load test to 500 boards × 25 users before launch |
| Student privacy concerns about canvas images sent to AI | Medium | Medium | Clear privacy notice; ephemeral image handling; GDPR compliance; no training opt-out by default |
| Low AI explanation quality for advanced topics (graduate-level) | Medium | Medium | Allow users to set proficiency level; use chain-of-thought prompting for complex diagrams |
| Competitor (Miro, FigJam) launches AI features before us | High | Medium | Accelerate MVP; focus on depth of AI explanation (not just identification) as differentiator |
| Instructor adoption friction due to unfamiliar tech | Low | Medium | Offer onboarding sessions; provide classroom setup wizard; assign customer success manager to institutional clients |

---

## 18. Open Questions

1. **AI Model Selection:** Should we use a single multimodal model (Claude) for all diagram types, or fine-tune specialized models per category (e.g., a circuit-specific model)? What is the accuracy vs. cost tradeoff?

2. **Pricing Model:** Should the product be freemium (free for individuals, paid for classrooms) or institutional-license only? How does this affect the guest access design?

3. **Canvas Persistence:** Should boards expire after 90 days for free users, or should free boards persist indefinitely? What is the storage cost implication?

4. **AI Rate Limiting UX:** When a user hits the AI analysis rate limit, should the panel show a countdown timer, or a "queue your request" mechanism?

5. **Diagram Type Taxonomy Completeness:** Is the v1.0 taxonomy (flowchart, ER, circuit, UML class, state machine) sufficient for the target market, or should we include network topology diagrams and data flow diagrams from the start?

6. **Offline Support:** Should we invest in a local-first architecture (enabling offline work with sync on reconnect) in v1.0, given that schools often have unreliable Wi-Fi?

7. **Accessibility for Canvas Drawing:** Freehand drawing is inherently inaccessible to some motor-impaired users. Should v1.0 include an alternative "click-to-place" shape mode, or defer to v2.0?

---

## 19. Appendix

### A. Glossary

| Term | Definition |
|------|-----------|
| CRDT | Conflict-free Replicated Data Type — a data structure that allows distributed, concurrent edits to converge without coordination |
| ER Diagram | Entity-Relationship Diagram — a data modeling diagram showing entities, their attributes, and relationships |
| Chen Notation | A style of ER diagramming using rectangles for entities, ovals for attributes, and diamonds for relationships |
| Crow's Foot | A style of ER diagramming where relationship cardinality is shown using crow's foot symbols at the end of connectors |
| UML | Unified Modeling Language — a standardized modeling language for software engineering diagrams |
| Yjs | An open-source CRDT framework for building collaborative applications |
| Canvas Snapshot | A rasterized PNG export of the current canvas viewport sent to the AI service for analysis |
| SSE | Server-Sent Events — a mechanism for streaming text from server to browser over HTTP |

### B. Competitive Landscape

| Product | Collaborative Canvas | AI Analysis | Diagram-Specific | Education Focus |
|---------|---------------------|-------------|-----------------|-----------------|
| Miro | ✅ | Partial (copilot) | ❌ | Partial |
| FigJam | ✅ | Partial | ❌ | ❌ |
| draw.io | ❌ (export only) | ❌ | ✅ | Partial |
| Lucidchart | Partial | ❌ | ✅ | Partial |
| **This Product** | **✅** | **✅ (deep)** | **✅** | **✅** |

### C. Reference Standards for Diagram Notation Validation

- Flowcharts: ISO 5807:1985
- ER Diagrams: Chen (1976), Crow's Foot (Martin, 1987)
- Circuit Diagrams: IEC 60617
- UML: OMG UML 2.5.1 Specification

### D. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | Apr 2026 | Product Team | Initial draft |
| 1.0 | May 2026 | Product Team | Full PRD, all sections complete |
