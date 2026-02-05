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
    token: string;
    user: User;
}

export interface MeResponse {
    user: User;
    organization: Organization | null;
    learners: Learner[];
}

// Token management
const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

// API calls
export async function login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setToken(data.token);
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
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.details ? `${error.error}: ${error.details}` : (error.error || 'Registration failed');
        throw new Error(errorMessage);
    }

    const result = await response.json();
    setToken(result.token);
    return result;
}

export async function getMe(): Promise<MeResponse> {
    const token = getToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        if (response.status === 401) {
            removeToken();
            throw new Error('Session expired');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to get user info');
    }

    return response.json();
}

export function logout(): void {
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
