# Session Co-Pilot: AI Developer Guide for Agents

## Context & Purpose
This is a **Session Co-Pilot** application for Applied Behavior Analysis (ABA) therapy. 
**Goal:** Allow therapists to log behavioral data via natural language chat or buttons, completely offline.

## Core Directives
1.  **Offline-First:** All features MUST work without internet. Do not add dependencies that require online CDN or API calls for core functionality (except the LLM which has a local fallback).
2.  **Strict Types:** Use TypeScript strict mode. Define interfaces in `src/db/db.ts` or `src/services/llmService.ts`.
3.  **Data Integrity:** All data persists to IndexedDB via Dexie.js (`src/db/db.ts`). Do not rely on `localStorage` for critical session data.
4.  **Testing:** Always run `npm test` before pushing. Maintain 100% pass rate on the `llmService` logic tests.

## Pre-Push Checklist (Mandatory for Agents)
To prevent CI/CD failures (like unused imports or type errors):
1.  **Local Build:** Run `npm run build` locally. If this fails, the CI/CD **will** fail.
2.  **Linting:** Ensure no unused variables or imports exist (TypeScript strict mode is active).
3.  **Tests:** Run `npm test` and ensure all suites pass.
4.  **Formatting:** Run `npm run lint` if a linter is configured.

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

- **API:** Azure Functions in `api/` automatically deploy with the Static Web App.
- **Architectural Showcase Features:**
    - `src/pages/ArchitecturePage.tsx`: Detailed system architecture and data flow.
    - `src/components/RoleToggle.tsx`: Floating widget to switch roles (Admin/BCBA/RBT) for demonstration or testing.

## Agent Verification & Playwright Guide
Mandatory instructions for AI agents to ensure successful feature verification and E2E testing:

1.  **Dev Server Port:** Always start the local server with `npm run dev -- --port 5173`.
    - **Critical:** Vite may jump to port 5174 if 5173 is occupied. Playwright is configured for 5173; port jumping will cause `net::ERR_CONNECTION_REFUSED`.
2.  **Role-Based Verification:** 
    - The application uses strict RBAC. To verify "System Architecture" or "Billing" features, you **must** use the **Role Toggle** widget (bottom left) to switch to the `BCBA` or `Manager` role.
    - Path `/architecture` only appears in the menu for `BCBA`.
    - Path `/admin/billing` only appears for `Manager`.

## Playwright Setup
To run E2E tests locally as an agent:
1.  **Base URL Documentation:** Ensure `playwright.config.ts` matches the dev server port:
    ```typescript
    use: {
      baseURL: 'http://localhost:5173',
    },
    webServer: {
      command: 'npm run dev -- --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
    ```
2.  **Verification Steps:** If a test fails with "navigation failed," immediately check if `npm run dev` is running on the correct port in the background.

## "Oh Crap" Protocol
If the user or tests report a "bug" or "crash":
1.  Check `useSyncStore` for offline status.
2.  Check Dexie.js transaction failures.
3.  Verify the LLM token in `.env`.
4.  **Role Toggle Missing?** Ensure `App.tsx` renders `<RoleToggle />` outside the main layout container.
5.  **Browser Tool Fails?** Ensure the dev server wasn't started on port 5174.

## Deployment
-   **CI/CD:** GitHub Actions (`.github/workflows/azure-static-web-apps-*.yml`).
-   **Secrets:** `VITE_GITHUB_TOKEN`, `COSMOS_CONNECTION_STRING`, `JWT_SECRET`.
-   **Routing:** React Router + `staticwebapp.config.json`.


