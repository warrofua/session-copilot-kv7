// LLM Service using GitHub Models API (OpenAI-compatible)
// Uses GPT-4o-mini for free tier access

const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';
const MODEL_NAME = 'gpt-4o-mini';

// Get token from environment or localStorage for demo
function getApiToken(): string {
    // In production, this would come from secure backend
    // For demo, we use localStorage or env variable
    return localStorage.getItem('github_token') || import.meta.env.VITE_GITHUB_TOKEN || '';
}

export interface ParsedInput {
    behaviors: {
        type: string;
        count?: number;
        duration?: number; // in seconds
    }[];
    antecedent?: string;
    functionGuess?: 'escape' | 'tangible' | 'attention' | 'automatic';
    intervention?: string;
    skillTrials?: {
        skill: string;
        target: string;
        promptLevel?: string;
        response?: string;
    }[];
    reinforcement?: {
        type: string;
        delivered: boolean;
    };
    incident?: boolean;
    note?: boolean;
    needsClarification: boolean;
    clarificationQuestion?: string;
    narrativeFragment: string;
}

export interface ConfirmationResponse {
    message: string;
    buttons: { label: string; action: string; value: string }[];
    followUpQuestions?: string[];
}

const SYSTEM_PROMPT = `You are an ABA (Applied Behavior Analysis) session data assistant. Your job is to help therapists log behavioral data during therapy sessions.

When the user describes what happened, extract:
1. Behavior types (elopement, tantrum, aggression, SIB, property destruction, etc.)
2. Frequency counts
3. Duration in seconds
4. Antecedents (what happened before)
5. Consequences/interventions used
6. Likely behavioral function (escape, tangible, attention, automatic)
7. SKILL TRIALS: If the user mentions a skill trial (e.g. "DTT", "matching", "naming"), extract:
   - Skill name
   - Target (e.g. "blue", "apple")
   - Response (correct/incorrect/prompted)

Common ABA abbreviations:
- SIB = Self-Injurious Behavior
- FCR = Functional Communication Response
- DTT = Discrete Trial Training
- NET = Natural Environment Teaching

Always respond in valid JSON format matching the ParsedInput interface.`;

export async function parseUserInput(userMessage: string): Promise<ParsedInput> {
    const token = getApiToken();

    if (!token) {
        // Demo mode - return mock parsed data
        return mockParseInput(userMessage);
    }

    try {
        const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Parse this therapy session input and extract structured data:\n\n"${userMessage}"\n\nRespond with valid JSON only.` }
                ],
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            console.error('LLM API error:', response.statusText);
            return mockParseInput(userMessage);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (content) {
            try {
                const parsed = JSON.parse(content);
                // Validate and sanitize structure
                return {
                    behaviors: Array.isArray(parsed.behaviors) ? parsed.behaviors : [],
                    skillTrials: Array.isArray(parsed.skillTrials) ? parsed.skillTrials : [],
                    antecedent: parsed.antecedent || undefined,
                    functionGuess: parsed.functionGuess || undefined,
                    intervention: parsed.intervention || undefined,
                    needsClarification: parsed.needsClarification || false,
                    clarificationQuestion: parsed.clarificationQuestion || undefined,
                    narrativeFragment: parsed.narrativeFragment || ''
                };
            } catch (e) {
                console.error('Failed to parse LLM JSON:', e);
                return mockParseInput(userMessage);
            }
        }
    } catch (error) {
        console.error('Error calling LLM:', error);
    }

    return mockParseInput(userMessage);
}

export async function generateNoteDraft(
    behaviors: { type: string; count?: number; duration?: number; antecedent?: string; function?: string; intervention?: string }[],
    skillTrials: { skill: string; target: string; response: string }[],
    clientName: string
): Promise<string> {
    const token = getApiToken();

    if (!token) {
        return mockGenerateNote(behaviors, skillTrials, clientName);
    }

    try {
        const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an ABA session note writer. Write professional, clinical session notes based on the data provided. Use third person and past tense.'
                    },
                    {
                        role: 'user',
                        content: `Write a brief session note for ${clientName}:\n\nBehaviors: ${JSON.stringify(behaviors)}\n\nSkill Trials: ${JSON.stringify(skillTrials)}`
                    }
                ],
                temperature: 0.5,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            return mockGenerateNote(behaviors, skillTrials, clientName);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || mockGenerateNote(behaviors, skillTrials, clientName);
    } catch (error) {
        console.error('Error generating note:', error);
        return mockGenerateNote(behaviors, skillTrials, clientName);
    }
}

// Mock functions for demo mode (no API key)
function mockParseInput(input: string): ParsedInput {
    const lowerInput = input.toLowerCase();
    const behaviors: ParsedInput['behaviors'] = [];
    const skillTrials: ParsedInput['skillTrials'] = [];
    let reinforcement: ParsedInput['reinforcement'] | undefined;

    // --- Behavior Detection ---
    const behaviorPatterns = [
        { type: 'elopement', keywords: ['elopement', 'ran away', 'bolted', 'left room'] },
        { type: 'tantrum', keywords: ['tantrum', 'scream', 'cry', 'flop', 'drop to floor'] },
        { type: 'aggression', keywords: ['aggression', 'hit', 'kick', 'bite', 'scratch', 'pinch'] },
        { type: 'SIB', keywords: ['sib', 'self-injur', 'head bang', 'bit hand', 'bit self'] },
        { type: 'property_destruction', keywords: ['property destruction', 'threw', 'broke', 'ripped'] },
        { type: 'refusal', keywords: ['refusal', 'non-compliance', 'no', 'refused'] },
        { type: 'stereotypy', keywords: ['stereotypy', 'stimming', 'hand flap', 'rocking'] }
    ];

    behaviorPatterns.forEach(pattern => {
        if (pattern.keywords.some(k => lowerInput.includes(k))) {
            console.log('[MockParse] Matched behavior pattern:', pattern.type);
            // Duration Check
            let duration = 0;
            const secMatch = input.match(/(\d+)\s*(sec|s\b|second)/i);
            const minMatch = input.match(/(\d+)\s*(min|m\b|minute)/i);
            if (secMatch) duration += parseInt(secMatch[1]);
            if (minMatch) duration += parseInt(minMatch[1]) * 60;

            console.log('[MockParse] Extracted duration:', duration);

            // Count Check
            const countMatch = input.match(/(\d+|once|twice|two|three|four|five)\s*times?/i);
            const count = countMatch ? parseCount(countMatch[1]) : 1;

            behaviors.push({
                type: pattern.type,
                count: duration > 0 ? undefined : count,
                duration: duration > 0 ? duration : undefined
            });
            console.log('[MockParse] Ensure push:', JSON.stringify(behaviors));
        }
    });

    // --- Skill Trial Detection ---
    console.log('[MockParse] Input:', input);
    const skillKeywords = ['trial', 'skill', 'target', 'dtt', 'matching', 'imitation', 'labeling', 'mand', 'tact'];
    if (skillKeywords.some(k => lowerInput.includes(k))) {
        console.log('[MockParse] Skill keyword detected');
        let skill = 'Unknown Skill';
        let target = 'Current Target'; // Default to generic
        let response = 'Incorrect'; // Default to incorrect (conservative)

        // 1. Extract Skill Name
        // First try to find a known keyword that isn't generic
        const specificSkill = skillKeywords.find(k =>
            lowerInput.includes(k) && !['trial', 'skill', 'target'].includes(k)
        );

        if (specificSkill) {
            skill = specificSkill.charAt(0).toUpperCase() + specificSkill.slice(1);
        } else if (lowerInput.includes('trial')) {
            skill = 'Generic Trial';
        }

        // 2. Extract Response
        if (lowerInput.includes('incorrect') || lowerInput.includes('-') || lowerInput.includes('error') || lowerInput.includes('wrong')) {
            response = 'Incorrect';
        } else if (lowerInput.includes('correct') || lowerInput.includes('+') || lowerInput.includes('independent') || lowerInput.includes('ind')) {
            response = 'Correct';
        } else if (lowerInput.includes('prompt') || lowerInput.includes('help') || lowerInput.includes('assisted')) {
            response = 'Prompted';
        }

        // 3. Extract Target (Heuristic: "target was X", "target X", quotes, or inline trial phrases)
        const quoteMatch = input.match(/"([^"]+)"/);
        const targetMatch = input.match(/target\s+(?:was\s+)?(\w+)/i);
        const inlineTrialTargetMatch = input.match(
            /\b(?:matching|imitation|labeling|mand|tact|trial)\s+(?:trial\s+)?([a-z0-9-]+)\s+(?:correct|incorrect|prompted|independent|error|wrong)\b/i
        );
        const withTargetMatch = input.match(/\b(?:with|for)\s+([a-z0-9-]+)\s+(?:target|trial)?\b/i);

        const nonTargetTokens = new Set(['correct', 'incorrect', 'prompted', 'independent', 'error', 'wrong']);
        const pickTarget = (candidate?: string): string | null => {
            if (!candidate) return null;
            const normalized = candidate.trim().toLowerCase();
            return nonTargetTokens.has(normalized) ? null : candidate.trim();
        };

        const extractedTarget =
            pickTarget(quoteMatch?.[1]) ??
            pickTarget(targetMatch?.[1]) ??
            pickTarget(inlineTrialTargetMatch?.[1]) ??
            pickTarget(withTargetMatch?.[1]);

        if (extractedTarget) {
            target = extractedTarget;
        }

        console.log('[MockParse] Pushing skill trial:', { skill, target, response });
        skillTrials.push({ skill, target, response });
    }

    // --- Reinforcement Detection ---
    const reinforcementVerbPattern = /\b(gave|give|delivered|deliver|provided|provide|earned|reinforced|rewarded)\b/i;
    const reinforcementItemPattern = /\b(token|praise|sticker|candy|reward|reinforcement|preferred item|ipad|break)\b/i;
    if (reinforcementVerbPattern.test(input) && reinforcementItemPattern.test(input)) {
        reinforcement = {
            type: 'Reinforcement',
            delivered: true
        };
    }

    // Detect antecedent
    let antecedent: string | undefined;
    if (lowerInput.includes('ipad') && (lowerInput.includes('done') || lowerInput.includes('denied') || lowerInput.includes('told'))) {
        antecedent = 'denied access to iPad';
    } else if (lowerInput.includes('clean up') || lowerInput.includes('pick up')) {
        antecedent = 'clean-up demand';
    } else if (lowerInput.includes('switch') || lowerInput.includes('transition')) {
        antecedent = 'transition demand';
    }

    // Detect function
    let functionGuess: ParsedInput['functionGuess'];
    if (lowerInput.includes('escape') || lowerInput.includes('avoid')) {
        functionGuess = 'escape';
    } else if (antecedent?.includes('denied') || antecedent?.includes('access')) {
        functionGuess = 'tangible';
    }

    // Narrative generation
    const narrativeFragment = generateNarrativeFragment(behaviors, antecedent);

    return {
        behaviors,
        skillTrials,
        reinforcement,
        antecedent,
        functionGuess,
        intervention: undefined,
        needsClarification: behaviors.length === 0 && skillTrials.length === 0 && !reinforcement,
        clarificationQuestion: behaviors.length === 0 ? 'I detected an event but wasn\'t sure how to categorize it. Can you specify the behavior?' : undefined,
        narrativeFragment
    };
}

function parseCount(str: string): number {
    const map: Record<string, number> = {
        'one': 1, 'two': 2, 'twice': 2, 'three': 3, 'four': 4, 'five': 5
    };
    return map[str.toLowerCase()] || parseInt(str) || 1;
}

function generateNarrativeFragment(
    behaviors: ParsedInput['behaviors'],
    antecedent?: string
): string {
    if (behaviors.length === 0) return '';

    const parts: string[] = [];
    behaviors.forEach(b => {
        if (b.duration) {
            parts.push(`${b.type} lasting ${b.duration} seconds`);
        } else if (b.count && b.count > 1) {
            parts.push(`${b.count} instances of ${b.type}`);
        } else {
            parts.push(b.type);
        }
    });

    let fragment = `Client engaged in ${parts.join(' and ')}`;
    if (antecedent) {
        fragment += ` following ${antecedent}`;
    }
    return fragment + '.';
}

function mockGenerateNote(
    behaviors: { type: string; count?: number; duration?: number; antecedent?: string; function?: string; intervention?: string }[],
    skillTrials: { skill: string; target: string; response: string }[],
    clientName: string
): string {
    const parts: string[] = [];

    if (behaviors.length > 0) {
        const behaviorDescs = behaviors.map(b => {
            let desc = b.type;
            if (b.count && b.count > 1) desc = `${b.count} instances of ${desc}`;
            if (b.duration) desc += ` (${b.duration}s duration)`;
            return desc;
        });
        parts.push(`${clientName} engaged in ${behaviorDescs.join(', ')}.`);

        const withAntecedent = behaviors.find(b => b.antecedent);
        if (withAntecedent) {
            parts.push(`Antecedent: ${withAntecedent.antecedent}.`);
        }

        const withIntervention = behaviors.find(b => b.intervention);
        if (withIntervention) {
            parts.push(`Staff ${withIntervention.intervention}.`);
        }
    }

    if (skillTrials.length > 0) {
        const trialSummary = skillTrials.map(t =>
            `${t.skill} (${t.target}): ${t.response}`
        ).join('; ');
        parts.push(`Skill trials: ${trialSummary}.`);
    }

    return parts.join(' ') || 'Session data pending.';
}

export function generateConfirmation(parsed: ParsedInput): ConfirmationResponse {
    if (parsed.needsClarification) {
        return {
            message: parsed.clarificationQuestion || 'Could you provide more details?',
            buttons: [
                { label: 'Log Behavior', action: 'logBehavior', value: 'open' },
                { label: 'Log Skill Trial', action: 'logSkillTrial', value: 'open' }
            ]
        };
    }

    const behaviorSummary = parsed.behaviors.map(b => {
        if (b.duration) return `${b.type} (${b.duration}s)`;
        if (b.count && b.count > 1) return `${b.count}x ${b.type}`;
        return b.type;
    }).join(', ');

    const skillSummary = parsed.skillTrials?.map(t =>
        `${t.skill} (${t.target}): ${t.response}`
    ).join(', ') || '';

    const summaryParts = [];
    if (behaviorSummary) summaryParts.push(behaviorSummary);
    if (skillSummary) summaryParts.push(skillSummary);
    if (parsed.reinforcement?.delivered) summaryParts.push(`${parsed.reinforcement.type} delivered`);

    const combinedSummary = summaryParts.join(' + ');

    const message = parsed.antecedent
        ? `Logging: ${combinedSummary} after ${parsed.antecedent}. Is this correct?`
        : `Logging: ${combinedSummary}. Is this correct?`;

    const buttons: ConfirmationResponse['buttons'] = [
        { label: 'Yes', action: 'confirm', value: 'yes' },
        { label: 'No', action: 'confirm', value: 'no' }
    ];

    const followUpQuestions: string[] = [];
    if (!parsed.functionGuess) {
        followUpQuestions.push('What was the likely function?');
    }
    if (!parsed.intervention) {
        followUpQuestions.push('What intervention was used?');
    }

    return { message, buttons, followUpQuestions };
}
