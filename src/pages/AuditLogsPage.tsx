import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuditLogs, type AuditLogEntry } from '../services/auditService';

export default function AuditLogsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || (user.role !== 'manager' && user.role !== 'bcba')) {
            navigate('/app');
            return;
        }

        void loadLogs();
    }, [user, navigate]);

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
        <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
            <button
                onClick={() => navigate('/app')}
                style={{
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    cursor: 'pointer'
                }}
            >
                ← Back to Session
            </button>

            <h1 style={{ marginBottom: '8px' }}>Audit Log</h1>
            <p style={{ marginTop: 0, marginBottom: '16px', color: '#4b5563' }}>
                PHI access and modification events for your organization.
            </p>

            {isLoading && <p>Loading audit logs...</p>}
            {error && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            {!isLoading && !error && (
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                        <thead style={{ background: '#f9fafb' }}>
                            <tr>
                                <th style={thStyle}>Time</th>
                                <th style={thStyle}>User</th>
                                <th style={thStyle}>Action</th>
                                <th style={thStyle}>Entity</th>
                                <th style={thStyle}>Success</th>
                                <th style={thStyle}>IP</th>
                                <th style={thStyle}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td style={tdStyle}>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td style={tdStyle}>{log.userEmail}</td>
                                    <td style={tdStyle}>{log.action}</td>
                                    <td style={tdStyle}>{log.entityType}</td>
                                    <td style={tdStyle}>{log.success ? 'yes' : 'no'}</td>
                                    <td style={tdStyle}>{log.ipAddress}</td>
                                    <td style={tdStyle}>{JSON.stringify(log.details)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const thStyle: CSSProperties = {
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: 600,
    color: '#111827',
    padding: '10px',
    borderBottom: '1px solid #e5e7eb'
};

const tdStyle: CSSProperties = {
    fontSize: '13px',
    color: '#374151',
    padding: '10px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'top'
};
