import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findAuditLogsByOrg, findUserById, logAuditEvent } from '../services/cosmosDb.js';
import { getRequestMetadata, verifyRequestToken } from '../utils/auth.js';

async function auditLogsHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Audit logs request');

    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        const payload = verifyRequestToken(request);
        if (!payload) {
            return { status: 401, jsonBody: { error: 'Unauthorized' } };
        }

        const requester = await findUserById(payload.userId);
        if (!requester?.orgId) {
            return { status: 403, jsonBody: { error: 'User not associated with an organization' } };
        }

        if (!['manager', 'bcba'].includes(requester.role || '')) {
            await logAuditEvent({
                userId: requester.id,
                userEmail: requester.email,
                action: 'read_denied',
                entityType: 'audit_log',
                entityId: requester.orgId,
                orgId: requester.orgId,
                ipAddress,
                userAgent,
                success: false,
                failureReason: 'insufficient_permissions',
                details: { role: requester.role }
            });

            return { status: 403, jsonBody: { error: 'Insufficient permissions' } };
        }

        const limitParam = Number(request.query.get('limit') || '100');
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

        const logs = await findAuditLogsByOrg(requester.orgId, limit);

        await logAuditEvent({
            userId: requester.id,
            userEmail: requester.email,
            action: 'read',
            entityType: 'audit_log',
            entityId: requester.orgId,
            orgId: requester.orgId,
            ipAddress,
            userAgent,
            success: true,
            details: { resultCount: logs.length, limit }
        });

        return {
            status: 200,
            jsonBody: { logs }
        };
    } catch (error) {
        context.error('Audit logs error:', error);
        return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
}

app.http('auditLogs', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'audit/logs',
    handler: auditLogsHandler
});
