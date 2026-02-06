/**
 * Represents a single audit log entry in the system.
 */
export interface AuditLogEntry {
    id: string;
    userId: string;
    userEmail: string;
    action: string;
    entityType: string;
    entityId: string;
    orgId: string | null;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    failureReason?: string;
    details: Record<string, unknown>;
    timestamp: string;
}

/**
 * Fetches audit logs from the backend.
 * 
 * @param limit - The maximum number of logs to retrieve (default: 100).
 * @returns A promise resolving to an array of audit log entries.
 * @throws Will throw an error if the fetch fails or response is not OK.
 */
export async function getAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    const response = await fetch(`/api/audit/logs?limit=${limit}`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch audit logs' }));
        throw new Error(error.error || 'Failed to fetch audit logs');
    }

    const data = await response.json() as { logs: AuditLogEntry[] };
    return data.logs;
}

