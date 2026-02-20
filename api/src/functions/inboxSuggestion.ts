import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

type AlertSignalSnapshot = {
    label: string;
    currentValue: number;
    delta: number;
    measureLabel: string;
};

type InboxSuggestionRequest = {
    moniker: string;
    level: 'stable' | 'watch' | 'critical';
    attentionLabel: string;
    riskScore: number;
    behaviorRatePerHour: number;
    skillAccuracyPct: number;
    promptDependencePct: number;
    celerationValue: number;
    celerationDeltaPct: number;
    behaviors: AlertSignalSnapshot[];
    skills: AlertSignalSnapshot[];
};

const readEnv = (name: string): string =>
    (process.env[name] || '').trim();

const toDeltaText = (delta: number): string => {
    if (Math.abs(delta) < 0.01) {
        return 'flat';
    }
    return delta > 0 ? `up ${delta.toFixed(2)}` : `down ${Math.abs(delta).toFixed(2)}`;
};

const buildClinicalPrompt = (payload: InboxSuggestionRequest): string => {
    const behaviorLine = payload.behaviors
        .slice(0, 3)
        .map((signal) => `${signal.label} ${signal.currentValue.toFixed(2)} (${signal.measureLabel}, ${toDeltaText(signal.delta)})`)
        .join('; ');
    const skillLine = payload.skills
        .slice(0, 3)
        .map((signal) => `${signal.label} ${signal.currentValue.toFixed(2)} (${signal.measureLabel}, ${toDeltaText(signal.delta)})`)
        .join('; ');

    return [
        `Client moniker: ${payload.moniker}`,
        `Alert level: ${payload.level}`,
        `Attention label: ${payload.attentionLabel}`,
        `Risk score: ${payload.riskScore.toFixed(1)}`,
        `Behavior aggregate: ${payload.behaviorRatePerHour.toFixed(2)} per hour`,
        `Skill aggregate: ${payload.skillAccuracyPct.toFixed(1)}%`,
        `Prompt dependence: ${payload.promptDependencePct.toFixed(1)}%`,
        `Celeration: x${payload.celerationValue.toFixed(2)} (${payload.celerationDeltaPct.toFixed(1)}%)`,
        `Behavior measures: ${behaviorLine || 'none'}`,
        `Skill measures: ${skillLine || 'none'}`,
    ].join('\n');
};

async function inboxSuggestionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Dashboard inbox suggestion stream requested');

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

    let payload: InboxSuggestionRequest;
    try {
        payload = await request.json() as InboxSuggestionRequest;
    } catch {
        return {
            status: 400,
            jsonBody: { error: 'Invalid JSON body' }
        };
    }

    if (!payload?.moniker || !payload.level) {
        return {
            status: 400,
            jsonBody: { error: 'Missing required fields' }
        };
    }

    const systemPrompt =
        'You are a BCBA assistant. Generate a concise, calm, clinically useful suggestion for an ABA dashboard inbox. ' +
        'Use ABA terms (e.g., antecedent strategy, reinforcement schedule, prompt fading, procedural fidelity). ' +
        'Reference the provided measures directly and avoid diagnosis language. ' +
        'Return plain text, 2 short sentences, max 70 words.';

    const userPrompt = buildClinicalPrompt(payload);

    const normalizedEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    const upstreamUrl =
        `${normalizedEndpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
        `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify({
            stream: true,
            temperature: 0.35,
            max_completion_tokens: 220,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const reason = await upstream.text();
        return {
            status: upstream.status >= 400 ? upstream.status : 502,
            jsonBody: {
                error: 'Azure OpenAI request failed',
                details: reason || `status ${upstream.status}`
            }
        };
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = upstream.body!.getReader();
            let buffer = '';

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (!line.startsWith('data:')) {
                            continue;
                        }

                        const data = line.slice(5).trim();
                        if (!data || data === '[DONE]') {
                            continue;
                        }

                        try {
                            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
                            const token = parsed.choices?.[0]?.delta?.content;
                            if (token) {
                                controller.enqueue(encoder.encode(token));
                            }
                        } catch {
                            // Skip malformed chunks and continue streaming.
                        }
                    }
                }
                controller.close();
            } catch (error) {
                controller.error(error);
            } finally {
                reader.releaseLock();
            }
        }
    });

    return {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
        body: stream as unknown as HttpResponseInit['body']
    };
}

app.http('dashboardInboxSuggestionStream', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'dashboard/inbox-suggestion/stream',
    handler: inboxSuggestionHandler
});
