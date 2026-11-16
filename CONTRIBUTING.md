# Contributing to Daedalus

Thank you for your interest in contributing to Daedalus.

## Development Setup

1. Prerequisites:
   - Node.js 20 or later
   - npm 10 or later

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development services:
   ```bash
   # Runs backend (3001) and client whiteboard (5173)
   npm run dev

   # Runs the landing page (3333)
   npm run dev:landing
   ```

## Repository Architecture

- `client/`: React 18 and Fabric.js interactive canvas application.
- `server/`: Node.js Express, Socket.IO, and Yjs CRDT synchronization service.
- `landing/`: Luxury monochrome landing page built with GSAP, Lenis, and Three.js.
- `shared/`: Shared TypeScript data schemas and contracts.

## Code Standards & Verification

Before submitting changes, run all checks:

```bash
npm run check
npm run test
npm run build
```

## Pull Requests

1. Create a feature branch from `main`.
2. Keep edits focused and accompanied by relevant tests.
3. Submit a PR describing your motivation and testing verification.

