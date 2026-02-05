import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createLearner, findLearnersByOrg, findUserById } from '../services/cosmosDb.js';
import { verifyRequestToken } from '../utils/auth.js';

interface CreateLearnerRequest {
    name: string;
    dob: string;
    status: 'active' | 'inactive' | 'discharged';
    primaryBcbaId?: string;
    assignedRbtIds?: string[];
}

export async function learnersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Learners API request: ${request.method} ${request.url}`);

    // Verify token (checks cookie first, then header)
    const payload = verifyRequestToken(request);

    if (!payload) {
        return { status: 401, jsonBody: { error: 'Unauthorized - valid session required' } };
    }

    const user = await findUserById(payload.userId);
    if (!user || user.userType !== 'org' || !user.orgId) {
        return { status: 403, jsonBody: { error: 'Access denied: Organization user required' } };
    }

    try {
        if (request.method === 'GET') {
            // List all learners for the organization
            // Note: For MVP, we allow all org users to see the learner list.
            // In future, RBTs might only see assigned learners.
            const learners = await findLearnersByOrg(user.orgId);
            return {
                status: 200,
                jsonBody: learners
            };
        } else if (request.method === 'POST') {
            // Create new learner
            // Only Manager or BCBA can create learners
            if (user.role !== 'manager' && user.role !== 'bcba') {
                return {
                    status: 403,
                    jsonBody: { error: 'Access denied: Only Managers and BCBAs can create learners' }
                };
            }

            const body = await request.json() as CreateLearnerRequest;
            const { name, dob, status } = body;

            if (!name || !dob || !status) {
                return {
                    status: 400,
                    jsonBody: { error: 'Name, DOB, and Status are required' }
                };
            }

            const learner = await createLearner({
                orgId: user.orgId,
                name,
                dob,
                status,
                parentUserIds: [], // Added via parent invite flow
                primaryBcbaId: body.primaryBcbaId || null,
                assignedRbtIds: body.assignedRbtIds || [],
                createdAt: new Date().toISOString()
            });

            return {
                status: 201,
                jsonBody: learner
            };
        } else {
            return { status: 405, jsonBody: { error: 'Method not allowed' } };
        }
    } catch (error) {
        context.error('Learners API error:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

app.http('learners', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    route: 'learners',
    handler: learnersHandler
});
