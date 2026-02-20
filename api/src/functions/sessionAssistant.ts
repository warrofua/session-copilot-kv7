import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

type SessionAssistantTask = 'parse' | 'note' | 'chat';

type ParseTaskRequest = {
    task: 'parse';
    message: string;
};

type NoteBehavior = {
    type: string;
    count?: number;
    duration?: number;
    antecedent?: string;
    function?: string;
    intervention?: string;
};

type NoteSkillTrial = {
    skill: string;
    target: string;
    response: string;
};

type NoteTaskRequest = {
    task: 'note';
    clientName: string;
    behaviors: NoteBehavior[];
    skillTrials: NoteSkillTrial[];
    reinforcements?: string[];
};

type ChatTaskRequest = {
    task: 'chat';
    message: string;
    context?: {
        clientName?: string;
        behaviorCount?: number;
        skillTrialCount?: number;
        noteDraft?: string;
    };
};

type SessionAssistantRequest = ParseTaskRequest | NoteTaskRequest | ChatTaskRequest;

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
};

type AzureChatParams = {
    deployment: string;
    apiVersion: string;
    endpoint: string;
    apiKey: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxCompletionTokens: number;
    responseFormat?: { type: 'json_object' };
};

const readEnv = (name: string): string =>
    (process.env[name] || '').trim();

const toAzureUrl = (endpoint: string, deployment: string, apiVersion: string): string => {
    const normalizedEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    return `${normalizedEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
};

const stripCodeFence = (content: string): string => {
    const trimmed = content.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }

    const withoutFirstFence = trimmed.replace(/^```(?:json)?\s*/i, '');
    return withoutFirstFence.replace(/\s*```$/, '').trim();
};

const requestAzureChatCompletion = async (params: AzureChatParams): Promise<string> => {
    const upstream = await fetch(toAzureUrl(params.endpoint, params.deployment, params.apiVersion), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': params.apiKey,
        },
        body: JSON.stringify({
            temperature: params.temperature,
            max_completion_tokens: params.maxCompletionTokens,
            messages: [
                { role: 'system', content: params.systemPrompt },
                { role: 'user', content: params.userPrompt }
            ],
            ...(params.responseFormat ? { response_format: params.responseFormat } : {})
        })
    });

    if (!upstream.ok) {
        const reason = await upstream.text();
        throw new Error(reason || `Azure OpenAI request failed with status ${upstream.status}`);
    }

    const data = await upstream.json() as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
        throw new Error('Azure OpenAI returned empty content');
    }

    return content.trim();
};

const isTask = (value: unknown): value is SessionAssistantTask =>
    value === 'parse' || value === 'note' || value === 'chat';

async function sessionAssistantHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Session assistant request');

    const endpoint = readEnv('AZURE_OPENAI_ENDPOINT');
    const apiKey = readEnv('AZURE_OPENAI_API_KEY');
    const deployment = readEnv('AZURE_OPENAI_DEPLOYMENT') || 'gpt-5-chat';
    const apiVersion = readEnv('AZURE_OPENAI_API_VERSION') || '2025-01-01-preview';

    if (!endpoint || !apiKey) {
        return {
            status: 503,
            jsonBody: {
                error: 'Azure OpenAI is not configured',
                details: 'Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in Static Web App app settings.'
            }
        };
    }

    let payload: SessionAssistantRequest;
    try {
        payload = await request.json() as SessionAssistantRequest;
    } catch {
        return {
            status: 400,
            jsonBody: { error: 'Invalid JSON body' }
        };
    }

    if (!isTask((payload as { task?: unknown })?.task)) {
        return {
            status: 400,
            jsonBody: { error: 'task must be one of: parse, note, chat' }
        };
    }

    try {
        if (payload.task === 'parse') {
            const message = payload.message?.trim();
            if (!message) {
                return {
                    status: 400,
                    jsonBody: { error: 'message is required for parse task' }
                };
            }

            const parsePrompt = [
                'Parse this ABA session input into JSON.',
                'Return only a JSON object with this exact schema:',
                '{',
                '  "behaviors": [{ "type": string, "count"?: number, "duration"?: number }],',
                '  "antecedent"?: string,',
                '  "functionGuess"?: "escape" | "tangible" | "attention" | "automatic",',
                '  "intervention"?: string,',
                '  "skillTrials"?: [{ "skill": string, "target": string, "promptLevel"?: string, "response"?: string }],',
                '  "reinforcement"?: { "type": string, "delivered": boolean, "details"?: string },',
                '  "incident"?: boolean,',
                '  "note"?: boolean,',
                '  "needsClarification": boolean,',
                '  "clarificationQuestion"?: string,',
                '  "narrativeFragment": string',
                '}',
                `Input: ${message}`,
            ].join('\n');

            const content = await requestAzureChatCompletion({
                endpoint,
                apiKey,
                deployment,
                apiVersion,
                systemPrompt:
                    'You are an ABA session parser. Extract structured data only from the user input. Return strict JSON only.',
                userPrompt: parsePrompt,
                temperature: 0.2,
                maxCompletionTokens: 650,
                responseFormat: { type: 'json_object' }
            });

            let parsed: unknown;
            try {
                parsed = JSON.parse(stripCodeFence(content));
            } catch {
                return {
                    status: 502,
                    jsonBody: { error: 'Model returned malformed JSON' }
                };
            }

            return {
                status: 200,
                jsonBody: { parsed }
            };
        }

        if (payload.task === 'note') {
            if (!payload.clientName?.trim()) {
                return {
                    status: 400,
                    jsonBody: { error: 'clientName is required for note task' }
                };
            }

            const content = await requestAzureChatCompletion({
                endpoint,
                apiKey,
                deployment,
                apiVersion,
                systemPrompt:
                    'You are an ABA session note writer. Write concise, professional clinical notes in third person and past tense.',
                userPrompt: [
                    `Client: ${payload.clientName.trim()}`,
                    `Behaviors: ${JSON.stringify(payload.behaviors || [])}`,
                    `SkillTrials: ${JSON.stringify(payload.skillTrials || [])}`,
                    `Reinforcements: ${JSON.stringify(payload.reinforcements || [])}`,
                    'Write one concise paragraph with objective language and no invented details.'
                ].join('\n'),
                temperature: 0.35,
                maxCompletionTokens: 320,
            });

            return {
                status: 200,
                jsonBody: { note: content }
            };
        }

        const chatMessage = payload.message?.trim();
        if (!chatMessage) {
            return {
                status: 400,
                jsonBody: { error: 'message is required for chat task' }
            };
        }

        const contextSummary = payload.context
            ? [
                `Client: ${payload.context.clientName || 'unknown'}`,
                `Behavior events logged: ${payload.context.behaviorCount ?? 0}`,
                `Skill trials logged: ${payload.context.skillTrialCount ?? 0}`,
                `Current note draft: ${payload.context.noteDraft || 'none'}`
            ].join('\n')
            : 'No active session context provided.';

        const chatReply = await requestAzureChatCompletion({
            endpoint,
            apiKey,
            deployment,
            apiVersion,
            systemPrompt:
                'You are an ABA session co-pilot assistant. Keep replies clinically grounded and concise. ' +
                'When appropriate, suggest one concrete data-logging phrasing the therapist can use next.',
            userPrompt: [
                'Session context:',
                contextSummary,
                `Therapist message: ${chatMessage}`
            ].join('\n'),
            temperature: 0.4,
            maxCompletionTokens: 260,
        });

        return {
            status: 200,
            jsonBody: { reply: chatReply }
        };
    } catch (error) {
        context.error('Session assistant error:', error);
        return {
            status: 502,
            jsonBody: {
                error: 'Azure OpenAI request failed',
                details: error instanceof Error ? error.message : 'Unknown upstream error'
            }
        };
    }
}

app.http('sessionAssistant', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'llm/session-assistant',
    handler: sessionAssistantHandler,
});
