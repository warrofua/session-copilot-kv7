import type { User } from './authService';

export interface CreateUserRequest {
    email: string;
    name: string;
    role: 'manager' | 'bcba' | 'rbt';
    password: string;
    /** Optional list of learner IDs to assign to this user */
    assignedLearnerIds?: string[];
}

export interface UserService {
    getUsers: () => Promise<User[]>;
    createUser: (data: CreateUserRequest) => Promise<User>;
    updateUser: (data: UpdateUserRequest) => Promise<User>;
}

export interface UpdateUserRequest {
    id: string;
    name?: string;
    role?: 'manager' | 'bcba' | 'rbt';
    isActive?: boolean;
    assignedLearnerIds?: string[];
}

const API_BASE = '/api';



/**
 * Service for managing users (Organization Admins/Managers only).
 */
export const userService: UserService = {
    getUsers: async () => {
        const response = await fetch(`${API_BASE}/users`, {
            credentials: 'include' // Important: send HttpOnly cookies
        });

        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        return data.users;
    },

    createUser: async (userData: CreateUserRequest) => {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important: send HttpOnly cookies
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }

        const data = await response.json();
        return data.user;
    },

    updateUser: async (userData: UpdateUserRequest) => {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update user');
        }

        const data = await response.json();
        return data.user;
    }
};
