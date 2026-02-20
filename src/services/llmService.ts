// Session assistant client with GPT-5 backend + offline fallback.
const SESSION_ASSISTANT_ENDPOINT = '/api/llm/session-assistant';
const REMOTE_LLM_TIMEOUT_MS = 4200;
const REMOTE_LLM_BACKOFF_MS = 2 * 60 * 1000;
let remoteLlmDisabledUntilMs = 0;

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

interface ParseTaskRequest {
    task: 'parse';
    message: string;
}

interface ParseTaskResponse {
    parsed: unknown;
}

interface NoteTaskRequest {
    task: 'note';
    clientName: string;
    behaviors: { type: string; count?: number; duration?: number; antecedent?: string; function?: string; intervention?: string }[];
    skillTrials: { skill: string; target: string; response: string }[];
    reinforcements: string[];
}

interface NoteTaskResponse {
    note: string;
}

export interface SessionChatContext {
    clientName?: string;
    behaviorCount?: number;
    skillTrialCount?: number;
    noteDraft?: string;
}

interface ChatTaskRequest {
    task: 'chat';
    message: string;
    context?: SessionChatContext;
}

interface ChatTaskResponse {
    reply: string;
}

const shouldUseRemoteLlm = (): boolean => {
    if (import.meta.env.MODE === 'test') {
        return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return false;
    }
    const configuredFlag = String(import.meta.env.VITE_ENABLE_REMOTE_LLM ?? '').trim().toLowerCase();
    const explicitlyDisabled = configuredFlag === 'false' || configuredFlag === '0';
    return !explicitlyDisabled && Date.now() >= remoteLlmDisabledUntilMs;
};

const setRemoteLlmBackoff = (): void => {
    remoteLlmDisabledUntilMs = Date.now() + REMOTE_LLM_BACKOFF_MS;
};

const readErrorDetails = async (response: Response): Promise<string> => {
    try {
        const body = await response.text();
        return body || response.statusText || `status ${response.status}`;
    } catch {
        return response.statusText || `status ${response.status}`;
    }
};

const requestSessionAssistant = async <TResponse>(payload: ParseTaskRequest | NoteTaskRequest | ChatTaskRequest): Promise<TResponse> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REMOTE_LLM_TIMEOUT_MS);

    try {
        const response = await fetch(SESSION_ASSISTANT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            if (response.status === 429 || response.status === 503 || response.status >= 500) {
                setRemoteLlmBackoff();
            }
            throw new Error(await readErrorDetails(response));
        }

        return await response.json() as TResponse;
    } finally {
        window.clearTimeout(timeoutId);
    }
};

const toNonEmptyString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const toOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
};

const normalizeFunctionGuess = (value: unknown): ParsedInput['functionGuess'] => {
    if (value === 'escape' || value === 'tangible' || value === 'attention' || value === 'automatic') {
        return value;
    }
    return undefined;
};

const sanitizeParsedInput = (candidate: unknown): ParsedInput => {
    const parsed = (candidate || {}) as Record<string, unknown>;

    const behaviorsRaw = Array.isArray(parsed.behaviors) ? parsed.behaviors : [];
    const behaviors: ParsedInput['behaviors'] = [];
    behaviorsRaw.forEach((item) => {
        const behavior = item as Record<string, unknown>;
        const type = toNonEmptyString(behavior.type);
        if (!type) return;
        const count = toOptionalNumber(behavior.count);
        const duration = toOptionalNumber(behavior.duration);
        behaviors.push({
            type,
            ...(count !== undefined ? { count } : {}),
            ...(duration !== undefined ? { duration } : {}),
        });
    });

    const skillTrialsRaw = Array.isArray(parsed.skillTrials) ? parsed.skillTrials : [];
    const skillTrials: NonNullable<ParsedInput['skillTrials']> = [];
    skillTrialsRaw.forEach((item) => {
        const trial = item as Record<string, unknown>;
        const skill = toNonEmptyString(trial.skill);
        const target = toNonEmptyString(trial.target);
        if (!skill || !target) return;
        const promptLevel = toNonEmptyString(trial.promptLevel);
        const response = toNonEmptyString(trial.response);
        skillTrials.push({
            skill,
            target,
            ...(promptLevel ? { promptLevel } : {}),
            ...(response ? { response } : {}),
        });
    });

    const reinforcementRaw = parsed.reinforcement as Record<string, unknown> | undefined;
    const reinforcementType = toNonEmptyString(reinforcementRaw?.type);
    const reinforcementDelivered = typeof reinforcementRaw?.delivered === 'boolean'
        ? reinforcementRaw.delivered
        : undefined;
    const reinforcementDetails = toNonEmptyString(reinforcementRaw?.details);
    const reinforcement = reinforcementType && reinforcementDelivered !== undefined
        ? {
            type: reinforcementType,
            delivered: reinforcementDelivered,
            details: reinforcementDetails,
        }
        : undefined;

    return {
        behaviors,
        antecedent: toNonEmptyString(parsed.antecedent),
        functionGuess: normalizeFunctionGuess(parsed.functionGuess),
        intervention: toNonEmptyString(parsed.intervention),
        skillTrials,
        reinforcement,
        incident: typeof parsed.incident === 'boolean' ? parsed.incident : undefined,
        note: typeof parsed.note === 'boolean' ? parsed.note : undefined,
        needsClarification: typeof parsed.needsClarification === 'boolean' ? parsed.needsClarification : false,
        clarificationQuestion: toNonEmptyString(parsed.clarificationQuestion),
        narrativeFragment: toNonEmptyString(parsed.narrativeFragment) || '',
    };
};

/**
 * Parses raw user input into structured ABA data using an LLM.
 * Falls back to regex-based mock parsing if no API token is configured.
 * 
 * @param userMessage - The raw text input from the user (e.g., "Client hit peer 3 times").
 * @returns Structured data matching ParsedInput interface.
 */
export async function parseUserInput(userMessage: string): Promise<ParsedInput> {
    if (!shouldUseRemoteLlm()) return mockParseInput(userMessage);

    try {
        const response = await requestSessionAssistant<ParseTaskResponse>({
            task: 'parse',
            message: userMessage,
        });
        return sanitizeParsedInput(response.parsed);
    } catch (error) {
        setRemoteLlmBackoff();
        console.error('Error calling session assistant parse:', error);
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
    if (!shouldUseRemoteLlm()) return mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);

    try {
        const response = await requestSessionAssistant<NoteTaskResponse>({
            task: 'note',
            clientName,
            behaviors,
            skillTrials,
            reinforcements
        });
        const note = toNonEmptyString(response.note);
        return note || mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
    } catch (error) {
        setRemoteLlmBackoff();
        console.error('Error generating note with session assistant:', error);
        return mockGenerateNote(behaviors, skillTrials, clientName, reinforcements);
    }
}

export async function generateSessionChatReply(message: string, context?: SessionChatContext): Promise<string> {
    if (!shouldUseRemoteLlm()) return mockSessionChatReply(message, context);

    try {
        const response = await requestSessionAssistant<ChatTaskResponse>({
            task: 'chat',
            message,
            context,
        });
        const reply = toNonEmptyString(response.reply);
        return reply || mockSessionChatReply(message, context);
    } catch (error) {
        setRemoteLlmBackoff();
        console.error('Error generating session chat reply:', error);
        return mockSessionChatReply(message, context);
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

function mockSessionChatReply(message: string, context?: SessionChatContext): string {
    const trimmed = message.trim();
    if (!trimmed) {
        return 'Share a brief session question and I can help with a concise ABA-aligned response.';
    }

    const behaviorCount = context?.behaviorCount ?? 0;
    const skillTrialCount = context?.skillTrialCount ?? 0;
    const clientLabel = context?.clientName ? ` for ${context.clientName}` : '';

    return (
        `I can help${clientLabel}. Currently logged: ${behaviorCount} behavior events and ${skillTrialCount} skill trials. ` +
        'If you want this entered as structured data, include behavior type, count or duration, and antecedent in one sentence.'
    );
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
