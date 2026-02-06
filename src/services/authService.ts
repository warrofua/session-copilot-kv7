// Auth service for frontend
// Handles API calls to authentication endpoints

const API_BASE = '/api';

async function parseApiJson<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return null;
    }

    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
    const body = await parseApiJson<{ error?: string; details?: string }>(response);
    if (!body) {
        return `${fallback} (status ${response.status})`;
    }

    if (body.details) {
        return `${body.error || fallback}: ${body.details}`;
    }

    return body.error || fallback;
}

export interface User {
    id: string;
    email: string;
    userType: 'org' | 'parent';
    orgId: string | null;
    role: 'manager' | 'bcba' | 'rbt' | null;
    name: string;
    assignedLearnerIds: string[];
    permissions: string[];
    isActive: boolean;
    encryptionSalt: string;
}

export interface Learner {
    id: string;
    orgId: string;
    name: string;
    dob: string;
    status: 'active' | 'inactive' | 'discharged';
}

export interface Organization {
    id: string;
    name: string;
    settings: {
        defaultSessionDuration: number;
        requireSupervisorApproval: boolean;
    };
}

export interface AuthResponse {
    user: User;
}

export interface MeResponse {
    user: User;
    organization: Organization | null;
    learners: Learner[];
}

// API calls
export async function login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: send/receive cookies
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Login failed'));
    }

    const data = await parseApiJson<AuthResponse>(response);
    if (!data) {
        throw new Error('Login failed: server returned an invalid response');
    }

    return data;
}

export async function register(registerData: {
    email: string;
    password: string;
    name: string;
    userType: 'org' | 'parent';
    orgName?: string;
    role?: 'manager' | 'bcba' | 'rbt';
}): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: send/receive cookies
        body: JSON.stringify(registerData)
    });

    if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Registration failed'));
    }

    const authResponse = await parseApiJson<AuthResponse>(response);
    if (!authResponse) {
        throw new Error('Registration failed: server returned an invalid response');
    }

    return authResponse;
}

export async function getMe(): Promise<MeResponse> {
    const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include' // Important: send cookies
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Session expired');
        }
        throw new Error(await getApiErrorMessage(response, 'Failed to get user info'));
    }

    const data = await parseApiJson<MeResponse>(response);
    if (!data) {
        throw new Error('Failed to get user info: server returned an invalid response');
    }

    return data;
}

export async function logout(): Promise<void> {
    try {
        // Call logout endpoint to clear HttpOnly cookie
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include' // Important: send cookies
        });
    } catch (error) {
        console.error('Logout error:', error);
        // Continue with logout even if API call fails
    }

    // Session cookie is managed by backend.
}

// Permission checks
export function hasPermission(user: User | null, permission: string): boolean {
    if (!user) return false;
    return user.permissions.includes(permission);
}

export function canManageUsers(user: User | null): boolean {
    return hasPermission(user, 'manage_users');
}

export function canViewAllLearners(user: User | null): boolean {
    return hasPermission(user, 'view_all_learners');
}

export function canAccessLearner(user: User | null, learnerId: string): boolean {
    if (!user) return false;

    // Manager/BCBA can access all org learners
    if (user.role === 'manager' || user.role === 'bcba') {
        return true;
    }

    // RBT and parents only access assigned learners
    return user.assignedLearnerIds.includes(learnerId);
}
