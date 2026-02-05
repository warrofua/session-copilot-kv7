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
        <div className="landing-page legal-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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

            <main style={{ maxWidth: '800px', margin: '0 auto', padding: '4rem 1.5rem', flex: 1, color: '#2d3748', lineHeight: '1.8' }}>
                <section id="terms" style={{ marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '2rem', color: '#1a202c', letterSpacing: '-0.025em' }}>Terms of Service</h1>
                    <p className="text-sm text-gray-500 mb-8">Last Updated: February 5, 2026</p>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>1. Acceptance of Terms</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        By accessing or using Agents of ABA ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                    </p>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>2. Use of Service</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        You utilize this Service to document behavioral health data. You acknowledge that you are solely responsible for ensuring that your use of the Service complies with all applicable laws and regulations, including HIPAA and ethical codes of conduct.
                    </p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>You must maintain the confidentiality of your account credentials.</li>
                        <li>You are responsible for all activities that occur under your account.</li>
                        <li>You agree not to misuse the Service or help anyone else do so.</li>
                    </ul>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>3. Data Privacy & HIPPA</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        We are committed to protecting the privacy of your data. Our Service is designed to be HIPAA-compliant. However, as a user, you share responsibility for HIPAA compliance:
                    </p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>Do not store user passwords in plain text (we handle this for you).</li>
                        <li>Ensure your device is secured with a passcode/biometrics.</li>
                        <li>Log out when you are finished using the Service on shared devices.</li>
                    </ul>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>4. Limitation of Liability</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        To the maximum extent permitted by law, Agents of ABA shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly.
                    </p>
                </section>

                <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '3rem 0' }} />

                <section id="privacy">
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '2rem', color: '#1a202c', letterSpacing: '-0.025em' }}>Privacy Policy</h1>
                    <p className="text-sm text-gray-500 mb-8">Last Updated: February 5, 2026</p>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>1. Information We Collect</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        We collect information you provide directly to us, such as:
                    </p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>Account information (name, email, professional role).</li>
                        <li>Clinical data entered during sessions (stored encrypted).</li>
                        <li>Technical usage data (logs, device type) for security and debugging.</li>
                    </ul>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>2. How We Use Information</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        We use the information we collect to:
                    </p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>Provide, maintain, and improve our Service.</li>
                        <li>Process transactions and send related information.</li>
                        <li>Send you technical notices, updates, security alerts, and support messages.</li>
                    </ul>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>3. Data Security</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        We use industry-standard encryption to protect your data both in transit and at rest.
                        All sensitive clinical data is encrypted on your device before it touches our servers (where applicable) or stored locally in your browser's secure storage.
                    </p>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '2rem', marginBottom: '1rem', color: '#2d3748' }}>4. Contact Us</h2>
                    <p style={{ marginBottom: '1rem' }}>
                        If you have any questions about this Privacy Policy, please contact us at support@agentsofaba.com.
                    </p>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="landing-footer-logo">
                    <span>Agents of ABA</span>
                </div>
                <p>&copy; {new Date().getFullYear()} Agents of ABA. All rights reserved.</p>
                <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                    <Link to="/legal#terms" style={{ marginRight: '1rem' }}>Terms</Link>
                    <Link to="/legal#privacy">Privacy</Link>
                </div>
            </footer>
        </div>
    );
}
