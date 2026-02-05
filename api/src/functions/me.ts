import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserById, findLearnersByIds, findLearnersByOrg, findOrganizationById, Learner, Organization, logAuditEvent } from '../services/cosmosDb.js';
import { verifyRequestToken, getRequestMetadata } from '../utils/auth.js';

async function meHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Auth/me request');

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        // Verify token from cookie or Authorization header
        const payload = verifyRequestToken(request);
        if (!payload) {
            return {
                status: 401,
                jsonBody: { error: 'Authentication required' }
            };
        }

        // Get full user from database
        const user = await findUserById(payload.userId);
        if (!user) {
            return {
                status: 404,
                jsonBody: { error: 'User not found' }
            };
        }

        if (!user.isActive) {
            return {
                status: 403,
                jsonBody: { error: 'Account is deactivated' }
            };
        }

        // Get accessible learners based on role
        let learners: Learner[] = [];
        let organization: Organization | null = null;

        if (user.userType === 'org' && user.orgId) {
            // Get organization info
            organization = await findOrganizationById(user.orgId);

            if (user.role === 'manager' || user.role === 'bcba') {
                // Full org access
                learners = await findLearnersByOrg(user.orgId);
            } else if (user.role === 'rbt') {
                // Only assigned learners
                learners = await findLearnersByIds(user.assignedLearnerIds);
            }
        } else if (user.userType === 'parent') {
            // Parents only see their assigned learners
            learners = await findLearnersByIds(user.assignedLearnerIds);
        }

        // Log access to user info (includes learner assignments - PHI)
        await logAuditEvent({
            userId: user.id,
            userEmail: user.email,
            action: 'read',
            entityType: 'user_profile',
            entityId: user.id,
            orgId: user.orgId,
            ipAddress,
            userAgent,
            success: true,
            details: {
                userType: user.userType,
                role: user.role,
                learnerCount: learners.length
            }
        });

        // Remove password hash from response
        const { passwordHash: _, ...safeUser } = user;

        return {
            status: 200,
            jsonBody: {
                user: safeUser,
                organization,
                learners
            }
        };
    } catch (error) {
        context.error('Auth/me error:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}

app.http('me', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'auth/me',
    handler: meHandler
});
