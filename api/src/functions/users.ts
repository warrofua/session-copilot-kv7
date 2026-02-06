import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUsersByOrg, createUser, findUserByEmail, updateUser, findUserById, logAuditEvent } from '../services/cosmosDb.js';
import { verifyRequestToken, hashPassword, generateEncryptionSalt, getPermissionsForRole, getRequestMetadata } from '../utils/auth.js';

interface CreateUserRequest {
    email: string;
    password: string;
    name: string;
    role: 'manager' | 'bcba' | 'rbt';
    assignedLearnerIds?: string[];
}

interface UpdateUserRequest {
    id: string;
    role?: 'manager' | 'bcba' | 'rbt';
    isActive?: boolean;
    name?: string;
    assignedLearnerIds?: string[];
}

async function usersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Users API request');

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        // Verify token (checks cookie first, then header)
        const payload = verifyRequestToken(request);

        if (!payload) {
            return { status: 401, jsonBody: { error: 'Unauthorized - valid session required' } };
        }     // Verify Manager or BCBA role
        if (!['manager', 'bcba'].includes(payload.role || '')) {
            return { status: 403, jsonBody: { error: 'Insufficient permissions' } };
        }

        // Get requesting user to verify org
        const requester = await findUserById(payload.userId);
        if (!requester?.orgId) {
            return { status: 403, jsonBody: { error: 'User not associated with an organization' } };
        }

        if (request.method === 'GET') {
            // LIST USERS
            const users = await findUsersByOrg(requester.orgId);

            // Log user list access
            await logAuditEvent({
                userId: requester.id,
                userEmail: requester.email,
                action: 'read',
                entityType: 'users_list',
                entityId: requester.orgId,
                orgId: requester.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: { userCount: users.length }
            });

            // Remove sensitive data
            const safeUsers = users.map(({ passwordHash, ...u }) => u);
            return { status: 200, jsonBody: { users: safeUsers } };

        } else if (request.method === 'POST') {
            // CREATE USER (Manager only)
            if (requester.role !== 'manager') {
                return { status: 403, jsonBody: { error: 'Only managers can create users' } };
            }

            const body = await request.json() as CreateUserRequest;
            const { email, password, name, role, assignedLearnerIds } = body;

            if (!email || !password || !name || !role) {
                return { status: 400, jsonBody: { error: 'Missing required fields' } };
            }

            const existing = await findUserByEmail(email);
            if (existing) {
                return { status: 409, jsonBody: { error: 'Email already registered' } };
            }

            const passwordHash = await hashPassword(password);
            const permissions = getPermissionsForRole(role, 'org');

            const newUser = await createUser({
                email: email.toLowerCase(),
                passwordHash,
                userType: 'org',
                orgId: requester.orgId,
                role,
                name,
                assignedLearnerIds: assignedLearnerIds || [],
                permissions,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                isActive: true,
                encryptionSalt: generateEncryptionSalt()
            });

            await logAuditEvent({
                userId: requester.id,
                userEmail: requester.email,
                action: 'create',
                entityType: 'user',
                entityId: newUser.id,
                orgId: requester.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: { role, name, createdUserEmail: newUser.email }
            });

            const { passwordHash: _, ...safeUser } = newUser;
            return { status: 201, jsonBody: { user: safeUser } };
        } else if (request.method === 'PUT') {
            // UPDATE USER (Manager only)
            if (requester.role !== 'manager') {
                return { status: 403, jsonBody: { error: 'Only managers can update users' } };
            }

            const body = await request.json() as UpdateUserRequest;
            const { id, role, isActive, name, assignedLearnerIds } = body;

            if (!id) {
                return { status: 400, jsonBody: { error: 'User id is required' } };
            }

            const targetUser = await findUserById(id);
            if (!targetUser || targetUser.orgId !== requester.orgId) {
                return { status: 404, jsonBody: { error: 'User not found' } };
            }

            if (targetUser.id === requester.id && isActive === false) {
                return { status: 400, jsonBody: { error: 'You cannot deactivate your own account' } };
            }

            const updates: UpdateUserRequest = { id };
            if (typeof role !== 'undefined') {
                updates.role = role;
            }
            if (typeof isActive !== 'undefined') {
                updates.isActive = isActive;
            }
            if (typeof name !== 'undefined' && name.trim()) {
                updates.name = name.trim();
            }
            if (typeof assignedLearnerIds !== 'undefined') {
                updates.assignedLearnerIds = assignedLearnerIds;
            }

            const permissions = updates.role ? getPermissionsForRole(updates.role, 'org') : undefined;
            const updatedUser = await updateUser(id, {
                ...(typeof updates.role !== 'undefined' ? { role: updates.role, permissions } : {}),
                ...(typeof updates.isActive !== 'undefined' ? { isActive: updates.isActive } : {}),
                ...(typeof updates.name !== 'undefined' ? { name: updates.name } : {}),
                ...(typeof updates.assignedLearnerIds !== 'undefined' ? { assignedLearnerIds: updates.assignedLearnerIds } : {})
            });

            if (!updatedUser) {
                return { status: 404, jsonBody: { error: 'User not found' } };
            }

            await logAuditEvent({
                userId: requester.id,
                userEmail: requester.email,
                action: 'update',
                entityType: 'user',
                entityId: updatedUser.id,
                orgId: requester.orgId,
                ipAddress,
                userAgent,
                success: true,
                details: {
                    updatedUserEmail: updatedUser.email,
                    role: updatedUser.role,
                    isActive: updatedUser.isActive,
                    name: updatedUser.name
                }
            });

            const { passwordHash: _, ...safeUser } = updatedUser;
            return { status: 200, jsonBody: { user: safeUser } };
        }

        return { status: 405, jsonBody: { error: 'Method not allowed' } };

    } catch (error) {
        context.error('Users API error:', error);
        return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
}

app.http('users', {
    methods: ['GET', 'POST', 'PUT'],
    authLevel: 'anonymous',
    route: 'users',
    handler: usersHandler
});
