// Shared types for sync operations between frontend and backend

export interface SyncableDocument {
    id: string;
    sessionId: number;
    entityType: 'behavior' | 'skillTrial' | 'incident' | 'note';
    data: Record<string, unknown>;
    syncedAt: string;
    clientId?: string;
}

export interface SyncResult {
    success: number;
    failed: number;
    total?: number;
}
