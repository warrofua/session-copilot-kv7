import { Link } from 'react-router-dom';
import './LandingPage.css';

// Placeholder Logo SVG Component
const LogoIcon = () => (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="url(#logoGradient)" />
        <path d="M12 28L20 12L28 28H12Z" fill="white" fillOpacity="0.9" />
        <circle cx="20" cy="22" r="3" fill="url(#logoGradient)" />
        <defs>
            <linearGradient id="logoGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4299E1" />
                <stop offset="1" stopColor="#48BB78" />
            </linearGradient>
        </defs>
    </svg>
);

// Feature Icons
const icons = {
    ai: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            <path d="M9 14v2" /><path d="M15 14v2" />
        </svg>
    ),
    offline: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    ),
    voice: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
        </svg>
    ),
    data: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
        </svg>
    ),
    sync: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
        </svg>
    ),
    note: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
        </svg>
    ),
    shield: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    ),
    lock: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    ),
    check: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    sparkle: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
            <circle cx="12" cy="12" r="4" />
        </svg>
    ),
};

export default function LandingPage() {
    return (
        <div className="landing-page">
            {/* Navigation */}
            <nav className="landing-nav">
                <Link to="/" className="landing-logo">
                    <LogoIcon />
                    <span className="landing-logo-text">Agents <span>of ABA</span></span>
                </Link>
                <div className="landing-nav-links">
                    <Link to="/login" className="landing-nav-btn ghost">Login</Link>
                    <Link to="/demo" className="landing-nav-btn primary">Try Demo</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="landing-hero">
                <div className="landing-hero-badge">
                    {icons.sparkle}
                    <span>AI-Powered Clinical Documentation</span>
                </div>
                <h1>
                    Intelligent Session <span className="highlight">Documentation</span> for ABA Therapists
                </h1>
                <p className="landing-hero-subtitle">
                    Capture behavior data, skill trials, and session notes through natural conversation.
                    Works offline, syncs automatically, and generates evidence-based documentation.
                </p>
                <div className="landing-hero-ctas">
                    <Link to="/demo" className="landing-cta primary">
                        Access Demo
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </Link>
                    <Link to="/login" className="landing-cta secondary">
                        Login to Your Account
                    </Link>
                </div>
                <p className="landing-demo-disclaimer">
                    Demo environment uses sample data. No real patient information is stored.
                    For demonstration purposes only.
                </p>
            </section>

            {/* Features Section */}
            <section className="landing-features">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Features</span>
                    <h2>Built for Clinical Excellence</h2>
                    <p>
                        Designed by behavior analysts, for behavior analysts. Every feature
                        supports evidence-based practice and regulatory compliance.
                    </p>
                </div>

                <div className="landing-features-grid">
                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.ai}</div>
                        <h3>Natural Language Logging</h3>
                        <p>
                            Describe behaviors in plain language. Our AI extracts type, duration,
                            frequency, and antecedents automatically.
                        </p>
                    </div>

                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.offline}</div>
                        <h3>Offline-First Design</h3>
                        <p>
                            Full functionality without internet. Data syncs automatically when
                            connectivity is restored. Never lose a session.
                        </p>
                    </div>

                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.voice}</div>
                        <h3>Voice-Ready Interface</h3>
                        <p>
                            Hands-free data capture during active intervention. Document while
                            maintaining therapeutic engagement.
                        </p>
                    </div>

                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.data}</div>
                        <h3>Structured Data Capture</h3>
                        <p>
                            Behavior events, skill acquisition trials, ABC data, and incident
                            reports in standardized, exportable formats.
                        </p>
                    </div>

                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.sync}</div>
                        <h3>Automatic Cloud Sync</h3>
                        <p>
                            Secure synchronization to Azure Cosmos DB. Access session data
                            across devices with real-time updates.
                        </p>
                    </div>

                    <div className="landing-feature-card">
                        <div className="landing-feature-icon">{icons.note}</div>
                        <h3>AI Note Generation</h3>
                        <p>
                            Auto-generate session notes from collected data. Review, edit, and
                            export in formats compatible with your EHR.
                        </p>
                    </div>
                </div>
            </section>

            {/* Security Section */}
            <section className="landing-security">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Security & Compliance</span>
                    <h2>Built for Healthcare</h2>
                    <p>
                        Enterprise-grade security designed for sensitive clinical data.
                    </p>
                </div>

                <div className="landing-security-grid">
                    <div className="landing-security-card">
                        <div className="landing-security-icon">{icons.shield}</div>
                        <div>
                            <h4>HIPAA Compliant</h4>
                            <p>End-to-end encryption and access controls meet HIPAA requirements for protected health information.</p>
                        </div>
                    </div>

                    <div className="landing-security-card">
                        <div className="landing-security-icon">{icons.lock}</div>
                        <div>
                            <h4>Data Privacy First</h4>
                            <p>Your data stays on your device until you explicitly sync. No third-party analytics or tracking.</p>
                        </div>
                    </div>

                    <div className="landing-security-card">
                        <div className="landing-security-icon">{icons.offline}</div>
                        <div>
                            <h4>Offline Security</h4>
                            <p>Local data is encrypted and protected even without internet connectivity.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="landing-pricing">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Pricing</span>
                    <h2>Simple, Transparent Pricing</h2>
                    <p>
                        Plans that scale with your practice. Start with a 14-day free trial.
                    </p>
                </div>

                <div className="landing-pricing-grid">
                    {/* Starter Plan */}
                    <div className="landing-pricing-card">
                        <div className="landing-pricing-badge">Starter</div>
                        <p className="landing-pricing-desc">For small practices</p>
                        <div className="landing-pricing-price">
                            <span className="landing-pricing-currency">$</span>
                            <span className="landing-pricing-amount">99</span>
                            <span className="landing-pricing-period">/mo</span>
                        </div>
                        <div className="landing-pricing-features">
                            <div className="landing-pricing-feature">{icons.check}<span>10 learners included</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>$15 per additional learner</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Unlimited staff seats</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Email support</span></div>
                        </div>
                        <Link to="/login" className="landing-pricing-cta">Start Free Trial</Link>
                    </div>

                    {/* Growth Plan - Popular */}
                    <div className="landing-pricing-card popular">
                        <div className="landing-popular-badge">Most Popular</div>
                        <div className="landing-pricing-badge">Growth</div>
                        <p className="landing-pricing-desc">For growing practices</p>
                        <div className="landing-pricing-price">
                            <span className="landing-pricing-currency">$</span>
                            <span className="landing-pricing-amount">399</span>
                            <span className="landing-pricing-period">/mo</span>
                        </div>
                        <div className="landing-pricing-features">
                            <div className="landing-pricing-feature">{icons.check}<span>50 learners included</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>$10 per additional learner</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Unlimited staff seats</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Priority email & phone support</span></div>
                        </div>
                        <Link to="/login" className="landing-pricing-cta">Start Free Trial</Link>
                    </div>

                    {/* Scale Plan */}
                    <div className="landing-pricing-card">
                        <div className="landing-pricing-badge">Scale</div>
                        <p className="landing-pricing-desc">For large organizations</p>
                        <div className="landing-pricing-price">
                            <span className="landing-pricing-currency">$</span>
                            <span className="landing-pricing-amount">1,299</span>
                            <span className="landing-pricing-period">/mo</span>
                        </div>
                        <div className="landing-pricing-features">
                            <div className="landing-pricing-feature">{icons.check}<span>150 learners included</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>$8 per additional learner</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Dedicated onboarding</span></div>
                            <div className="landing-pricing-feature">{icons.check}<span>Priority support</span></div>
                        </div>
                        <Link to="/login" className="landing-pricing-cta">Start Free Trial</Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="landing-footer-logo">
                    <LogoIcon />
                    <span>Agents of ABA</span>
                </div>
                <p>&copy; {new Date().getFullYear()} Agents of ABA. All rights reserved.</p>
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                    <Link to="/legal#terms" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', marginRight: '1rem' }}>Terms</Link>
                    <Link to="/legal#privacy" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Privacy</Link>
                </div>
            </footer>
        </div>
    );
}
