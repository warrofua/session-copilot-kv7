import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, Learner, Organization } from '../services/authService';
export type { User };
import {
    getMe,
    login as apiLogin,
    register as apiRegister,
    logout as apiLogout
} from '../services/authService';
import { useEncryptionStore } from '../stores/encryptionStore';
import { migrateLegacyPlaintextData } from '../db/db';

export interface AuthContextValue {
    user: User | null;
    learners: Learner[];
    organization: Organization | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    setDemoRole: (role: 'manager' | 'bcba' | 'rbt' | null) => void;
}

export interface RegisterData {
    email: string;
    password: string;
    name: string;
    userType: 'org' | 'parent';
    orgName?: string;
    role?: 'manager' | 'bcba' | 'rbt';
}

import { AuthContext } from './AuthContextInstance';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [learners, setLearners] = useState<Learner[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const initializeEncryption = useEncryptionStore((state) => state.initializeWithPassword);
    const clearEncryption = useEncryptionStore((state) => state.clear);

    const refreshUser = useCallback(async () => {
        try {
            const data = await getMe();
            if (!useEncryptionStore.getState().isReady) {
                setError('Local encrypted data is locked. Sign out and sign in again to unlock offline records.');
            }
            setUser(data.user);
            setLearners(data.learners);
            setOrganization(data.organization);
            if (useEncryptionStore.getState().isReady) {
                setError(null);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            const isExpectedUnauthenticated = message === 'Session expired';
            if (!isExpectedUnauthenticated) {
                console.error('Failed to refresh user:', err);
            }
            clearEncryption();
            setUser(null);
            setLearners([]);
            setOrganization(null);
            if (!isExpectedUnauthenticated) {
                setError('Unable to refresh user session.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [clearEncryption]);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiLogin(email, password);
            if (!response.user.encryptionSalt) {
                throw new Error('Account encryption is not configured');
            }
            await initializeEncryption(password, response.user.encryptionSalt);
            await migrateLegacyPlaintextData();
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
            if (!response.user.encryptionSalt) {
                throw new Error('Account encryption is not configured');
            }
            await initializeEncryption(data.password, response.user.encryptionSalt);
            await migrateLegacyPlaintextData();
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

    const logout = useCallback(async () => {
        await apiLogout();
        clearEncryption();
        setUser(null);
        setLearners([]);
        setOrganization(null);
        setError(null);
    }, [clearEncryption]);

    useEffect(() => {
        if (!user) {
            return;
        }

        let timeoutId = window.setTimeout(() => {
            void logout();
        }, SESSION_TIMEOUT_MS);

        const reset = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                void logout();
            }, SESSION_TIMEOUT_MS);
        };

        const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        for (const eventName of activityEvents) {
            window.addEventListener(eventName, reset, { passive: true });
        }

        return () => {
            window.clearTimeout(timeoutId);
            for (const eventName of activityEvents) {
                window.removeEventListener(eventName, reset);
            }
        };
    }, [user, logout]);

    // Demo only: override role
    const [demoRole, setDemoRole] = useState<'manager' | 'bcba' | 'rbt' | null>(null);

    const effectiveUser = useMemo(() => {
        if (!user) return null;
        if (demoRole) {
            return { ...user, role: demoRole };
        }
        return user;
    }, [user, demoRole]);

    const value: AuthContextValue = {
        user: effectiveUser,
        learners,
        organization,
        isLoading,
        isAuthenticated: !!user,
        error,
        login,
        register,
        logout,
        refreshUser,
        setDemoRole
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
