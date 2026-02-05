import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '../services/cosmosDb.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12;

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
