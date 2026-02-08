import { useNavigate } from 'react-router-dom';
import './ArchitecturePage.css';

// Professional Icons (SVGs)
const icons = {
    stack: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
    ),
    flow: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9-9c1.657 0 3 3.358 3 7.5S13.657 15 12 15s-3-3.358-3-7.5S10.343 3 12 3z" />
        </svg>
    ),
    security: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" /><path d="M12 16h.01" />
        </svg>
    ),
    arrow: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
        </svg>
    )
};

export function ArchitecturePage() {
    const navigate = useNavigate();

    return (
        <div className="architecture-page">
            <header className="arch-header">
                <div>
                    <h1 className="arch-title">Agents <span>of ABA</span></h1>
                    <p className="arch-subtitle">System Architecture & Technical Foundations</p>
                </div>
                <button className="arch-close-btn" onClick={() => navigate('/demo')}>
                    Back to Demo
                </button>
            </header>

            <div className="arch-grid">
                {/* Tech Stack Column */}
                <section className="arch-section">
                    <h2 className="section-title">
                        <div className="icon-box stack">{icons.stack}</div>
                        Tech Stack
                    </h2>
                    <div className="card-stack">
                        <div className="tech-card">
                            <h3>Frontend Foundations</h3>
                            <div className="tags">
                                <span className="tag react">React 18</span>
                                <span className="tag vite">Vite</span>
                                <span className="tag ts">TypeScript</span>
                            </div>
                            <p>Component-based UI with strict typing and modern React hooks.</p>
                        </div>
                        <div className="tech-card">
                            <h3>State & Persistence</h3>
                            <div className="tags">
                                <span className="tag zustand">Zustand</span>
                                <span className="tag dexie">Dexie.js</span>
                                <span className="tag pwa">IndexedDB</span>
                            </div>
                            <p>Local-first architecture using IndexedDB for offline-capable data storage.</p>
                        </div>
                        <div className="tech-card">
                            <h3>Intelligence Engine</h3>
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
                        <div className="icon-box flow">{icons.flow}</div>
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
                        <div className="flow-arrow">{icons.arrow}</div>
                        <div className="flow-step">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h4>Local Validation</h4>
                                <p>Schema checking and business logic (ABA rules) applied immediately.</p>
                            </div>
                        </div>
                        <div className="flow-arrow">{icons.arrow}</div>
                        <div className="flow-step">
                            <div className="step-number">3</div>
                            <div className="step-content">
                                <h4>Client-Side Encryption</h4>
                                <p>Data encrypted with AES-GCM using user's derived key before storage.</p>
                            </div>
                        </div>
                        <div className="flow-arrow">{icons.arrow}</div>
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
                        <div className="icon-box security">{icons.security}</div>
                        Security & Trust
                    </h2>
                    <div className="feature-list">
                        <div className="feature-item">
                            <h4>Zero-Knowledge Architecture</h4>
                            <p>Server never sees plaintext PHI. Decryption happens only in the browser.</p>
                        </div>
                        <div className="feature-item">
                            <h4>RBAC Enforcement</h4>
                            <p>Granular permissions for Admins, BCBAs, RBTs, and Parents.</p>
                            <div className="rbac-preview">
                                <span className="role-chip admin">Admin</span>
                                <span className="role-chip bcba">BCBA</span>
                                <span className="role-chip rbt">RBT</span>
                            </div>
                        </div>
                        <div className="feature-item">
                            <h4>Audit Integrity</h4>
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
