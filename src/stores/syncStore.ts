import { create } from 'zustand';
import {
    getUnsyncedBehaviorEvents,
    getUnsyncedCount,
    getUnsyncedIncidents,
    getUnsyncedSessionNotes,
    getUnsyncedSkillTrials,
    markBehaviorEventSynced,
    markIncidentSynced,
    markSessionNoteSynced,
    markSkillTrialSynced
} from '../db/db';
import type { SyncableDocument, SyncResult } from '../types/sync';
import { useEncryptionStore } from './encryptionStore';
import { dateReplacer } from '../services/encryptionService';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error' | 'not-configured';

/**
 * Manages synchronization status between local IndexedDB and the cloud backend.
 * Handles online/offline detection and batch syncing.
 */
interface SyncState {
    status: SyncStatus;
    unsyncedCount: number;
    lastSyncTime: Date | null;
    isOnline: boolean;
    isSyncing: boolean;

    // Actions
    setStatus: (status: SyncStatus) => void;
    setUnsyncedCount: (count: number) => void;
    incrementUnsyncedCount: () => void;
    decrementUnsyncedCount: () => void;
    setOnline: (online: boolean) => void;
    setLastSyncTime: (time: Date) => void;
    /** Pushes all unsynced local data to the cloud. */
    syncToCloud: () => Promise<{ success: number; failed: number }>;
    refreshUnsyncedCount: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
    status: navigator.onLine ? 'synced' : 'offline',
    unsyncedCount: 0,
    lastSyncTime: null,
    isOnline: navigator.onLine,
    isSyncing: false,

    setStatus: (status) => set({ status }),
    setUnsyncedCount: (count) => set({ unsyncedCount: count }),
    incrementUnsyncedCount: () => set((state) => ({ unsyncedCount: state.unsyncedCount + 1 })),
    decrementUnsyncedCount: () => set((state) => ({
        unsyncedCount: Math.max(0, state.unsyncedCount - 1)
    })),
    setOnline: (online) => set({
        isOnline: online,
        status: online ? 'synced' : 'offline'
    }),
    setLastSyncTime: (time) => set({ lastSyncTime: time }),

    refreshUnsyncedCount: async () => {
        if (!useEncryptionStore.getState().isReady) {
            set({ unsyncedCount: 0 });
            return;
        }
        const unsyncedCount = await getUnsyncedCount();
        set({ unsyncedCount });
    },

    syncToCloud: async () => {
        const { isSyncing, isOnline } = get();

        // Don't sync if already syncing or offline
        if (isSyncing) return { success: 0, failed: 0 };
        if (!isOnline) {
            set({ status: 'offline' });
            return { success: 0, failed: 0 };
        }
        if (!useEncryptionStore.getState().isReady) {
            set({ status: 'error' });
            return { success: 0, failed: get().unsyncedCount };
        }

        set({ isSyncing: true, status: 'syncing' });

        try {
            // Fetch and decrypt all unsynced items
            const unsyncedBehaviors = await getUnsyncedBehaviorEvents();
            const unsyncedTrials = await getUnsyncedSkillTrials();
            const unsyncedNotes = await getUnsyncedSessionNotes();
            const unsyncedIncidents = await getUnsyncedIncidents();

            // Convert to SyncableDocuments
            const documents: SyncableDocument[] = [];

            for (const behavior of unsyncedBehaviors) {
                documents.push({
                    id: `behavior-${behavior.id}`,
                    sessionId: behavior.sessionId,
                    entityType: 'behavior',
                    data: behavior as unknown as Record<string, unknown>,
                    syncedAt: new Date().toISOString()
                });
            }

            for (const trial of unsyncedTrials) {
                documents.push({
                    id: `skillTrial-${trial.id}`,
                    sessionId: trial.sessionId,
                    entityType: 'skillTrial',
                    data: trial as unknown as Record<string, unknown>,
                    syncedAt: new Date().toISOString()
                });
            }

            for (const note of unsyncedNotes) {
                documents.push({
                    id: `note-${note.id}`,
                    sessionId: note.sessionId,
                    entityType: 'note',
                    data: note as unknown as Record<string, unknown>,
                    syncedAt: new Date().toISOString()
                });
            }

            for (const incident of unsyncedIncidents) {
                documents.push({
                    id: `incident-${incident.id}`,
                    sessionId: incident.sessionId,
                    entityType: 'incident',
                    data: incident as unknown as Record<string, unknown>,
                    syncedAt: new Date().toISOString()
                });
            }

            if (documents.length === 0) {
                set({ isSyncing: false, status: 'synced', unsyncedCount: 0 });
                return { success: 0, failed: 0 };
            }

            // Send to backend API for syncing
            const response = await fetch('/api/sync/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Important: send HttpOnly cookies
                body: JSON.stringify({ documents }, dateReplacer)
            });

            if (!response.ok) {
                throw new Error(`Sync API error: ${response.status} ${response.statusText}`);
            }

            const result: SyncResult = await response.json();

            // Mark successfully synced items in Dexie
            if (result.success > 0) {
                for (const behavior of unsyncedBehaviors) {
                    if (typeof behavior.id === 'number') {
                        await markBehaviorEventSynced(behavior.id);
                    }
                }
                for (const trial of unsyncedTrials) {
                    if (typeof trial.id === 'number') {
                        await markSkillTrialSynced(trial.id);
                    }
                }
                for (const note of unsyncedNotes) {
                    if (typeof note.id === 'number') {
                        await markSessionNoteSynced(note.id);
                    }
                }
                for (const incident of unsyncedIncidents) {
                    if (typeof incident.id === 'number') {
                        await markIncidentSynced(incident.id);
                    }
                }
            }

            // Update state
            const newStatus = result.failed > 0 ? 'error' : 'synced';
            set({
                isSyncing: false,
                status: newStatus,
                lastSyncTime: new Date(),
                unsyncedCount: result.failed
            });

            console.log(`[SyncStore] Sync complete: ${result.success} success, ${result.failed} failed`);
            return result;

        } catch (error) {
            console.error('[SyncStore] Sync error:', error);
            set({ isSyncing: false, status: 'error' });
            return { success: 0, failed: get().unsyncedCount };
        }
    }
}));

// Setup online/offline listeners
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        useSyncStore.getState().setOnline(true);
        // Auto-sync when coming back online
        useSyncStore.getState().syncToCloud();
    });

    window.addEventListener('offline', () => {
        useSyncStore.getState().setOnline(false);
    });

    // Initial unsynced count
    useSyncStore.getState().refreshUnsyncedCount();
}
