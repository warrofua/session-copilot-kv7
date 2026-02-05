import { describe, expect, it } from 'vitest';
import { deriveSigningKey, signData, verifySignature } from './integrityService';

describe('integrityService', () => {
    const password = 'TestPassword123!';
    const salt = 'R0nZQw6w8P0Q2L7M4nV9hA==';

    it('signs and verifies payload signatures', async () => {
        const key = await deriveSigningKey(password, salt);
        const payload = { behaviorType: 'tantrum', count: 2, notes: 'brief' };

        const signature = await signData(payload, key);
        const isValid = await verifySignature(payload, signature, key);

        expect(isValid).toBe(true);
    });

    it('fails verification when payload is modified', async () => {
        const key = await deriveSigningKey(password, salt);
        const original = { behaviorType: 'tantrum', count: 2 };
        const tampered = { behaviorType: 'tantrum', count: 3 };

        const signature = await signData(original, key);
        const isValid = await verifySignature(tampered, signature, key);

        expect(isValid).toBe(false);
    });
});
