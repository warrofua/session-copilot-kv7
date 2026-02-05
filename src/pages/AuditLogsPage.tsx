import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuditLogs, type AuditLogEntry } from '../services/auditService';
import './AdminPages.css';

export default function AuditLogsPage() {
    const navigate = useNavigate();
    const { user, isLoading: isAuthLoading } = useAuth();
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthLoading) {
            return;
        }
        if (!user || (user.role !== 'manager' && user.role !== 'bcba')) {
            navigate('/app');
            return;
        }

        void loadLogs();
    }, [user, isAuthLoading, navigate]);

    async function loadLogs() {
        try {
            setIsLoading(true);
            setError(null);
            const fetched = await getAuditLogs(200);
            setLogs(fetched);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load audit logs';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="admin-page">
            <div className="admin-page-shell">
                <div className="admin-page-header">
                    <div>
                        <button
                            onClick={() => navigate('/app')}
                            className="admin-back-btn"
                        >
                            ← Back to Session
                        </button>
                        <h1 className="admin-page-title">Audit Log</h1>
                        <p className="admin-page-subtitle">
                            PHI access and modification events for your organization.
                        </p>
                    </div>
                </div>

                <div className="admin-content">
                    {(isAuthLoading || isLoading) && <p className="admin-empty">Loading audit logs...</p>}
                    {error && (
                        <div className="admin-error">
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && (
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>User</th>
                                        <th>Action</th>
                                        <th>Entity</th>
                                        <th>Success</th>
                                        <th>IP</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id}>
                                            <td>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td>{log.userEmail}</td>
                                            <td>{log.action}</td>
                                            <td>{log.entityType}</td>
                                            <td>{log.success ? 'yes' : 'no'}</td>
                                            <td>{log.ipAddress}</td>
                                            <td>{JSON.stringify(log.details)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
