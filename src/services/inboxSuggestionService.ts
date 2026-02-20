import type { AlertLevel } from './dashboardSimulator'

export type CaseloadAlertSnapshot = {
  moniker: string
  level: AlertLevel
  attentionLabel: string
  riskScore: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationValue: number
  celerationDeltaPct: number
  celerationPeriod: 'per_week'
  celerationInterpretation: 'worsening' | 'improving' | 'flat'
}

export type CaseloadClientSnapshot = {
  moniker: string
  level: AlertLevel
  attentionLabel: string
  riskScore: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationValue: number
  celerationDeltaPct: number
  celerationPeriod: 'per_week'
  celerationInterpretation: 'worsening' | 'improving' | 'flat'
}

type InboxContext = {
  generatedAtMs: number
  totalClients: number
  watchCount: number
  criticalCount: number
  averageBehaviorRate: number
  averageSkillAccuracy: number
  alerts: CaseloadAlertSnapshot[]
  clients: CaseloadClientSnapshot[]
}

export type InboxSummaryRequest = InboxContext & {
  summaryScope: 'caseload'
}

export type InboxChatRequest = InboxContext & {
  summaryScope: 'chat'
  message: string
  currentSummary?: string
  recentMessages?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export type InboxSuggestionRequest = InboxSummaryRequest | InboxChatRequest

export const streamInboxSuggestion = async (
  input: InboxSuggestionRequest,
  onChunk: (chunk: string) => void
): Promise<string> => {
  const response = await fetch('/api/dashboard/inbox-suggestion/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || `Suggestion request failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error('Suggestion stream was empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let output = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    const chunk = decoder.decode(value, { stream: true })
    if (chunk) {
      output += chunk
      onChunk(chunk)
    }
  }

  const trailing = decoder.decode()
  if (trailing) {
    output += trailing
    onChunk(trailing)
  }

  return output.trim()
}
