import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createLearner, findLearnersByOrg, findUserById, logAuditEvent, updateLearner } from '../services/cosmosDb.js';
import { verifyRequestToken, getRequestMetadata } from '../utils/auth.js';

interface CreateLearnerRequest {
    name: string;
    dob: string;
    status: 'active' | 'inactive' | 'discharged';
    primaryBcbaId?: string;
    assignedRbtIds?: string[];
}

interface UpdateLearnerRequest {
    id: string;
    name?: string;
    dob?: string;
    status?: 'active' | 'inactive' | 'discharged';
}

export async function learnersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Learners API request: ${request.method} ${request.url}`);

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

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

            // Log learner list access (PHI access)
            await logAuditEvent({
                userId: user.id,
                userEmail: user.email,
                action: 'read',
                entityType: 'learners_list',
                entityId: user.orgId,
                orgId: user.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: { learnerCount: learners.length, userRole: user.role }
            });

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

            // Log learner creation (PHI creation)
            await logAuditEvent({
                userId: user.id,
                userEmail: user.email,
                action: 'create',
                entityType: 'learner',
                entityId: learner.id,
                orgId: user.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: {
                    learnerName: name,
                    status,
                    createdBy: user.name,
                    createdByRole: user.role
                }
            });

            return {
                status: 201,
                jsonBody: learner
            };
        } else if (request.method === 'PUT') {
            // Update learner (Manager/BCBA)
            if (user.role !== 'manager' && user.role !== 'bcba') {
                return {
                    status: 403,
                    jsonBody: { error: 'Access denied: Only Managers and BCBAs can update learners' }
                };
            }

            const body = await request.json() as UpdateLearnerRequest;
            const { id, name, dob, status } = body;
            if (!id) {
                return { status: 400, jsonBody: { error: 'Learner id is required' } };
            }

            const orgLearners = await findLearnersByOrg(user.orgId);
            const existing = orgLearners.find((learner) => learner.id === id);
            if (!existing) {
                return { status: 404, jsonBody: { error: 'Learner not found' } };
            }

            const updates: Partial<typeof existing> = {};
            if (typeof name !== 'undefined' && name.trim()) {
                updates.name = name.trim();
            }
            if (typeof dob !== 'undefined' && dob) {
                updates.dob = dob;
            }
            if (typeof status !== 'undefined') {
                updates.status = status;
            }

            if (Object.keys(updates).length === 0) {
                return { status: 400, jsonBody: { error: 'No valid fields to update' } };
            }

            const updatedLearner = await updateLearner(id, updates);
            if (!updatedLearner) {
                return { status: 404, jsonBody: { error: 'Learner not found' } };
            }

            await logAuditEvent({
                userId: user.id,
                userEmail: user.email,
                action: 'update',
                entityType: 'learner',
                entityId: updatedLearner.id,
                orgId: user.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: {
                    learnerName: updatedLearner.name,
                    status: updatedLearner.status,
                    updatedBy: user.name,
                    updatedByRole: user.role
                }
            });

            return {
                status: 200,
                jsonBody: updatedLearner
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
    methods: ['GET', 'POST', 'PUT'],
    authLevel: 'anonymous',
    route: 'learners',
    handler: learnersHandler
});
