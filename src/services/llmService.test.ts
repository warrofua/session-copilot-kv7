import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUserInput } from './llmService';

describe('LLM Service - Offline Regex Parsing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline mode for testing')));
    });

    it('should correctly identify "elopement" with duration', async () => {
        const input = "He ran away for 2 minutes";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(1);
        expect(result.behaviors[0]).toMatchObject({
            type: 'elopement',
            duration: 120
        });
        expect(result.behaviors[0].count).toBeUndefined();
    });

    it('should correctly identify "aggression" (keyword catch)', async () => {
        const input = "Client hit the staff member";
        const result = await parseUserInput(input);

        expect(result.behaviors[0]).toMatchObject({
            type: 'aggression',
            count: 1
        });
    });

    it('should identify multiple behaviors', async () => {
        const input = "He screamed and kicked the wall";
        const result = await parseUserInput(input);

        const types = result.behaviors.map(b => b.type);
        expect(types).toContain('tantrum');
        expect(types).toContain('aggression');
    });

    it('should identify skill trials', async () => {
        const input = "Ran a matching trial, target was blue, incorrect response";
        const result = await parseUserInput(input);

        expect(result.skillTrials).toHaveLength(1);
        expect(result.skillTrials?.[0]).toMatchObject({
            response: 'Incorrect'
        });
    });

    it('should identify reinforcement', async () => {
        const input = "Gave token for compliance";
        const result = await parseUserInput(input);

        expect(result.reinforcement).toEqual({
            type: 'Reinforcement',
            delivered: true
        });
    });
});
