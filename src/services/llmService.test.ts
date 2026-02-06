import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateConfirmation, parseUserInput } from './llmService';

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

    it('should not misclassify denied ipad antecedent as reinforcement', async () => {
        const input = "Antecedent denied ipad, behavior tantrum 2 min, consequence redirect to table";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(1);
        expect(result.behaviors[0]).toMatchObject({
            type: 'tantrum',
            duration: 120
        });
        expect(result.reinforcement).toBeUndefined();
    });

    // Regression Tests (User Reported)
    it('should parse "Log tantrum for 5 mins"', async () => {
        const input = "Log tantrum for 5 mins";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(1);
        expect(result.behaviors[0]).toMatchObject({
            type: 'tantrum',
            duration: 300 // 5 mins * 60
        });
    });

    it('should parse "Log imitation independent correct"', async () => {
        const input = "Log imitation independent correct";
        const result = await parseUserInput(input);

        expect(result.skillTrials).toHaveLength(1);
        expect(result.skillTrials?.[0]).toMatchObject({
            skill: 'Imitation',
            response: 'Correct',
            target: 'Current Target' // Default if not found
        });
    });

    it('should extract inline trial targets from terse RBT shorthand', async () => {
        const input = "matching trial blue incorrect";
        const result = await parseUserInput(input);

        expect(result.skillTrials).toHaveLength(1);
        expect(result.skillTrials?.[0]).toMatchObject({
            skill: 'Matching',
            target: 'blue',
            response: 'Incorrect'
        });
    });

    it('should generate a usable confirmation for reinforcement-only logs', () => {
        const confirmation = generateConfirmation({
            behaviors: [],
            skillTrials: [],
            reinforcement: { type: 'Reinforcement', delivered: true },
            needsClarification: false,
            narrativeFragment: ''
        });

        expect(confirmation.message).toContain('Reinforcement delivered');
    });
});
