import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '../services/cosmosDb.js';
import type { HttpRequest } from '@azure/functions';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12;
const COOKIE_NAME = 'session_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface JWTPayload {
    userId: string;
    email: string;
    userType: 'org' | 'parent';
    orgId: string | null;
    role: 'manager' | 'bcba' | 'rbt' | null;
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function generateEncryptionSalt(): string {
    return randomBytes(16).toString('base64');
}

export function generateToken(user: User): string {
    const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        orgId: user.orgId,
        role: user.role
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice(7);
}

// Cookie management functions
export function setAuthCookie(token: string): string {
    const isProduction = process.env.NODE_ENV === 'production';

    const cookieOptions = [
        `${COOKIE_NAME}=${token}`,
        'HttpOnly',                    // Not accessible to JavaScript (XSS protection)
        'SameSite=Strict',             // CSRF protection
        'Path=/',                      // Available across the entire site
        `Max-Age=${COOKIE_MAX_AGE}`,   // 7 days
    ];

    // Only set Secure flag in production (requires HTTPS)
    if (isProduction) {
        cookieOptions.push('Secure');
    }

    return cookieOptions.join('; ');
}

export function clearAuthCookie(): string {
    const isProduction = process.env.NODE_ENV === 'production';

    const cookieOptions = [
        `${COOKIE_NAME}=`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/',
        'Max-Age=0',  // Expire immediately
    ];

    if (isProduction) {
        cookieOptions.push('Secure');
    }

    return cookieOptions.join('; ');
}

export function getTokenFromCookie(request: HttpRequest): string | null {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
        return null;
    }

    // Parse cookies
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    return cookies[COOKIE_NAME] || null;
}

export function getTokenFromRequest(request: HttpRequest): string | null {
    // Try cookie first (preferred method)
    const cookieToken = getTokenFromCookie(request);
    if (cookieToken) {
        return cookieToken;
    }

    // Fall back to Authorization header (for API clients, mobile apps, etc.)
    const authHeader = request.headers.get('authorization');
    return extractTokenFromHeader(authHeader || undefined);
}

export function verifyRequestToken(request: HttpRequest): JWTPayload | null {
    const token = getTokenFromRequest(request);
    if (!token) {
        return null;
    }
    return verifyToken(token);
}

// Extract request metadata for audit logging
export interface RequestMetadata {
    ipAddress: string;
    userAgent: string;
}

export function getRequestMetadata(request: HttpRequest): RequestMetadata {
    // Get IP address (Azure provides this in x-forwarded-for header)
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

    // Get user agent
    const userAgent = request.headers.get('user-agent') || 'unknown';

    return { ipAddress, userAgent };
}

// Role-based permission checks
export function getPermissionsForRole(role: 'manager' | 'bcba' | 'rbt' | null, userType: 'org' | 'parent'): string[] {
    if (userType === 'parent') {
        return ['view_own_learners', 'view_sessions'];
    }

    switch (role) {
        case 'manager':
            return [
                'manage_users',
                'manage_learners',
                'view_all_learners',
                'edit_sessions',
                'view_reports',
                'manage_org_settings'
            ];
        case 'bcba':
            return [
                'view_all_learners',
                'edit_sessions',
                'view_reports',
                'supervise_rbts'
            ];
        case 'rbt':
            return [
                'view_assigned_learners',
                'edit_sessions'
            ];
        default:
            return [];
    }
}
