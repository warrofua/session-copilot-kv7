export interface StmInsightInput {
  clientId: string
  moniker: string
  notes: string[]
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationDeltaPct: number
}

export interface StmInsight {
  source: 'stm-api' | 'heuristic'
  riskScore: number
  summary: string
  evaluatedAtMs: number
  entropy?: number
  velocity?: number
}

type StmEvasionResponse = {
  payload?: {
    aggregate_entropy?: number
    aggregate_velocity?: number
  }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const baseUrl = (import.meta.env.VITE_STM_API_URL as string | undefined)?.trim() || '/stm'

const isStmEnabled = (): boolean => {
  const enabled = (import.meta.env.VITE_ENABLE_STM as string | undefined)?.trim()
  if (!enabled) {
    return true
  }
  return enabled !== '0' && enabled.toLowerCase() !== 'false'
}

const scoreHeuristically = (input: StmInsightInput): number => {
  return clamp(
    24 +
      input.behaviorRatePerHour * 4.7 +
      (100 - input.skillAccuracyPct) * 0.5 +
      input.promptDependencePct * 0.42 +
      Math.max(0, input.celerationDeltaPct) * 1.35,
    0,
    100
  )
}

export const deriveHeuristicInsight = (input: StmInsightInput): StmInsight => {
  const riskScore = Number(scoreHeuristically(input).toFixed(2))
  const summary =
    riskScore >= 80
      ? `${input.moniker}: notable shift detected. A BCBA check-in may be helpful soon.`
      : riskScore >= 62
      ? `${input.moniker}: trend is moving outside typical range. Consider a brief protocol review.`
      : `${input.moniker}: trend is within expected range.`

  return {
    source: 'heuristic',
    riskScore,
    summary,
    evaluatedAtMs: Date.now(),
  }
}

const scoreFromStm = (entropy: number, velocity: number, fallback: number): number => {
  if (Number.isNaN(entropy) || Number.isNaN(velocity)) {
    return fallback
  }
  const normalizedEntropy = clamp((entropy / 8) * 100, 0, 100)
  const normalizedVelocity = clamp((velocity / 0.45) * 100, 0, 100)
  return clamp(normalizedEntropy * 0.38 + normalizedVelocity * 0.62, 0, 100)
}

export const fetchStmInsight = async (input: StmInsightInput): Promise<StmInsight> => {
  const fallback = deriveHeuristicInsight(input)

  if (!isStmEnabled()) {
    return fallback
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2200)

  try {
    const response = await fetch(`${baseUrl}/v1/audit/detect-evasion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: input.notes }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return fallback
    }

    const data = (await response.json()) as StmEvasionResponse
    const entropy = Number(data?.payload?.aggregate_entropy ?? Number.NaN)
    const velocity = Number(data?.payload?.aggregate_velocity ?? Number.NaN)
    const riskScore = Number(scoreFromStm(entropy, velocity, fallback.riskScore).toFixed(2))

    const summary =
      riskScore >= 80
        ? `${input.moniker}: STM noticed a meaningful pattern shift; consider a clinical review.`
        : riskScore >= 62
        ? `${input.moniker}: STM detected mild drift. A quick fidelity check may help.`
        : `${input.moniker}: STM signal is steady with no major drift.`

    return {
      source: 'stm-api',
      riskScore,
      summary,
      evaluatedAtMs: Date.now(),
      entropy: Number.isNaN(entropy) ? undefined : entropy,
      velocity: Number.isNaN(velocity) ? undefined : velocity,
    }
  } catch {
    return fallback
  } finally {
    clearTimeout(timeout)
  }
}
