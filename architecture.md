# Session Co-Pilot Architecture 🏗️

## High-Level Overview

Session Co-Pilot is an **Offline-First**, **Client-Side** web application designed for ABA (Applied Behavior Analysis) therapists. It prioritizes data integrity, speed, and reliability in environments with poor or no internet connectivity.

The architecture follows a **"Local-First"** (or Offline-First) pattern, where the browser's IndexedDB is the primary source of truth, and the cloud is purely for backup/sync (future state) and AI processing (when available).

## System Diagram

```mermaid
graph TD
    User[Therapist] -->|Chat/Click| UI[React UI]
    UI -->|State Updates| Store[Zustand Store]
    UI -->|Data Persist| DB[(Dexie.js / IndexedDB)]
    UI -->|Auth| AuthContext[Auth Context]

    subgraph Intelligence Layer
        UI -->|Input| Router{Router}
        Router -->|Online| API[GitHub Models API]
        Router -->|Offline| Regex[Local Regex Logic]
        API -->|JSON| Parser[Response Parser]
        Regex -->|JSON| Parser
    end

    Parser -->|Structured Data| Confirmation[Confirmation Flow]
    Confirmation -->|User Approves| DB
    Confirmation -->|User Approves| Store

    AuthContext -->|Login/Register| Functions[Azure Functions API]
    Functions -->|Query/Persist| Cosmos[(Cosmos DB)]
    DB -->|Sync Queue| SyncService[Sync Service]
    SyncService -->|When Online| Cosmos

    subgraph Cloud
        CI[GitHub Actions] -->|Build & Deploy| SWA[Azure Static Web App]
        SWA -->|Hosts| Functions
    end
```

## Component Breakdown

### 1. Frontend Layer (React + Vite)
-   **Framework:** React 18 with TypeScript.
-   **Build Tool:** Vite (fast HMR, strict ESM).
-   **Styling:** Vanilla CSS variables (Design Tokens) for a lightweight, maintainable theme system.

**Key Components:**
-   `App.tsx`: The main controller integration point.
-   `ChatArea.tsx`: Handles message rendering and "Chat Bubble" UI.
-   `SideDrawer.tsx`: The "Session Summary" view (Read-Model of the data).
-   `llmService.ts`: The interface for all "Intelligence" operations.

### 2. State Management (Zustand + React Context)
We use **Zustand** for transient UI state and **React Context** for authentication.
-   `sessionStore.ts`: Holds the *current* session's active data (events, trials, draft notes). This allows for instant UI reactivity without querying IndexedDB on every render.
-   `syncStore.ts`: Tracks online/offline status and pending sync counts.
-   `AuthContext.tsx`: Manages user authentication state, JWT tokens, and role-based permissions.

### 3. Data Layer (Dexie.js / IndexedDB)
This is the **Core** of the application.
-   **Library:** Dexie.js (Wrapper for IndexedDB).
-   **Tables:**
    -   `behaviorEvents`: Time-series data of behaviors (timestamp, duration, antecedent).
    -   `skillTrials`: Education trial data (skill, target, response).
    -   `incidents`: High-priority safety reports.
    -   `syncQueue`: (Future) Outbox pattern for syncing data to cloud when online.
-   **Persistence:** Data survives tab closes, browser restarts, and offline periods.

### 4. Intelligence Layer (Hybrid)
We use a **Fallback Strategy** for AI:
1.  **Attempt Online:** valid `VITE_GITHUB_TOKEN` exists? -> Call GitHub Models API (GPT-4o-mini).
2.  **Fallback Offline:** Token missing or Network Error? -> Run `mockParseInput` (Regular Expressions).
    -   *Note:* The Regex engine has been robustly tuned to handle standard ABA terminology ("elopement", "SIB", "trials", durations).

### 5. Backend Layer (Azure Functions)
-   **API:** Node.js Azure Functions in `api/src/functions/`
-   **Endpoints:**
    -   `POST /api/auth/login`: Authenticate user, return JWT token
    -   `POST /api/auth/register`: Create new user/organization
    -   `GET /api/auth/me`: Get current user info with assigned learners
-   **Database:** Cosmos DB for users, organizations, learners, and audit logs
-   **Auth:** JWT-based authentication with role-based access control (Manager, BCBA, RBT, Parent)

### 6. Infrastructure (Azure)
-   **Host:** Azure Static Web Apps with integrated Azure Functions
-   **CI/CD:** GitHub Actions automatically builds and deploys on push to `master`.
-   **Security:** API Tokens and connection strings injected at build time via GitHub Secrets. No secrets are stored in the repo.

## Data Flow

### Authentication Flow
1.  **Login:** User submits credentials -> Azure Function verifies -> Returns JWT token
2.  **Storage:** Token stored in localStorage, user data in AuthContext
3.  **Authorization:** Protected routes check AuthContext.isAuthenticated
4.  **Permissions:** Role-based access control enforced in UI and API

### Session Data Flow
1.  **Capture:** User types "Patient ran away for 5 mins".
2.  **Process:** `llmService` parses text -> `{ type: 'elopement', duration: 300 }`.
3.  **Confirm:** UI shows "Logging: Elopement (300s). Correct?".
4.  **Persist:** On "Yes" -> Write to DexieDB -> Update Zustand -> Update UI.
5.  **Sync:** Background sync to Cosmos DB when online (via SyncQueue).

## Secrets Management

| Secret | Location | Purpose |
|--------|----------|---------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | GitHub Secrets | Deployment authentication |
| `VITE_GITHUB_TOKEN` | GitHub Secrets | Frontend build-time (AI API) |
| `COSMOS_CONNECTION_STRING` | Azure App Settings | Runtime API database |
| `JWT_SECRET` | Azure App Settings | Runtime API auth tokens |
| `STRIPE_SECRET_KEY` | Azure App Settings | Runtime API payments |
| `STRIPE_WEBHOOK_SECRET` | Azure App Settings | Runtime API webhook verification |
| `STRIPE_PRICE_*` | Azure App Settings | Runtime API price IDs |

**Pattern:**
- **GitHub Secrets** → Build/deploy-time (CI/CD workflow)
- **Azure App Settings** → Runtime (API environment variables)

Configure Azure App Settings via: `az staticwebapp appsettings set --name <app> --resource-group <rg> --setting-names KEY=value`
