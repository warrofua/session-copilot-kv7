import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { findUserByEmail, logAuditEvent } from '../services/cosmosDb.js';
import { verifyPassword, generateToken } from '../utils/auth.js';

interface LoginRequest {
    email: string;
    password: string;
}

async function loginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Login attempt');

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
                action: 'login_failed',
                entityType: 'auth',
                entityId: email,
                details: { reason: 'user_not_found' }
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
                action: 'login_failed',
                entityType: 'auth',
                entityId: user.id,
                details: { reason: 'invalid_password' }
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
            action: 'login_success',
            entityType: 'auth',
            entityId: user.id,
            details: {}
        });

        // Return user info (without password hash)
        const { passwordHash: _, ...safeUser } = user;

        return {
            status: 200,
            jsonBody: {
                token,
                user: safeUser
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
