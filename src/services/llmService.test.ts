import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateConfirmation, parseUserInput, type ParsedInput } from './llmService';

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
            type: 'Token',
            delivered: true,
            details: input
        });
    });

    it('should parse skill prompt level from natural language', async () => {
        const input = "matching trial blue incorrect after verbal prompt";
        const result = await parseUserInput(input);

        expect(result.skillTrials).toHaveLength(1);
        expect(result.skillTrials?.[0]).toMatchObject({
            skill: 'Matching',
            target: 'blue',
            response: 'Incorrect',
            promptLevel: 'verbal'
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

    it('should not treat "demand" as a mand skill trial', async () => {
        const input = "Client hit 3 times during clean up demand";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(1);
        expect(result.behaviors[0].type).toBe('aggression');
        expect(result.skillTrials).toHaveLength(0);
    });

    it('should not infer a skill trial from generic target-behavior language', async () => {
        const input = "Target behavior tantrum for 2 min after transition";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(1);
        expect(result.behaviors[0]).toMatchObject({
            type: 'tantrum',
            duration: 120
        });
        expect(result.skillTrials).toHaveLength(0);
    });

    it('should not classify plain "no" text as refusal', async () => {
        const input = "No injury occurred; session ended calmly";
        const result = await parseUserInput(input);

        expect(result.behaviors).toHaveLength(0);
        expect(result.skillTrials).toHaveLength(0);
        expect(result.needsClarification).toBe(true);
    });

    type BehaviorExpectation = Partial<ParsedInput['behaviors'][number]>;
    type SkillExpectation = Partial<NonNullable<ParsedInput['skillTrials']>[number]>;

    const bcbaShorthandMatrix: Array<{
        name: string;
        input: string;
        expected: {
            behaviorCount: number;
            skillTrialCount: number;
            behaviors?: BehaviorExpectation[];
            skillTrials?: SkillExpectation[];
            antecedent?: ParsedInput['antecedent'];
            functionGuess?: ParsedInput['functionGuess'];
            reinforcement?: string | null;
            needsClarification?: boolean;
        };
    }> = [
        {
            name: 'elopement duration in seconds',
            input: 'Bolted for 30 sec during table work',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'elopement', duration: 30 }],
                reinforcement: null
            }
        },
        {
            name: 'tantrum count with transition antecedent',
            input: 'Screamed two times during transition',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'tantrum', count: 2 }],
                antecedent: 'transition demand',
                reinforcement: null
            }
        },
        {
            name: 'sib duration in minutes',
            input: 'Head bang for 1 minute',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'SIB', duration: 60 }],
                reinforcement: null
            }
        },
        {
            name: 'property destruction count',
            input: 'Threw materials 4 times',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'property_destruction', count: 4 }],
                reinforcement: null
            }
        },
        {
            name: 'refusal from explicit non-compliance wording',
            input: 'Client refused and did not comply with instruction',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'refusal' }],
                reinforcement: null
            }
        },
        {
            name: 'stereotypy shorthand',
            input: 'Hand flap for 45 s',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'stereotypy', duration: 45 }],
                reinforcement: null
            }
        },
        {
            name: 'tangible inference from denied ipad antecedent',
            input: 'Denied iPad then tantrum for 1 min',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'tantrum', duration: 60 }],
                antecedent: 'denied access to iPad',
                functionGuess: 'tangible',
                reinforcement: null
            }
        },
        {
            name: 'escape inference from avoid wording',
            input: 'Client tried to avoid task and screamed',
            expected: {
                behaviorCount: 1,
                skillTrialCount: 0,
                behaviors: [{ type: 'tantrum' }],
                functionGuess: 'escape',
                reinforcement: null
            }
        },
        {
            name: 'matching trial shorthand',
            input: 'matching trial blue incorrect',
            expected: {
                behaviorCount: 0,
                skillTrialCount: 1,
                skillTrials: [{ skill: 'Matching', target: 'blue', response: 'Incorrect' }],
                reinforcement: null
            }
        },
        {
            name: 'dtt target with independent correct',
            input: 'DTT target apple correct independent',
            expected: {
                behaviorCount: 0,
                skillTrialCount: 1,
                skillTrials: [{ skill: 'Dtt', target: 'apple', response: 'Correct', promptLevel: 'independent' }],
                reinforcement: null
            }
        },
        {
            name: 'worked on action with prompted response',
            input: 'Tried tying shoes with gestural prompt',
            expected: {
                behaviorCount: 0,
                skillTrialCount: 1,
                skillTrials: [{ skill: 'Tying shoes', response: 'Incorrect', promptLevel: 'gestural' }],
                reinforcement: null
            }
        },
        {
            name: 'reinforcement from sticker and praise',
            input: 'Provided sticker and praise for compliance',
            expected: {
                behaviorCount: 0,
                skillTrialCount: 0,
                reinforcement: 'Praise + Sticker'
            }
        }
    ];

    for (const scenario of bcbaShorthandMatrix) {
        it(`matrix: ${scenario.name}`, async () => {
            const result = await parseUserInput(scenario.input);

            expect(result.behaviors).toHaveLength(scenario.expected.behaviorCount);
            expect(result.skillTrials ?? []).toHaveLength(scenario.expected.skillTrialCount);

            if (scenario.expected.behaviors) {
                for (const expectedBehavior of scenario.expected.behaviors) {
                    expect(result.behaviors).toEqual(
                        expect.arrayContaining([expect.objectContaining(expectedBehavior)])
                    );
                }
            }

            if (scenario.expected.skillTrials) {
                for (const expectedTrial of scenario.expected.skillTrials) {
                    expect(result.skillTrials ?? []).toEqual(
                        expect.arrayContaining([expect.objectContaining(expectedTrial)])
                    );
                }
            }

            if (scenario.expected.antecedent !== undefined) {
                expect(result.antecedent).toBe(scenario.expected.antecedent);
            }

            if (scenario.expected.functionGuess !== undefined) {
                expect(result.functionGuess).toBe(scenario.expected.functionGuess);
            }

            if (scenario.expected.reinforcement !== undefined) {
                if (scenario.expected.reinforcement === null) {
                    expect(result.reinforcement).toBeUndefined();
                } else {
                    expect(result.reinforcement).toMatchObject({
                        type: scenario.expected.reinforcement,
                        delivered: true
                    });
                }
            }

            if (scenario.expected.needsClarification !== undefined) {
                expect(result.needsClarification).toBe(scenario.expected.needsClarification);
            }
        });
    }

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

    it('should parse "skill - <target>" syntax with explicit target phrases', async () => {
        const input = 'skill - put on hat correct independent';
        const result = await parseUserInput(input);

        expect(result.skillTrials).toHaveLength(1);
        expect(result.skillTrials?.[0]).toMatchObject({
            skill: 'Generic Trial',
            target: 'put on hat',
            response: 'Correct'
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
