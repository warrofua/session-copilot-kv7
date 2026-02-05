# Session Co-Pilot 🧩

An **Offline-First** AI assistant for ABA (Applied Behavior Analysis) therapists to log session data comfortably and accurately.

## 🚀 Features
-   **Natural Language Logging:** "He had 2 tantrums and an elopement (30s) after I took the iPad." -> Parsed automatically.
-   **Offline-First:** Built with [Dexie.js](https://dexie.org/) (IndexedDB). Works completely without internet.
-   **Hybrid AI:** Uses **GPT-4o-mini** (GitHub Models) when online, falls back to **Logic Engine** when offline.
-   **Smart Hints:** Asks for missing context (Antecedents, Functions, Interventions) only when needed.
-   **Safety First:** Dedicated "Oh Crap" button for reporting critical incidents.

## 🛠️ Tech Stack
-   **Framework:** React 18 + Vite (TypeScript)
-   **PWA:** Service Workers for offline caching (`vite-plugin-pwa`)
-   **State:** Zustand
-   **Database:** Dexie.js (Client-side IndexedDB)
-   **LLM:** GitHub Models API (OpenAI SDK compatible)
-   **Hosting:** Azure Static Web Apps (Free Tier)

## 🏃‍♂️ Getting Started

### Prerequisites
-   Node.js 18+
-   npm

### Installation
1.  Clone the repo
    ```bash
    git clone https://github.com/warrofua/session-copilot-kv7.git
    cd session-copilot-kv7
    ```
2.  Install dependencies
    ```bash
    npm install
    ```
3.  Set up Environment
    Create a `.env` file:
    ```env
    VITE_GITHUB_TOKEN=gho_your_token_here
    ```
4.  Run Local Dev Server
    ```bash
    npm run dev
    ```

## 📦 Deployment (Azure)
This project is configured for **Azure Static Web Apps**.
-   **CI/CD:** Commits to `master` automatically trigger a build/deploy via GitHub Actions.
-   **Secrets:** The `VITE_GITHUB_TOKEN` must be set as a GitHub Repository Secret.

## 📱 Architecture
The database lives in the **Browser**. Azure only hosts the static assets.
To sync data to the cloud (future feature), the `SyncQueue` table in Dexie.js tracks all local changes waiting to be pushed.
