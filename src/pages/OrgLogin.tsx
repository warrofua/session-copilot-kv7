import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPages.css';

export default function OrgLogin() {
    const navigate = useNavigate();
    const { login, register, isLoading, error } = useAuth();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        orgName: '',
        role: 'manager' as 'manager' | 'bcba' | 'rbt'
    });
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        try {
            if (mode === 'login') {
                await login(formData.email, formData.password);
            } else {
                await register({
                    email: formData.email,
                    password: formData.password,
                    name: formData.name,
                    userType: 'org',
                    orgName: formData.orgName,
                    role: formData.role
                });
            }
            navigate('/app');
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    const displayError = localError || error;

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <Link to="/" className="back-link">← Back to Home</Link>
                    <h1>Organization Login <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>(v1.1)</span></h1>
                    <p>For BCBAs, RBTs, and Clinic Managers</p>
                </div>

                <div className="login-tabs">
                    <button
                        className={`tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => setMode('login')}
                    >
                        Sign In
                    </button>
                    <button
                        className={`tab ${mode === 'register' ? 'active' : ''}`}
                        onClick={() => setMode('register')}
                    >
                        Register Org
                    </button>
                </div>

                {displayError && (
                    <div className="error-banner">{displayError}</div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    <fieldset disabled={isLoading} style={{ border: 'none', padding: 0, margin: 0 }}>
                        {mode === 'register' && (
                            <>
                                <div className="form-group">
                                    <label htmlFor="name">Your Name</label>
                                    <input
                                        id="name"
                                        type="text"
                                        autoComplete="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        placeholder="Jane Smith"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="orgName">Organization Name</label>
                                    <input
                                        id="orgName"
                                        type="text"
                                        autoComplete="organization"
                                        value={formData.orgName}
                                        onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                                        required
                                        placeholder="ABC Therapy Services"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="role">Your Role</label>
                                    <select
                                        id="role"
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value as 'manager' | 'bcba' | 'rbt' })}
                                    >
                                        <option value="manager">Manager / Admin</option>
                                        <option value="bcba">BCBA</option>
                                    </select>
                                    <p className="form-hint">RBTs must be invited by an admin</p>
                                </div>
                            </>
                        )}

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="username"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                placeholder="you@organization.com"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                                minLength={8}
                                placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                            />
                        </div>

                        <button type="submit" className="submit-btn" disabled={isLoading}>
                            {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Organization'}
                        </button>
                    </fieldset>
                </form>

                <div className="login-footer">
                    <Link to="/login/parent">Parent/Guardian Login →</Link>
                </div>
            </div>
        </div>
    );
}
