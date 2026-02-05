import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './LandingPage.css'; // Base styles
import './LegalPage.css';   // Light theme overrides

export default function LegalPage() {
    const { hash } = useLocation();

    // Handle scroll to section on load
    useEffect(() => {
        if (hash) {
            const element = document.getElementById(hash.substring(1));
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            window.scrollTo(0, 0);
        }
    }, [hash]);

    return (
        <div className="landing-page legal-page">
            {/* Navigation */}
            <nav className="landing-nav">
                <Link to="/" className="landing-logo">
                    <span className="landing-logo-text">Agents <span>of ABA</span></span>
                </Link>
                <div className="landing-nav-links">
                    <Link to="/" className="landing-nav-btn ghost">Home</Link>
                    <Link to="/login" className="landing-nav-btn primary">Login</Link>
                </div>
            </nav>

            <main className="legal-main">
                <section id="terms" className="legal-section">
                    <h1 className="legal-h1">Terms of Service</h1>
                    <p className="legal-updated">Last Updated: February 5, 2026</p>

                    <h2 className="legal-h2">1. Acceptance of Terms</h2>
                    <p className="legal-p">
                        By accessing or using Agents of ABA ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                    </p>

                    <h2 className="legal-h2">2. Use of Service</h2>
                    <p className="legal-p">
                        You utilize this Service to document behavioral health data. You acknowledge that you are solely responsible for ensuring that your use of the Service complies with all applicable laws and regulations, including HIPAA and ethical codes of conduct.
                    </p>
                    <ul className="legal-list">
                        <li>You must maintain the confidentiality of your account credentials.</li>
                        <li>You are responsible for all activities that occur under your account.</li>
                        <li>You agree not to misuse the Service or help anyone else do so.</li>
                    </ul>

                    <h2 className="legal-h2">3. Data Privacy & HIPAA</h2>
                    <p className="legal-p">
                        We are committed to protecting the privacy of your data. Our Service is designed to be HIPAA-compliant. However, as a user, you share responsibility for HIPAA compliance:
                    </p>
                    <ul className="legal-list">
                        <li>Do not store user passwords in plain text (we handle this for you).</li>
                        <li>Ensure your device is secured with a passcode/biometrics.</li>
                        <li>Log out when you are finished using the Service on shared devices.</li>
                    </ul>

                    <h2 className="legal-h2">4. Limitation of Liability</h2>
                    <p className="legal-p">
                        To the maximum extent permitted by law, Agents of ABA shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly.
                    </p>
                </section>

                <hr className="legal-divider" />

                <section id="privacy" className="legal-section">
                    <h1 className="legal-h1">Privacy Policy</h1>
                    <p className="legal-updated">Last Updated: February 5, 2026</p>

                    <h2 className="legal-h2">1. Information We Collect</h2>
                    <p className="legal-p">
                        We collect information you provide directly to us, such as:
                    </p>
                    <ul className="legal-list">
                        <li>Account information (name, email, professional role).</li>
                        <li>Clinical data entered during sessions (stored encrypted).</li>
                        <li>Technical usage data (logs, device type) for security and debugging.</li>
                    </ul>

                    <h2 className="legal-h2">2. How We Use Information</h2>
                    <p className="legal-p">
                        We use the information we collect to:
                    </p>
                    <ul className="legal-list">
                        <li>Provide, maintain, and improve our Service.</li>
                        <li>Process transactions and send related information.</li>
                        <li>Send you technical notices, updates, security alerts, and support messages.</li>
                    </ul>

                    <h2 className="legal-h2">3. Data Security</h2>
                    <p className="legal-p">
                        We use industry-standard encryption to protect your data both in transit and at rest.
                        All sensitive clinical data is encrypted on your device before it touches our servers (where applicable) or stored locally in your browser's secure storage.
                    </p>

                    <h2 className="legal-h2">4. Contact Us</h2>
                    <p className="legal-p">
                        If you have any questions about this Privacy Policy, please contact us at support@agentsofaba.com.
                    </p>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="landing-footer-logo">
                    <span>Agents of ABA</span>
                </div>
                <p>&copy; {new Date().getFullYear()} Agents of ABA. All rights reserved.</p>
                <div className="legal-footer-links">
                    <Link to="/legal#terms">Terms</Link>
                    <Link to="/legal#privacy">Privacy</Link>
                </div>
            </footer>
        </div>
    );
}
