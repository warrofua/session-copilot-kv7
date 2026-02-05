import { create } from 'zustand';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

interface SyncState {
    status: SyncStatus;
    unsyncedCount: number;
    lastSyncTime: Date | null;
    isOnline: boolean;

    // Actions
    setStatus: (status: SyncStatus) => void;
    setUnsyncedCount: (count: number) => void;
    incrementUnsyncedCount: () => void;
    decrementUnsyncedCount: () => void;
    setOnline: (online: boolean) => void;
    setLastSyncTime: (time: Date) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
    status: navigator.onLine ? 'synced' : 'offline',
    unsyncedCount: 0,
    lastSyncTime: null,
    isOnline: navigator.onLine,

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
}));

// Setup online/offline listeners
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        useSyncStore.getState().setOnline(true);
    });

    window.addEventListener('offline', () => {
        useSyncStore.getState().setOnline(false);
    });
}
