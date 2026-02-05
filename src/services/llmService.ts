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
            return JSON.parse(content) as ParsedInput;
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

    // Simple pattern matching for demo
    if (lowerInput.includes('elopement') || lowerInput.includes('ran') || lowerInput.includes('ran away')) {
        const durationMatch = input.match(/(\d+)\s*seconds?/gi);
        if (durationMatch) {
            durationMatch.forEach(match => {
                const seconds = parseInt(match);
                if (!isNaN(seconds)) {
                    behaviors.push({ type: 'elopement', duration: seconds });
                }
            });
        }
        if (behaviors.length === 0) {
            const countMatch = input.match(/(\d+|two|three|four|five)/i);
            const count = countMatch ? parseCount(countMatch[0]) : 1;
            behaviors.push({ type: 'elopement', count });
        }
    }

    if (lowerInput.includes('tantrum')) {
        behaviors.push({ type: 'tantrum', count: 1 });
    }

    if (lowerInput.includes('aggression') || lowerInput.includes('hit') || lowerInput.includes('kick')) {
        behaviors.push({ type: 'aggression', count: 1 });
    }

    if (lowerInput.includes('sib') || lowerInput.includes('self-injur') || lowerInput.includes('bit his hand')) {
        const countMatch = input.match(/(\d+|twice|two|three)/i);
        behaviors.push({ type: 'SIB', count: parseCount(countMatch?.[0] || '1') });
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

    return {
        behaviors,
        antecedent,
        functionGuess,
        needsClarification: behaviors.length === 0,
        clarificationQuestion: behaviors.length === 0 ? 'I couldn\'t identify a specific behavior. What type of behavior occurred?' : undefined,
        narrativeFragment: generateNarrativeFragment(behaviors, antecedent)
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

    const message = parsed.antecedent
        ? `Logging: ${behaviorSummary} after ${parsed.antecedent}. Is this correct?`
        : `Logging: ${behaviorSummary}. Is this correct?`;

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
