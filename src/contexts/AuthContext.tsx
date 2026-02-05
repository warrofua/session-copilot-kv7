import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Learner, Organization } from '../services/authService';
export type { User };
import {
    getToken,
    getMe,
    login as apiLogin,
    register as apiRegister,
    logout as apiLogout,
    removeToken
} from '../services/authService';

interface AuthContextValue {
    user: User | null;
    learners: Learner[];
    organization: Organization | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

interface RegisterData {
    email: string;
    password: string;
    name: string;
    userType: 'org' | 'parent';
    orgName?: string;
    role?: 'manager' | 'bcba' | 'rbt';
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [learners, setLearners] = useState<Learner[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshUser = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setUser(null);
            setLearners([]);
            setOrganization(null);
            setIsLoading(false);
            return;
        }

        try {
            const data = await getMe();
            setUser(data.user);
            setLearners(data.learners);
            setOrganization(data.organization);
            setError(null);
        } catch (err) {
            console.error('Failed to refresh user:', err);
            setUser(null);
            setLearners([]);
            setOrganization(null);
            removeToken();
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiLogin(email, password);
            setUser(response.user);
            await refreshUser(); // Get full user data with learners
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Login failed';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (data: RegisterData) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiRegister(data);
            setUser(response.user);
            await refreshUser();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Registration failed';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        apiLogout();
        setUser(null);
        setLearners([]);
        setOrganization(null);
        setError(null);
    };

    const value: AuthContextValue = {
        user,
        learners,
        organization,
        isLoading,
        isAuthenticated: !!user,
        error,
        login,
        register,
        logout,
        refreshUser
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Hook for protected routes
export function useRequireAuth(redirectTo = '/login') {
    const { isAuthenticated, isLoading } = useAuth();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            window.location.href = redirectTo;
        }
    }, [isAuthenticated, isLoading, redirectTo]);

    return { isAuthenticated, isLoading };
}
