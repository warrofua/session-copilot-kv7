import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserById, findLearnersByIds, findLearnersByOrg, findOrganizationById, Learner, Organization } from '../services/cosmosDb.js';
import { extractTokenFromHeader, verifyToken } from '../utils/auth.js';

async function meHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Auth/me request');

    try {
        // Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        const token = extractTokenFromHeader(authHeader || undefined);

        if (!token) {
            return {
                status: 401,
                jsonBody: { error: 'Authorization token required' }
            };
        }

        // Verify token
        const payload = verifyToken(token);
        if (!payload) {
            return {
                status: 401,
                jsonBody: { error: 'Invalid or expired token' }
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
