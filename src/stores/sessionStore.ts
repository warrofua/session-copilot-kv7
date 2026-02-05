import { create } from 'zustand';
import type { Session, BehaviorEvent, SkillTrial, Incident } from '../db/db';

interface SessionState {
    currentSession: Session | null;
    behaviorEvents: BehaviorEvent[];
    skillTrials: SkillTrial[];
    incidents: Incident[];
    noteDraft: string;
    isDrawerOpen: boolean;

    // Actions
    setCurrentSession: (session: Session | null) => void;
    addBehaviorEvent: (event: BehaviorEvent) => void;
    updateBehaviorEvent: (id: number, updates: Partial<BehaviorEvent>) => void;
    addSkillTrial: (trial: SkillTrial) => void;
    addIncident: (incident: Incident) => void;
    setNoteDraft: (draft: string) => void;
    toggleDrawer: () => void;
    setDrawerOpen: (open: boolean) => void;
    clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
    currentSession: null,
    behaviorEvents: [],
    skillTrials: [],
    incidents: [],
    noteDraft: '',
    isDrawerOpen: false,

    setCurrentSession: (session) => set({ currentSession: session }),

    addBehaviorEvent: (event) => set((state) => ({
        behaviorEvents: [...state.behaviorEvents, event]
    })),

    updateBehaviorEvent: (id, updates) => set((state) => ({
        behaviorEvents: state.behaviorEvents.map(e =>
            e.id === id ? { ...e, ...updates } : e
        )
    })),

    addSkillTrial: (trial) => set((state) => ({
        skillTrials: [...state.skillTrials, trial]
    })),

    addIncident: (incident) => set((state) => ({
        incidents: [...state.incidents, incident]
    })),

    setNoteDraft: (draft) => set({ noteDraft: draft }),

    toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

    setDrawerOpen: (open) => set({ isDrawerOpen: open }),

    clearSession: () => set({
        currentSession: null,
        behaviorEvents: [],
        skillTrials: [],
        incidents: [],
        noteDraft: ''
    }),
}));
