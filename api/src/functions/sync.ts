import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { verifyRequestToken, getRequestMetadata } from '../utils/auth.js';
import { getContainer, CONTAINERS, logAuditEvent } from '../services/cosmosDb.js';

export interface SyncableDocument {
    id: string;
    sessionId: number;
    entityType: 'behavior' | 'skillTrial' | 'incident' | 'note';
    data: Record<string, unknown>;
    syncedAt: string;
    clientId?: string;
    orgId?: string; // Will be populated from authenticated user
}

async function batchSyncHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Batch sync request');

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        // Verify authentication from cookie or header
        const payload = verifyRequestToken(request);
        if (!payload) {
            return {
                status: 401,
                jsonBody: { error: 'Authentication required' }
            };
        }

        const body = await request.json() as { documents: SyncableDocument[] };
        const { documents } = body;

        if (!documents || !Array.isArray(documents)) {
            return {
                status: 400,
                jsonBody: { error: 'Invalid request - documents array required' }
            };
        }

        if (documents.length === 0) {
            return {
                status: 200,
                jsonBody: { success: 0, failed: 0 }
            };
        }

        const container = getContainer(CONTAINERS.SESSIONS);
        let success = 0;
        let failed = 0;

        // Process in batches of 10 to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(async (doc) => {
                    // Add orgId from authenticated user for multi-tenant isolation
                    const documentToStore = {
                        ...doc,
                        orgId: payload.orgId,
                        syncedBy: payload.userId,
                        syncedByEmail: payload.email
                    };

                    // Upsert the document
                    await container.items.upsert(documentToStore);
                    return true;
                })
            );

            // Count successes and failures
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    success++;
                } else {
                    failed++;
                    context.error('Sync failed for document:', result.reason);
                }
            });

            // Small delay between batches to avoid throttling
            if (i + batchSize < documents.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        context.log(`Sync complete: ${success} success, ${failed} failed`);

        // Log sync operation (PHI access - syncing session data)
        await logAuditEvent({
            userId: payload.userId,
            userEmail: payload.email,
            action: 'sync',
            entityType: 'session_data',
            entityId: `batch_${documents.length}`,
            orgId: payload.orgId,
            ipAddress,
            userAgent,
            success: failed === 0,
            failureReason: failed > 0 ? `${failed} documents failed to sync` : undefined,
            details: {
                totalDocuments: documents.length,
                successCount: success,
                failedCount: failed,
                entityTypes: [...new Set(documents.map(d => d.entityType))]
            }
        });

        return {
            status: 200,
            jsonBody: {
                success,
                failed,
                total: documents.length
            }
        };

    } catch (error) {
        context.error('Batch sync error:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

app.http('batchSync', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'sync/batch',
    handler: batchSyncHandler
});
