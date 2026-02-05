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
-   **Frontend:** React 18 + Vite + React Router
-   **State Management:** Zustand (`src/stores/`) + React Context (`src/contexts/AuthContext.tsx`).
-   **Database:** Dexie.js (IndexedDB wrapper). Schema versioning is critical.
-   **Backend:** Azure Functions (`api/src/functions/`) - Node.js TypeScript
-   **Cloud Database:** Cosmos DB for users, organizations, and cloud sync
-   **Authentication:** HttpOnly Cookie-based with role-based access control (Manager, BCBA, RBT, Parent)
-   **LLM Integration:**
    -   `src/services/llmService.ts` handles parsing.
    -   **Hybrid Strategy:** Tries GitHub Models API (Online) -> Falls back to Regex/Heuristics (Offline).
-   **Hosting:** Azure Static Web Apps with integrated Azure Functions.

## Key Files

### Frontend
-   `src/db/db.ts`: **Source of Truth** for data models (Sessions, BehaviorEvents, SkillTrials, etc.).
-   `src/services/llmService.ts`: **Brain** of the chat parsing.
-   `src/services/authService.ts`: **Auth Client** - handles login/register/logout.
-   `src/services/learnerService.ts`: **Caseload Client** - handles learner management.
-   `src/stores/syncStore.ts`: **Cloud Sync** - syncs IndexedDB to Cosmos DB.
-   `src/contexts/AuthContext.tsx`: **Auth State** - React Context for user authentication.
-   `src/pages/LandingPage.tsx`: Landing page with routing.
-   `src/pages/OrgLogin.tsx` & `ParentLogin.tsx`: Authentication pages.
-   `src/pages/UsersPage.tsx`: Admin User Management.
-   `src/pages/LearnersPage.tsx`: Admin Caseload Management.
-   `src/App.tsx`: **Main Controller** integrating routing, auth, and session UI.
-   `src/test/setup.ts`: **Test Environment** configuration (mocks).
-   `src/services/llmService.test.ts`: **Test Suite** for offline logic engine.

### Backend (Azure Functions)
-   `api/src/functions/login.ts`: POST /api/auth/login - User authentication
-   `api/src/functions/register.ts`: POST /api/auth/register - User/org registration
-   `api/src/functions/logout.ts`: POST /api/auth/logout - Clears auth cookies
-   `api/src/functions/me.ts`: GET /api/auth/me - Get current user info
-   `api/src/functions/users.ts`: GET/POST /api/users - Organization user management
-   `api/src/functions/learners.ts`: GET/POST /api/learners - Learner caseload management
-   `api/src/functions/sync.ts`: POST /api/sync/batch - Batch sync for session data
-   `api/src/services/cosmosDb.ts`: Cosmos DB operations for users/orgs/audit logs
-   `api/src/utils/auth.ts`: JWT generation, password hashing, permissions, cookie helpers

## "Oh Crap" Protocol
If the user reports a "bug" or "crash":
1.  Check `useSyncStore` for offline status.
2.  Check Dexie.js transaction failures.
3.  Verify the LLM token in `.env` (or CI/CD secrets).

## Deployment
-   **CI/CD:** GitHub Actions (`.github/workflows/azure-static-web-apps-*.yml`).
-   **Secrets:** Set as GitHub Repository Secrets:
    -   `VITE_GITHUB_TOKEN` - GitHub Models API token
    -   `COSMOS_CONNECTION_STRING` - Cosmos DB connection string (backend only)
    -   `JWT_SECRET` - Secure string for token signing (backend only)
-   **Routing:** React Router handles frontend routing. Azure SWA config in `swa-cli.config.json`.
-   **API:** Azure Functions in `api/` automatically deploy with the Static Web App.
