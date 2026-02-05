import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPages.css';

export default function ParentLogin() {
    const navigate = useNavigate();
    const { login, isLoading, error } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        try {
            await login(formData.email, formData.password);
            navigate('/app');
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    const displayError = localError || error;

    return (
        <div className="login-page parent-login">
            <div className="login-container">
                <div className="login-header">
                    <Link to="/" className="back-link">← Back to Home</Link>
                    <h1>Parent / Guardian Login</h1>
                    <p>View your child's session data</p>
                </div>

                {displayError && (
                    <div className="error-banner">{displayError}</div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                            placeholder="parent@email.com"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                            placeholder="••••••••"
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={isLoading}>
                        {isLoading ? 'Please wait...' : 'Sign In'}
                    </button>
                </form>

                <div className="info-box">
                    <h3>Don't have an account?</h3>
                    <p>Parent accounts are created by your child's therapy provider. Please contact them to request access.</p>
                </div>

                <div className="login-footer">
                    <Link to="/login/org">Organization Login →</Link>
                </div>
            </div>
        </div>
    );
}
