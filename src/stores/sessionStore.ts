import { create } from 'zustand';
import type { Session } from '../db/db';

interface SessionState {
    currentSession: Session | null;
    noteDraft: string;
    isDrawerOpen: boolean;

    // Actions
    setCurrentSession: (session: Session | null) => void;
    setNoteDraft: (draft: string) => void;
    toggleDrawer: () => void;
    setDrawerOpen: (open: boolean) => void;
    clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
    currentSession: null,
    noteDraft: '',
    isDrawerOpen: false,

    setCurrentSession: (session) => set({ currentSession: session }),

    setNoteDraft: (draft) => set({ noteDraft: draft }),

    toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

    setDrawerOpen: (open) => set({ isDrawerOpen: open }),

    clearSession: () => set({
        currentSession: null,
        noteDraft: ''
    }),
}));
