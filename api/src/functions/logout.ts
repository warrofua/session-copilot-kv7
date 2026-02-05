import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { clearAuthCookie, verifyRequestToken, getRequestMetadata } from '../utils/auth.js';
import { logAuditEvent } from '../services/cosmosDb.js';

async function logoutHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Logout request');

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        // Verify token to get user info for audit log
        const payload = verifyRequestToken(request);

        if (payload) {
            // Log logout event
            await logAuditEvent({
                userId: payload.userId,
                userEmail: payload.email,
                action: 'logout',
                entityType: 'auth',
                entityId: payload.userId,
                orgId: payload.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: { userType: payload.userType, role: payload.role }
            });
        }

        // Clear the auth cookie
        const cookieHeader = clearAuthCookie();

        return {
            status: 200,
            headers: {
                'Set-Cookie': cookieHeader
            },
            jsonBody: {
                message: 'Logged out successfully'
            }
        };
    } catch (error) {
        context.error('Logout error:', error);
        // Still clear the cookie even on error
        return {
            status: 200,
            headers: {
                'Set-Cookie': clearAuthCookie()
            },
            jsonBody: {
                message: 'Logged out'
            }
        };
    }
}

app.http('logout', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/logout',
    handler: logoutHandler
});
