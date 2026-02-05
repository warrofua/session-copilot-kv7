# Session Co-Pilot: AI Developer Guide for Agents

## Context & Purpose
This is a **Session Co-Pilot** application for Applied Behavior Analysis (ABA) therapy. 
**Goal:** Allow therapists to log behavioral data via natural language chat or buttons, completely offline.

## Core Directives
1.  **Offline-First:** All features MUST work without internet. Do not add dependencies that require online CDN or API calls for core functionality (except the LLM which has a local fallback).
2.  **Strict Types:** Use TypeScript strict mode. Define interfaces in `src/db/db.ts` or `src/services/llmService.ts`.
3.  **Data Integrity:** All data persists to IndexedDB via Dexie.js (`src/db/db.ts`). Do not rely on `localStorage` for critical session data.
4.  **Testing:** Always run `npm test` before pushing. Maintain 100% pass rate on the `llmService` logic tests.

## Architecture
-   **Frontend:** React 18 + Vite
-   **State Management:** Zustand (`src/stores/`). Separates UI state (drawer open) from Sync state (online/offline).
-   **Database:** Dexie.js (IndexedDB wrapper). Schema versioning is critical.
-   **LLM Integration:** 
    -   `src/services/llmService.ts` handles parsing.
    -   **Hybrid Strategy:** Tries GitHub Models API (Online) -> Falls back to Regex/Heuristics (Offline).
-   **Hosting:** Azure Static Web Apps.

## Key Files
-   `src/db/db.ts`: **Source of Truth** for data models.
-   `src/services/llmService.ts`: **Brain** of the chat parsing.
-   `src/services/llmService.test.ts`: **Verifier** of the offline logic engine.
-   `src/test/setup.ts`: **Environment** configuration (mocks).
-   `src/App.tsx`: **Main Controller** integrating Chat, Store, and UI.

## "Oh Crap" Protocol
If the user reports a "bug" or "crash":
1.  Check `useSyncStore` for offline status.
2.  Check Dexie.js transaction failures.
3.  Verify the LLM token in `.env` (or CI/CD secrets).

## Deployment
-   **CI/CD:** GitHub Actions (`.github/workflows/`).
-   **Secrets:** `VITE_GITHUB_TOKEN` is injected at build time.
-   **Routing:** Azure SWA handles routing. `staticwebapp.config.json` (if needed) controls headers/routes.
