import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserByEmail, logAuditEvent } from '../services/cosmosDb.js';
import { verifyPassword, generateToken, setAuthCookie, getRequestMetadata } from '../utils/auth.js';

interface LoginRequest {
    email: string;
    password: string;
}

async function loginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Login attempt');

    // Extract request metadata for audit logging
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
        const body = await request.json() as LoginRequest;
        const { email, password } = body;

        // Validate input
        if (!email || !password) {
            return {
                status: 400,
                jsonBody: { error: 'Email and password are required' }
            };
        }

        // Find user
        const user = await findUserByEmail(email);
        if (!user) {
            // Log failed attempt for security
            await logAuditEvent({
                userId: 'anonymous',
                userEmail: email,
                action: 'login_failed',
                entityType: 'auth',
                entityId: email,
                orgId: null,
                ipAddress,
                userAgent,
                success: false,
                failureReason: 'user_not_found',
                details: { attemptedEmail: email }
            });
            return {
                status: 401,
                jsonBody: { error: 'Invalid email or password' }
            };
        }

        // Check if user is active
        if (!user.isActive) {
            return {
                status: 403,
                jsonBody: { error: 'Account is deactivated. Contact your administrator.' }
            };
        }

        // Verify password
        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            await logAuditEvent({
                userId: user.id,
                userEmail: user.email,
                action: 'login_failed',
                entityType: 'auth',
                entityId: user.id,
                orgId: user.orgId,
                ipAddress,
                userAgent,
                success: false,
                failureReason: 'invalid_password',
                details: { email: user.email }
            });
            return {
                status: 401,
                jsonBody: { error: 'Invalid email or password' }
            };
        }

        // Generate token
        const token = generateToken(user);

        // Log successful login
        await logAuditEvent({
            userId: user.id,
            userEmail: user.email,
            action: 'login_success',
            entityType: 'auth',
            entityId: user.id,
            orgId: user.orgId,
            ipAddress,
            userAgent,
            success: true,
            details: { userType: user.userType, role: user.role }
        });

        // Return user info (without password hash)
        const { passwordHash: _, ...safeUser } = user;

        // Set HttpOnly cookie with token
        const cookieHeader = setAuthCookie(token);

        return {
            status: 200,
            headers: {
                'Set-Cookie': cookieHeader
            },
            jsonBody: {
                user: safeUser
                // Note: token no longer returned in response body for security
            }
        };
    } catch (error) {
        context.error('Login error:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}

app.http('login', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/login',
    handler: loginHandler
});
