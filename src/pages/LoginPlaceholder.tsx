import { Link } from 'react-router-dom';
import './LandingPage.css';

export default function LoginSelector() {
    return (
        <div className="login-page">
            <div className="login-container" style={{ maxWidth: '500px' }}>
                <div className="login-header">
                    <Link to="/" className="back-link">← Back to Home</Link>
                    <h1>Choose Login Type</h1>
                    <p>Select the appropriate login for your account type</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                    <Link
                        to="/login/org"
                        style={{
                            display: 'block',
                            padding: '1.5rem',
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            borderRadius: '12px',
                            textDecoration: 'none',
                            color: '#fff',
                            textAlign: 'center'
                        }}
                    >
                        <h3 style={{ margin: '0 0 0.5rem' }}>Organization Login</h3>
                        <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
                            For BCBAs, RBTs, and Clinic Staff
                        </p>
                    </Link>

                    <Link
                        to="/login/parent"
                        style={{
                            display: 'block',
                            padding: '1.5rem',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            borderRadius: '12px',
                            textDecoration: 'none',
                            color: '#fff',
                            textAlign: 'center'
                        }}
                    >
                        <h3 style={{ margin: '0 0 0.5rem' }}>Parent / Guardian</h3>
                        <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
                            View your child's session data
                        </p>
                    </Link>
                </div>
            </div>
        </div>
    );
}
