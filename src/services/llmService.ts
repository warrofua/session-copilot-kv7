// LLM Service using GitHub Models API (OpenAI-compatible)
// Uses GPT-4o-mini for free tier access

const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';
const MODEL_NAME = 'gpt-4o-mini';

// Get token from environment or localStorage for demo
function getApiToken(): string {
    // In production, this would come from secure backend
    // For demo, we use localStorage or env variable
    return ''; // Force offline demo mode
    // return localStorage.getItem('github_token') || import.meta.env.VITE_GITHUB_TOKEN || '';
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
        details?: string;
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
7. SKILL TRIALS: If the user mentions a skill trial, even implicitly (e.g. "DTT", "matching", "naming", "tried tying shoes", "practiced counting"), extract:
   - Skill name
   - Target (e.g. "blue", "apple", or implied target)
   - Response (correct/incorrect/prompted)

Common ABA abbreviations:
- SIB = Self-Injurious Behavior
- FCR = Functional Communication Response
- DTT = Discrete Trial Training
- NET = Natural Environment Teaching

Always respond in valid JSON format matching the ParsedInput interface.`;

/**
 * Parses raw user input into structured ABA data using an LLM.
 * Falls back to regex-based mock parsing if no API token is configured.
 * 
 * @param userMessage - The raw text input from the user (e.g., "Client hit peer 3 times").
 * @returns Structured data matching ParsedInput interface.
 */
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

/**
 * Generates a professional clinical session note draft based on collected data.
 * 
 * @param behaviors - Array of logged behaviors.
 * @param skillTrials - Array of skill trials conducted.
 * @param clientName - Name of the learner.
 * @param reinforcements - List of reinforcements delivered.
 * @returns A string containing the drafted narrative note.
 */
export async function generateNoteDraft(
    behaviors: { type: string; count?: number; duration?: number; antecedent?: string; function?: string; intervention?: string }[],
    skillTrials: { skill: string; target: string; response: string }[],
    clientName: string,
    reinforcements: string[] = []
): Promise<string> {
    const token = getApiToken();

    if (!token) {
        return mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
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
                        content: `Write a brief session note for ${clientName}:\n\nBehaviors: ${JSON.stringify(behaviors)}\n\nSkill Trials: ${JSON.stringify(skillTrials)}\n\nReinforcement: ${JSON.stringify(reinforcements)}`
                    }
                ],
                temperature: 0.5,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            return mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
    } catch (error) {
        console.error('Error generating note:', error);
        return mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
    }
}

// Mock functions for demo mode (no API key)
function mockParseInput(input: string): ParsedInput {
    const lowerInput = input.toLowerCase();
    const behaviors: ParsedInput['behaviors'] = [];
    const skillTrials: ParsedInput['skillTrials'] = [];
    let reinforcement: ParsedInput['reinforcement'] | undefined;

    const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const includesKeyword = (source: string, keyword: string): boolean => {
        const normalized = keyword.toLowerCase().trim();
        if (!normalized) return false;

        // Match whole words for single-token keywords to avoid false positives like "mand" in "demand".
        if (!normalized.includes(' ')) {
            return new RegExp(`\\b${escapeRegex(normalized)}\\b`).test(source);
        }

        // For simple phrases, tolerate flexible whitespace while keeping word boundaries.
        const phrase = escapeRegex(normalized).replace(/\\s+/g, '\\\\s+');
        return new RegExp(`\\b${phrase}\\b`).test(source);
    };

    const isLikelySkillPhrase = (phrase: string): boolean => {
        const normalized = phrase.toLowerCase().replace(/^to\s+/, '').trim();
        if (!normalized) return false;

        const disallowedPatterns = [
            /\bavoid\b/,
            /\bescape\b/,
            /\brefus(?:al|ed)?\b/,
            /\bnon[-\s]?compliance\b/,
            /\btantrum\b/,
            /\baggression\b/,
            /\bscream(?:ed|ing)?\b/,
            /\bcry(?:ing|ied)?\b/,
            /\bhit(?:ting)?\b/,
            /\bkick(?:ing)?\b/,
            /\bbite(?:d|ing)?\b/,
            /\bscratch(?:ed|ing)?\b/,
            /\belop(?:ement|ed|ing)?\b/,
            /\bsib\b/,
            /\bstim(?:ming)?\b/,
        ];
        if (disallowedPatterns.some((pattern) => pattern.test(normalized))) {
            return false;
        }

        const fillerWords = new Set(['the', 'a', 'an', 'and', 'with', 'on', 'for', 'of']);
        const tokens = normalized
            .split(/\s+/)
            .filter(Boolean)
            .filter((token) => !fillerWords.has(token));

        if (tokens.length === 0) return false;
        if (tokens.length === 1 && ['task', 'work', 'instruction', 'behavior', 'compliance'].includes(tokens[0])) {
            return false;
        }

        return true;
    };

    // --- Behavior Detection ---
    const behaviorPatterns = [
        { type: 'elopement', keywords: ['elopement', 'ran away', 'bolted', 'left room'] },
        { type: 'tantrum', keywords: ['tantrum', 'scream', 'cry', 'flop', 'drop to floor'] },
        { type: 'aggression', keywords: ['aggression', 'hit', 'kick', 'bite', 'scratch', 'pinch'] },
        { type: 'SIB', keywords: ['sib', 'self-injur', 'head bang', 'bit hand', 'bit self'] },
        { type: 'property_destruction', keywords: ['property destruction', 'threw', 'broke', 'ripped'] },
        { type: 'refusal', keywords: ['refusal', 'non-compliance', 'non compliance', 'refused', 'would not', 'did not comply', 'declined'] },
        { type: 'stereotypy', keywords: ['stereotypy', 'stimming', 'hand flap', 'rocking'] }
    ];

    behaviorPatterns.forEach(pattern => {
        if (pattern.keywords.some(k => lowerInput.includes(k))) {
            // Duration Check
            let duration = 0;
            const secMatch = input.match(/(\d+)\s*(sec|s\b|second)/i);
            const minMatch = input.match(/(\d+)\s*(min|m\b|minute)/i);
            if (secMatch) duration += parseInt(secMatch[1]);
            if (minMatch) duration += parseInt(minMatch[1]) * 60;

            // Count Check
            const countMatch = input.match(/(\d+|once|twice|two|three|four|five)\s*times?/i);
            const count = countMatch ? parseCount(countMatch[1]) : 1;

            behaviors.push({
                type: pattern.type,
                count: duration > 0 ? undefined : count,
                duration: duration > 0 ? duration : undefined
            });
        }
    });

    // --- Skill Trial Detection ---
    // Add "tried", "practiced", "worked on" to keywords
    const skillKeywords = ['trial', 'tr', 'skill', 'dtt', 'matching', 'imitation', 'labeling', 'label', 'mand', 'tact', 'tried', 'practiced', 'worked on'];
    const shorthandMatch = input.match(/\btr\b(?=\s+[a-z0-9])/i);
    const labelAliasMatch = /\blabel(?:ed|ing|s)?\b/i.test(input);
    const hasSkillKeyword = skillKeywords.some((k) => includesKeyword(lowerInput, k)) || !!shorthandMatch || labelAliasMatch;

    if (hasSkillKeyword) {
        let skill = 'Unknown Skill';
        let target = 'Current Target'; // Default to generic
        let response = 'Incorrect'; // Default to incorrect (conservative)
        let promptLevel: string | undefined;
        let shouldCreateSkillTrial = true;

        // 1. Extract Skill Name
        // First try to find a known keyword that isn't generic.
        const specificSkill = skillKeywords.find((k) =>
            includesKeyword(lowerInput, k) && !['trial', 'tr', 'skill', 'tried', 'practiced', 'worked on'].includes(k)
        );
        const matchedSpecificSkill = specificSkill || (labelAliasMatch ? 'label' : undefined) || (shorthandMatch ? 'tr' : undefined);
        const canonicalizeSkill = (skillName: string): string => {
            if (skillName === 'trial' || skillName === 'tr') return 'Generic Trial';
            if (skillName === 'label') return 'Labeling';
            return skillName.charAt(0).toUpperCase() + skillName.slice(1);
        };
        const genericSkillMatch = input.match(/\b(?:skill|trial|tr)\s*[-:]\s*([^,]+)/i);

        if (matchedSpecificSkill) {
            skill = canonicalizeSkill(matchedSpecificSkill);
        } else if (includesKeyword(lowerInput, 'trial') && !includesKeyword(lowerInput, 'tried')) {
            skill = 'Generic Trial';
        } else {
            if (genericSkillMatch) {
                const extractedSkill = genericSkillMatch[1]?.trim();
                if (extractedSkill && isLikelySkillPhrase(extractedSkill)) {
                    skill = 'Generic Trial';
                }
            } else {
                // Heuristic for "tried X" or "practiced X"
                // Capture everything until a comma, stop word, or end of string
                const actionMatch = input.match(/\b(tried|practiced|worked on)\s+([^,]+)/i);
                if (actionMatch) {
                    let extracted = actionMatch[2].trim();
                    // Clean up trailing words if they made it in
                    const stopWords = [' with', ' using', ' but', ' and', ' they', ' he', ' she', ' which', ' needed'];
                    for (const word of stopWords) {
                        const idx = extracted.toLowerCase().indexOf(word);
                        if (idx !== -1) extracted = extracted.substring(0, idx);
                    }

                    if (extracted.length > 0 && isLikelySkillPhrase(extracted)) {
                        skill = extracted.trim();
                        skill = skill.charAt(0).toUpperCase() + skill.slice(1);
                    } else {
                        shouldCreateSkillTrial = false;
                    }
                } else {
                    shouldCreateSkillTrial = false;
                }
            }

            if (genericSkillMatch && genericSkillMatch[1] && !isLikelySkillPhrase(genericSkillMatch[1].trim())) {
                shouldCreateSkillTrial = false;
            }
        }

            if (!shouldCreateSkillTrial) {
                // If we cannot confidently derive a skill target, skip logging.
                shouldCreateSkillTrial = false;
            }
        skill = skill.charAt(0).toUpperCase() + skill.slice(1);

        // 2. Extract Response
        // Priority: Incorrect/Error -> Prompted (treated as Incorrect) -> Correct
        if (
            /\b(incorrect|wrong|error|inc|not\s+ind|not\s+independent|prompted|assisted|helped|physical)\b/i.test(
                lowerInput
            )
        ) {
            response = 'Incorrect';
        } else if (
            lowerInput.includes('prompt') || lowerInput.includes('help') || lowerInput.includes('assisted') || lowerInput.includes('physical') || lowerInput.includes('gestural') || lowerInput.includes('model') || lowerInput.includes('verbal')
        ) {
            // Domain rule: Any urged/prompted trial is technically an incorrect independent response
            response = 'Incorrect';
        } else if (
            /\b(correct|right|c\b|accurate|\+|independent|\bind\b|\bindep\w*\b)\b/i.test(
                lowerInput
            )
        ) {
            response = 'Correct';
        }

        if (/\bfull\s*-?\s*(?:physical|phys)\b/.test(lowerInput) || /\bfull\s*p\b/.test(lowerInput)) {
            promptLevel = 'full-physical';
        } else if (/\bpartial\s*-?\s*(?:physical|phys)\b/.test(lowerInput) || /\bpart\s*p\b/.test(lowerInput)) {
            promptLevel = 'partial-physical';
        } else if (/\bgest\b|\bgestural\b/.test(lowerInput)) {
            promptLevel = 'gestural';
        } else if (/\bmodel\b/.test(lowerInput)) {
            promptLevel = 'model';
        } else if (/\bverbal\b|\bv\b(?!\w)/.test(lowerInput)) {
            promptLevel = 'verbal';
        } else if (lowerInput.includes('prompt')) {
            promptLevel = 'verbal';
        } else if (lowerInput.includes('independent') || /\bind\b/.test(lowerInput)) {
            promptLevel = 'independent';
        }

        const targetDelimiters =
            'correct|right|accurate|inc|incorrect|c\\b|wrong|error|prompted?|help(ed)?|assisted|full\\s*-?\\s*(?:phys|physical)|full\\s*p|partial\\s*-?\\s*(?:phys|physical)|part\\s*(?:p|phys)|gestural|model|verbal|\\bind\\b|\\bindep\\w*\\b|[.,;!?]|$';

        // 3. Extract Target
        const quoteMatch = input.match(/"([^"]+)"/);
        const targetMatch = input.match(
            new RegExp(`target\\s+(?:was\\s+)?([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`, 'i')
        );
        const withTargetMatch = input.match(
            new RegExp(`\\b(?:with|for)\\s+([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`, 'i')
        );
        const trialTargetMatch = input.match(
            new RegExp(`\\b(?:trial|tr)\\s+(?:on\\s+)?([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`, 'i')
        );
        const skillSeparatorMatch = input.match(
            new RegExp(
                `\\b(?:skill|dtt|matching|imitation|labeling|mand|tact)\\b\\s*[-:]\\s*([^,.;!?]+?)(?=\\s+(?:${targetDelimiters}))`,
                'i'
            )
        );
        const shorthandTrialTargetMatch = input.match(
            new RegExp(`\\b(?:${['matching', 'imitation', 'labeling', 'label', 'mand', 'tact', 'dtt'].join('|')})\\s+target\\s+([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`, 'i')
        );
        const labelOnlyMatch = input.match(
            new RegExp(`\\blabel(?:ed|ing)?\\s+([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`, 'i')
        );
        const onTargetMatch = input.match(
            new RegExp(
                `\\b(?:imitation|matching|labeling|label|mand|tact|dtt)\\b(?:\\s+\\w+){0,2}\\s+on\\s+([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`,
                'i'
            )
        );
        const bareSkillTargetMatch = input.match(
            new RegExp(
                `\\b(?:matching|imitation|labeling|label|mand|tact|dtt|generic trial|skill)\\b\\s+([a-z0-9][a-z0-9\\s'-]*?)(?=\\s+(?:${targetDelimiters}))`,
                'i'
            )
        );

        const nonTargetTokens = new Set(['correct', 'incorrect', 'prompted', 'independent', 'error', 'wrong']);
        const pickTarget = (candidate?: string): string | null => {
            if (!candidate) return null;
            const normalized = candidate.trim().replace(/\s*[-:]\s*$/, '').toLowerCase();
            if (normalized.length === 0) return null;
            if (nonTargetTokens.has(normalized)) return null;
            return candidate.trim();
        };

        const extractedTarget =
            pickTarget(quoteMatch?.[1]) ??
            pickTarget(targetMatch?.[1]) ??
            pickTarget(withTargetMatch?.[1]) ??
            pickTarget(trialTargetMatch?.[1]) ??
            pickTarget(shorthandTrialTargetMatch?.[1]) ??
            pickTarget(labelOnlyMatch?.[1]) ??
            pickTarget(onTargetMatch?.[1]) ??
            pickTarget(bareSkillTargetMatch?.[1]) ??
            pickTarget(skillSeparatorMatch?.[1]);

        if (extractedTarget) {
            target = extractedTarget;
        }

        if (shouldCreateSkillTrial) {
            skillTrials.push({ skill, target, response, promptLevel });
        }
    }

    // --- Reinforcement Detection ---
    const reinforcementVerbPattern = /\b(gave|give|delivered|deliver|provided|provide|earned|reinforced|rewarded)\b/i;
    const reinforcementItemPattern = /\b(token|praise|sticker|candy|reward|reinforcement|preferred item|ipad|break)\b/i;
    if (reinforcementVerbPattern.test(input) && reinforcementItemPattern.test(input)) {
        const reinforcementTypes: string[] = [];
        if (/\btoken\b/i.test(input)) reinforcementTypes.push('Token');
        if (/\bpraise\b/i.test(input)) reinforcementTypes.push('Praise');
        if (/\bsticker\b/i.test(input)) reinforcementTypes.push('Sticker');
        if (/\bcandy\b/i.test(input)) reinforcementTypes.push('Candy');
        if (/\bipad\b/i.test(input)) reinforcementTypes.push('iPad');
        if (/\bbreak\b/i.test(input)) reinforcementTypes.push('Break');
        reinforcement = {
            type: reinforcementTypes.length > 0 ? reinforcementTypes.join(' + ') : 'Reinforcement',
            delivered: true,
            details: input.trim()
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

    const result = {
        behaviors,
        skillTrials,
        reinforcement,
        antecedent,
        functionGuess,
        intervention: undefined,
        needsClarification: behaviors.length === 0 && skillTrials.length === 0 && !reinforcement,
        clarificationQuestion: (behaviors.length === 0 && skillTrials.length === 0 && !reinforcement) ? 'I detected an event but wasn\'t sure how to categorize it. Can you specify the behavior?' : undefined,
        narrativeFragment
    };
    console.log('[UNIQUE_ID_999] Final Result:', JSON.stringify(result, null, 2));
    return result;
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
    clientName: string,
    reinforcements: string[] = []
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

    if (reinforcements.length > 0) {
        parts.push(`Reinforcement delivered: ${reinforcements.join('; ')}.`);
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
