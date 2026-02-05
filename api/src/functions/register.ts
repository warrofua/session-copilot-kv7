import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserByEmail, createUser, createOrganization, logAuditEvent } from '../services/cosmosDb.js';
import { hashPassword, generateToken, getPermissionsForRole } from '../utils/auth.js';

interface RegisterRequest {
    email: string;
    password: string;
    name: string;
    userType: 'org' | 'parent';
    // For org users
    orgName?: string;
    role?: 'manager' | 'bcba' | 'rbt';
    // For parent users
    inviteCode?: string;
}

async function registerHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Registration attempt');

    try {
        const body = await request.json() as RegisterRequest;
        const { email, password, name, userType, orgName, role } = body;

        // Validate required fields
        if (!email || !password || !name || !userType) {
            return {
                status: 400,
                jsonBody: { error: 'Email, password, name, and userType are required' }
            };
        }

        // Validate password strength
        if (password.length < 8) {
            return {
                status: 400,
                jsonBody: { error: 'Password must be at least 8 characters' }
            };
        }

        // Check if email already exists
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return {
                status: 409,
                jsonBody: { error: 'Email already registered' }
            };
        }

        let orgId: string | null = null;

        // For org users, create organization if manager, or validate org exists
        if (userType === 'org') {
            if (!role) {
                return {
                    status: 400,
                    jsonBody: { error: 'Role is required for organization users' }
                };
            }

            if (role === 'manager') {
                if (!orgName) {
                    return {
                        status: 400,
                        jsonBody: { error: 'Organization name is required for manager registration' }
                    };
                }

                // Create new organization
                const org = await createOrganization({
                    name: orgName,
                    settings: {
                        defaultSessionDuration: 120,
                        requireSupervisorApproval: false
                    },
                    createdAt: new Date().toISOString()
                });
                orgId = org.id;

                await logAuditEvent({
                    userId: 'registration',
                    action: 'org_created',
                    entityType: 'organization',
                    entityId: org.id,
                    details: { name: orgName }
                });
            } else {
                // Non-manager users need an invite code or org assignment
                // For MVP, this would need to be handled via admin UI
                return {
                    status: 400,
                    jsonBody: { error: 'Non-manager users must be invited by an organization administrator' }
                };
            }
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Get permissions based on role
        const permissions = getPermissionsForRole(role || null, userType);

        // Create user
        const user = await createUser({
            email: email.toLowerCase(),
            passwordHash,
            userType,
            orgId,
            role: userType === 'org' ? role || null : null,
            name,
            assignedLearnerIds: [],
            permissions,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            isActive: true
        });

        // Log registration
        await logAuditEvent({
            userId: user.id,
            action: 'user_registered',
            entityType: 'user',
            entityId: user.id,
            details: { userType, role }
        });

        // Generate token
        const token = generateToken(user);

        // Return user info (without password hash)
        const { passwordHash: _, ...safeUser } = user;

        return {
            status: 201,
            jsonBody: {
                token,
                user: safeUser
            }
        };
    } catch (error) {
        context.error('Registration error:', error);
        return {
            status: 500,
            jsonBody: {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

app.http('register', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/register',
    handler: registerHandler
});
