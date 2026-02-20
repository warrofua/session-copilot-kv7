import type { AlertLevel } from './dashboardSimulator'

export type AlertSignalSnapshot = {
  label: string
  currentValue: number
  delta: number
  measureLabel: string
}

export type InboxSuggestionRequest = {
  moniker: string
  level: AlertLevel
  attentionLabel: string
  riskScore: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationValue: number
  celerationDeltaPct: number
  behaviors: AlertSignalSnapshot[]
  skills: AlertSignalSnapshot[]
}

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
