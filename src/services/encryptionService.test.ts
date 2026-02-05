import { describe, expect, it } from 'vitest';
import { decryptJson, deriveEncryptionKey, encryptJson } from './encryptionService';

describe('encryptionService', () => {
    const password = 'TestPassword123!';
    const salt = 'R0nZQw6w8P0Q2L7M4nV9hA==';

    it('encrypts and decrypts object payloads', async () => {
        const key = await deriveEncryptionKey(password, salt);
        const payload = {
            behaviorType: 'tantrum',
            notes: 'Client screamed for 2 minutes',
            count: 1
        };

        const encrypted = await encryptJson(payload, key);
        const decrypted = await decryptJson<typeof payload>(encrypted, key);

        expect(encrypted.ciphertext).not.toContain('tantrum');
        expect(decrypted).toEqual(payload);
    });

    it('creates different ciphertext for same plaintext due to random IV', async () => {
        const key = await deriveEncryptionKey(password, salt);
        const payload = { message: 'same text' };

        const a = await encryptJson(payload, key);
        const b = await encryptJson(payload, key);

        expect(a.iv).not.toEqual(b.iv);
        expect(a.ciphertext).not.toEqual(b.ciphertext);
    });

    it('preserves date values after decrypt', async () => {
        const key = await deriveEncryptionKey(password, salt);
        const now = new Date('2026-02-05T14:30:00.000Z');
        const payload = { timestamp: now };

        const encrypted = await encryptJson(payload, key);
        const decrypted = await decryptJson<{ timestamp: Date }>(encrypted, key);

        expect(decrypted.timestamp instanceof Date).toBe(true);
        expect(decrypted.timestamp.toISOString()).toEqual(now.toISOString());
    });
});
