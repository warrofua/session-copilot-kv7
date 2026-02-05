import { create } from 'zustand';
import { decryptJson, deriveEncryptionKey, encryptJson, type EncryptedData } from '../services/encryptionService';
import { deriveSigningKey, signData, verifySignature } from '../services/integrityService';

interface EncryptionState {
    key: CryptoKey | null;
    signingKey: CryptoKey | null;
    salt: string | null;
    isReady: boolean;
    error: string | null;
    initializeWithPassword: (password: string, salt: string) => Promise<void>;
    initialize: (password: string, salt: string) => Promise<void>;
    clear: () => void;
    getKey: () => CryptoKey;
    getSigningKey: () => CryptoKey;
    encryptData: <T>(value: T) => Promise<EncryptedData>;
    decryptData: <T>(value: EncryptedData) => Promise<T>;
    signPayload: (value: unknown) => Promise<string>;
    verifyPayload: (value: unknown, signature: string) => Promise<boolean>;
}

export const useEncryptionStore = create<EncryptionState>((set, get) => ({
    key: null,
    signingKey: null,
    salt: null,
    isReady: false,
    error: null,
    initializeWithPassword: async (password: string, salt: string) => {
        try {
            const key = await deriveEncryptionKey(password, salt);
            const signingKey = await deriveSigningKey(password, salt);
            set({ key, signingKey, salt, isReady: true, error: null });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to initialize encryption';
            set({ key: null, signingKey: null, salt: null, isReady: false, error: message });
            throw error;
        }
    },
    initialize: async (password: string, salt: string) => {
        await get().initializeWithPassword(password, salt);
    },
    clear: () => set({ key: null, signingKey: null, salt: null, isReady: false, error: null }),
    getKey: () => {
        const key = get().key;
        if (!key) {
            throw new Error('Encryption key is not initialized');
        }
        return key;
    },
    getSigningKey: () => {
        const signingKey = get().signingKey;
        if (!signingKey) {
            throw new Error('Integrity key is not initialized');
        }
        return signingKey;
    },
    encryptData: async <T,>(value: T) => {
        return encryptJson(value, get().getKey());
    },
    decryptData: async <T,>(value: EncryptedData) => {
        return decryptJson<T>(value, get().getKey());
    },
    signPayload: async (value: unknown) => {
        return signData(value, get().getSigningKey());
    },
    verifyPayload: async (value: unknown, signature: string) => {
        return verifySignature(value, signature, get().getSigningKey());
    }
}));
