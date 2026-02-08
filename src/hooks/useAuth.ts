import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContextInstance';
import type { AuthContextValue } from '../contexts/AuthContext';

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
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate(redirectTo);
        }
    }, [isAuthenticated, isLoading, redirectTo, navigate]);

    return { isAuthenticated, isLoading };
}
