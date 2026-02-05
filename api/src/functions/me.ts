import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserById, findLearnersByIds, findLearnersByOrg, findOrganizationById, Learner, Organization, logAuditEvent, updateUser } from '../services/cosmosDb.js';
import { verifyRequestToken, generateEncryptionSalt, getRequestMetadata } from '../utils/auth.js';

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

        let userRecord = user;
        if (!userRecord.encryptionSalt) {
            const patchedUser = await updateUser(userRecord.id, { encryptionSalt: generateEncryptionSalt() });
            if (patchedUser) {
                userRecord = patchedUser;
            }
        }

        if (!userRecord.isActive) {
            return {
                status: 403,
                jsonBody: { error: 'Account is deactivated' }
            };
        }

        // Get accessible learners based on role
        let learners: Learner[] = [];
        let organization: Organization | null = null;

        if (userRecord.userType === 'org' && userRecord.orgId) {
            // Get organization info
            organization = await findOrganizationById(userRecord.orgId);

            if (userRecord.role === 'manager' || userRecord.role === 'bcba') {
                // Full org access
                learners = await findLearnersByOrg(userRecord.orgId);
            } else if (userRecord.role === 'rbt') {
                // Only assigned learners
                learners = await findLearnersByIds(userRecord.assignedLearnerIds);
            }
        } else if (userRecord.userType === 'parent') {
            // Parents only see their assigned learners
            learners = await findLearnersByIds(userRecord.assignedLearnerIds);
        }

        // Log access to user info (includes learner assignments - PHI)
        await logAuditEvent({
            userId: userRecord.id,
            userEmail: userRecord.email,
            action: 'read',
            entityType: 'user_profile',
            entityId: userRecord.id,
            orgId: userRecord.orgId,
            ipAddress,
            userAgent,
            success: true,
            details: {
                userType: userRecord.userType,
                role: userRecord.role,
                learnerCount: learners.length
            }
        });

        // Remove password hash from response
        const { passwordHash: _, ...safeUser } = userRecord;

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
