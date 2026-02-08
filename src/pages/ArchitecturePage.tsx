import { useNavigate } from 'react-router-dom';

export function ArchitecturePage() {
    const navigate = useNavigate();

    return (
        <div className="architecture-page">
            <header className="arch-header">
                <div>
                    <h1 className="arch-title">System Architecture</h1>
                    <p className="arch-subtitle">Under the hood of Agentic ABA</p>
                </div>
                <button className="arch-close-btn" onClick={() => navigate('/demo')}>
                    Back to Demo
                </button>
            </header>

            <div className="arch-grid">
                {/* Tech Stack Column */}
                <section className="arch-section">
                    <h2 className="section-title">
                        <span className="icon">🛠️</span>
                        Tech Stack
                    </h2>
                    <div className="card-stack">
                        <div className="tech-card">
                            <h3>Frontend Core</h3>
                            <div className="tags">
                                <span className="tag react">React 19</span>
                                <span className="tag vite">Vite</span>
                                <span className="tag ts">TypeScript</span>
                            </div>
                            <p>Component-based UI with strict typing and modern React hooks.</p>
                        </div>
                        <div className="tech-card">
                            <h3>State & Data</h3>
                            <div className="tags">
                                <span className="tag zustand">Zustand</span>
                                <span className="tag dexie">Dexie.js</span>
                                <span className="tag pwa">PWA</span>
                            </div>
                            <p>Local-first architecture using IndexedDB for offline-capable data storage.</p>
                        </div>
                        <div className="tech-card">
                            <h3>Intelligence</h3>
                            <div className="tags">
                                <span className="tag llm">LLM Service</span>
                                <span className="tag regex">Regex Fallback</span>
                            </div>
                            <p>Hybrid parsing engine combining deterministic regex for speed and LLM for complex narrative generation.</p>
                        </div>
                    </div>
                </section>

                {/* Data Flow Column */}
                <section className="arch-section">
                    <h2 className="section-title">
                        <span className="icon">🔄</span>
                        Secure Data Pipeline
                    </h2>
                    <div className="flow-diagram">
                        <div className="flow-step">
                            <div className="step-number">1</div>
                            <div className="step-content">
                                <h4>Input Capture</h4>
                                <p>Natural language or structured input via UI.</p>
                            </div>
                        </div>
                        <div className="flow-arrow">↓</div>
                        <div className="flow-step">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h4>Local Validation</h4>
                                <p>Schema checking and business logic (ABA rules) applied immediately.</p>
                            </div>
                        </div>
                        <div className="flow-arrow">↓</div>
                        <div className="flow-step">
                            <div className="step-number">3</div>
                            <div className="step-content">
                                <h4>Client-Side Encryption</h4>
                                <p>Data encrypted with AES-GCM using user's derived key before storage.</p>
                            </div>
                        </div>
                        <div className="flow-arrow">↓</div>
                        <div className="flow-step">
                            <div className="step-number">4</div>
                            <div className="step-content">
                                <h4>Sync & Storage</h4>
                                <p>Persisted to IndexedDB (offline) and synced to cloud when online.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Security & Features Column */}
                <section className="arch-section">
                    <h2 className="section-title">
                        <span className="icon">🛡️</span>
                        Security & Compliance
                    </h2>
                    <div className="feature-list">
                        <div className="feature-item">
                            <h4>Zero-Knowledge Architecture</h4>
                            <p>Server never sees plaintext PHI. Decryption happens only in the browser.</p>
                        </div>
                        <div className="feature-item">
                            <h4>Role-Based Access Control (RBAC)</h4>
                            <p>Granular permissions for Admins, BCBAs, RBTs, and Parents.</p>
                            <div className="rbac-preview">
                                <span className="role-chip admin">Admin</span>
                                <span className="role-chip bcba">BCBA</span>
                                <span className="role-chip rbt">RBT</span>
                            </div>
                        </div>
                        <div className="feature-item">
                            <h4>Audit Logging</h4>
                            <p>Immutable tamper-evident logs for all data access and modifications.</p>
                        </div>
                        <div className="feature-item">
                            <h4>Offline Resilience</h4>
                            <p>Full functionality without network, verified by Service Workers.</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
