import type { User } from '../contexts/AuthContext';

export interface CreateUserRequest {
    email: string;
    name: string;
    role: 'manager' | 'bcba' | 'rbt';
    password: string;
}

export interface UserService {
    getUsers: () => Promise<User[]>;
    createUser: (data: CreateUserRequest) => Promise<User>;
}

const API_Base = '/api';

export const userService: UserService = {
    getUsers: async () => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_Base}/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        return data.users;
    },

    createUser: async (userData: CreateUserRequest) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_Base}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }

        const data = await response.json();
        return data.user;
    }
};
