// Auth service for frontend
// Handles API calls to authentication endpoints

const API_BASE = '/api';

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

// Token management (DEPRECATED - tokens now in HttpOnly cookies)
// These functions are kept for backward compatibility with sync service
// but are no-ops since tokens are now managed server-side
const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
    // Tokens are now in HttpOnly cookies, not accessible to JavaScript
    // This function kept for backward compatibility with sync service
    // Return null to trigger "not authenticated" flow in sync
    return null;
}

export function setToken(_token: string): void {
    // No-op: tokens now set as HttpOnly cookies by backend
    // Kept for backward compatibility
}

export function removeToken(): void {
    // No-op: token cleared via logout endpoint
    // Clean up any old tokens that might exist
    localStorage.removeItem(TOKEN_KEY);
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
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    // Token is now in HttpOnly cookie, not in response body
    return data;
}

export async function register(data: {
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
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.details ? `${error.error}: ${error.details}` : (error.error || 'Registration failed');
        throw new Error(errorMessage);
    }

    const result = await response.json();
    // Token is now in HttpOnly cookie, not in response body
    return result;
}

export async function getMe(): Promise<MeResponse> {
    const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include' // Important: send cookies
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Session expired');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to get user info');
    }

    return response.json();
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

    // Clean up any old localStorage tokens
    removeToken();
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
