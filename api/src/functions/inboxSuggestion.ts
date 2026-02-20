import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

type AlertSignalSnapshot = {
    moniker: string;
    level: 'stable' | 'watch' | 'critical';
    attentionLabel: string;
    riskScore: number;
    behaviorRatePerHour: number;
    skillAccuracyPct: number;
    promptDependencePct: number;
    celerationValue: number;
    celerationDeltaPct: number;
    celerationPeriod: 'per_week';
    celerationInterpretation: 'worsening' | 'improving' | 'flat';
};

type InboxContext = {
    generatedAtMs: number;
    totalClients: number;
    watchCount: number;
    criticalCount: number;
    averageBehaviorRate: number;
    averageSkillAccuracy: number;
    alerts: AlertSignalSnapshot[];
    clients: AlertSignalSnapshot[];
};

type InboxSummaryRequest = InboxContext & {
    summaryScope: 'caseload';
};

type InboxChatRequest = InboxContext & {
    summaryScope: 'chat';
    message: string;
    currentSummary?: string;
    recentMessages?: Array<{ role: 'user' | 'assistant'; text: string }>;
};

type InboxSuggestionRequest = InboxSummaryRequest | InboxChatRequest;

const readEnv = (name: string): string =>
    (process.env[name] || '').trim();

const formatCeleration = (celerationValue: number): string =>
    celerationValue >= 1
        ? `x${celerationValue.toFixed(2)}`
        : `÷${(1 / Math.max(celerationValue, 0.01)).toFixed(2)}`;

const buildAlertDigest = (payload: InboxContext): string => payload.alerts
        .slice(0, 3)
        .map((alert) =>
            `${alert.moniker} (${alert.level}, risk ${alert.riskScore.toFixed(1)}, ${alert.attentionLabel}, ` +
            `${alert.behaviorRatePerHour.toFixed(1)}/hr, ${alert.skillAccuracyPct.toFixed(1)}% skills, ` +
            `${alert.promptDependencePct.toFixed(1)}% prompt dep, celeration ${formatCeleration(alert.celerationValue)}/wk ` +
            `(${alert.celerationDeltaPct.toFixed(1)}%, ${alert.celerationInterpretation}))`
        )
        .join('; ');

const buildSummaryPrompt = (payload: InboxSummaryRequest): string => {
    const alertDigest = buildAlertDigest(payload);
    return [
        `Caseload size: ${payload.totalClients}`,
        `Review load: ${payload.criticalCount} review, ${payload.watchCount} monitor`,
        `Averages: behavior ${payload.averageBehaviorRate.toFixed(1)}/hr, skill accuracy ${payload.averageSkillAccuracy.toFixed(1)}%`,
        `Top alerts: ${alertDigest || 'none'}`,
        'Task: generate one concise caseload summary with the biggest risks and immediate BCBA next steps.'
    ].join('\n');
};

const buildClientDigest = (payload: InboxContext): string => payload.clients
        .slice(0, 8)
        .map(
            (client) =>
                `${client.moniker} (${client.level}, risk ${client.riskScore.toFixed(1)}, ` +
                `${client.behaviorRatePerHour.toFixed(1)}/hr, ${client.skillAccuracyPct.toFixed(1)}% skills, ` +
                `${client.promptDependencePct.toFixed(1)}% prompt dep, celeration ${formatCeleration(client.celerationValue)}/wk, ` +
                `delta ${client.celerationDeltaPct.toFixed(1)}%, ${client.celerationInterpretation})`
        )
        .join('; ');

const buildChatPrompt = (payload: InboxChatRequest): string => {
    const alertDigest = buildAlertDigest(payload);
    const clientDigest = buildClientDigest(payload);
    const nonZeroCeleration = payload.clients
        .filter((client) => Math.abs(client.celerationDeltaPct) > 0)
        .map((client) => `${client.moniker} (${client.celerationDeltaPct.toFixed(1)}%)`)
        .join(', ');
    const recentTurns = (payload.recentMessages || [])
        .slice(-6)
        .map((turn) => `${turn.role}: ${turn.text}`)
        .join('\n');

    return [
        `Caseload size: ${payload.totalClients}`,
        `Review load: ${payload.criticalCount} review, ${payload.watchCount} monitor`,
        `Averages: behavior ${payload.averageBehaviorRate.toFixed(1)}/hr, skill accuracy ${payload.averageSkillAccuracy.toFixed(1)}%`,
        `Top alerts: ${alertDigest || 'none'}`,
        `All clients snapshot: ${clientDigest || 'none'}`,
        `Clients with non-zero celeration delta: ${nonZeroCeleration || 'none'}`,
        `Current summary: ${payload.currentSummary || 'none'}`,
        `Recent chat:\n${recentTurns || 'none'}`,
        `User question: ${payload.message}`
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

    if (!payload?.summaryScope || !Array.isArray(payload.alerts) || !Array.isArray(payload.clients)) {
        return {
            status: 400,
            jsonBody: { error: 'Missing required fields' }
        };
    }
    if (payload.summaryScope === 'chat' && !((payload as InboxChatRequest).message || '').trim()) {
        return {
            status: 400,
            jsonBody: { error: 'Chat message is required' }
        };
    }

    const systemPrompt = payload.summaryScope === 'caseload'
        ? 'You are a BCBA assistant. Write one calm, concise caseload-level summary for the Inbox. ' +
          'Use ABA language (antecedent strategy, reinforcement schedule, prompt fading, procedural fidelity). ' +
          'Mention key risk concentration and actionable next steps. ' +
          'Grounding rule: use only provided caseload data and do not invent thresholds or values. ' +
          'Return plain text, max 95 words.'
        : 'You are a BCBA assistant in an inbox chat. Answer the user question with concise, clinically grounded guidance. ' +
          'Use ABA terms and reference provided caseload measures. ' +
          'Grounding rules: use only provided numbers and definitions; if a value is unavailable, explicitly say it is unavailable in current snapshot; ' +
          'do not invent thresholds, formulas, or extra clients. ' +
          'Treat any celeration delta value not equal to 0.0 as non-zero. ' +
          'SCC interpretation for behavior reduction targets: prefer the provided celerationInterpretation field. ' +
          'Use worsening when celeration is at least x1.15 per week, improving when at or below ÷1.15 per week, otherwise flat. ' +
          'Known definitions: risk critical if score >= 78, watch if >= 58; ' +
          'risk formula = 22 + behaviorRate*4.5 + (100-skillAccuracy)*0.55 + promptDependence*0.35 + max(0, celerationDeltaPct)*1.2; ' +
          'celeration is computed from recent behavior-rate trend and normalized to a weekly multiplier. ' +
          'Return plain text, max 120 words.';

    const userPrompt = payload.summaryScope === 'caseload'
        ? buildSummaryPrompt(payload as InboxSummaryRequest)
        : buildChatPrompt(payload as InboxChatRequest);

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
