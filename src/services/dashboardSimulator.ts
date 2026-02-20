export type AlertLevel = 'stable' | 'watch' | 'critical'

export interface DashboardPoint {
  timestampMs: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationValue: number
  celerationDeltaPct: number
  celerationPeriod: 'per_week'
  celerationInterpretation: 'worsening' | 'improving' | 'flat'
  riskScore: number
}

export interface DashboardSignalSeries {
  signalId: string
  label: string
  measureLabel: string
  color: string
  currentValue: number
  lastUpdatedTick: number
  history: number[]
}

export interface DashboardClientFeed {
  clientId: string
  moniker: string
  ageYears: number
  primaryReinforcer: string
  alertLevel: AlertLevel
  attentionLabel: string
  points: DashboardPoint[]
  skillSignals: DashboardSignalSeries[]
  behaviorSignals: DashboardSignalSeries[]
}

export interface DashboardSimulationState {
  seed: number
  tick: number
  generatedAtMs: number
  clients: InternalClientState[]
}

type InternalSignalState = {
  signalId: string
  label: string
  measureLabel: string
  color: string
  min: number
  max: number
  baseline: number
  value: number
  trend: number
  lastUpdatedTick: number
  history: number[]
}

type InternalClientState = {
  clientId: string
  moniker: string
  ageYears: number
  primaryReinforcer: string
  seed: number
  volatility: number
  behaviorBaseline: number
  skillBaseline: number
  promptBaseline: number
  phase: number
  behaviorTrend: number
  skillTrend: number
  promptTrend: number
  trendTicksRemaining: number
  stabilityBias: number
  activeSkillProgramIndex: number
  skillProgramTicksRemaining: number
  skillProgramSignalIds: string[][]
  behaviorFocusSignalIds: string[]
  points: DashboardPoint[]
  skillSignals: InternalSignalState[]
  behaviorSignals: InternalSignalState[]
}

type SignalCatalogEntry = {
  signalId: string
  label: string
  measureLabel: string
  color: string
}

const HISTORY_LIMIT = 168
const CELERATION_WINDOW_DAYS = 14
const CELERATION_MIN_DAYS = 5
const CELERATION_PERIOD_DAYS = 7
const CELERATION_RISING_THRESHOLD = 1.15
const CELERATION_FALLING_THRESHOLD = 1 / CELERATION_RISING_THRESHOLD
const DAY_MS = 86_400_000
const DEFAULT_SESSION_ZOOM_DAYS = 7
const SESSION_SNAPSHOTS_PER_DAY = 12
const PRELOAD_TICK_SECONDS = 15
const FIELD_ADVANCE_PROBABILITY = 0.25
const SKILL_PROGRAM_SIZE = 3
const SKILL_PROGRAM_MIN_TICKS = 14
const SKILL_PROGRAM_MAX_TICKS = 28

const reinforcers = [
  'token board',
  'music break',
  'sensory swing',
  'lego build',
  'bubbles',
  'tablet time',
  'movement game',
  'art station',
  'story time',
  'snack choice',
  'puzzle box',
  'trampoline break',
]

const monikerRoots = ['Atlas', 'Cedar', 'Comet', 'Echo', 'Harbor', 'Jasper', 'Lumen', 'Mosaic', 'Nova', 'Orion', 'River', 'Summit']

const skillCatalog: SignalCatalogEntry[] = [
  { signalId: 'listener-response', label: 'Listener Resp', measureLabel: '% correct trials', color: '#63b3ed' },
  { signalId: 'manding', label: 'Manding', measureLabel: '% independent mands', color: '#4fd1c5' },
  { signalId: 'motor-imitation', label: 'Motor Imitation', measureLabel: '% independent trials', color: '#68d391' },
  { signalId: 'intraverbal', label: 'Intraverbal', measureLabel: '% correct trials', color: '#f6ad55' },
  { signalId: 'lrffc', label: 'LRFFC', measureLabel: '% mastered targets', color: '#f687b3' },
]

const behaviorCatalog: SignalCatalogEntry[] = [
  { signalId: 'aggression', label: 'Aggression', measureLabel: 'events/hr', color: '#fc8181' },
  { signalId: 'elopement', label: 'Elopement', measureLabel: 'episodes/hr', color: '#f6ad55' },
  { signalId: 'sib', label: 'SIB', measureLabel: 'responses/hr', color: '#f687b3' },
  { signalId: 'tantrum', label: 'Tantrum', measureLabel: 'minutes/hr', color: '#f56565' },
  { signalId: 'task-refusal', label: 'Task Refusal', measureLabel: '% intervals', color: '#90cdf4' },
]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const round = (value: number): number => Number(value.toFixed(2))

const smoothToward = (previous: number, target: number, alpha: number, maxDelta: number): number => {
  const blended = previous + (target - previous) * alpha
  return clamp(blended, previous - maxDelta, previous + maxDelta)
}

const takeWrapped = <T>(items: T[], startIndex: number, count: number): T[] => {
  if (items.length === 0 || count <= 0) {
    return []
  }
  return Array.from({ length: count }, (_, index) => items[(startIndex + index) % items.length])
}

const nextSeed = (seed: number): number => {
  let value = seed | 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return value >>> 0
}

const randFromSeed = (seed: number): { seed: number; value: number } => {
  const updated = nextSeed(seed)
  return { seed: updated, value: updated / 0xffffffff }
}

const buildMoniker = (reinforcer: string, raw: number): string => {
  const monikerRoot = monikerRoots[Math.floor(raw * monikerRoots.length) % monikerRoots.length]
  const reinforcerNoun = reinforcer.split(' ')[0]
  const suffix = Math.floor(raw * 90 + 10)
  return `${monikerRoot}-${reinforcerNoun}-${suffix}`
}

const toCelerationInterpretation = (celerationValue: number): DashboardPoint['celerationInterpretation'] => {
  if (celerationValue >= CELERATION_RISING_THRESHOLD) {
    return 'worsening'
  }
  if (celerationValue <= CELERATION_FALLING_THRESHOLD) {
    return 'improving'
  }
  return 'flat'
}

const computeCelerationMetrics = (points: DashboardPoint[]): { celerationValue: number; celerationDeltaPct: number } => {
  if (points.length < CELERATION_MIN_DAYS) {
    return { celerationValue: 1, celerationDeltaPct: 0 }
  }

  const dailyBuckets = points.reduce<Map<number, { sum: number; count: number }>>((acc, point) => {
    const dayBucket = Math.floor(point.timestampMs / DAY_MS)
    const existing = acc.get(dayBucket)
    if (existing) {
      existing.sum += point.behaviorRatePerHour
      existing.count += 1
      return acc
    }
    acc.set(dayBucket, { sum: point.behaviorRatePerHour, count: 1 })
    return acc
  }, new Map())

  const dailySeries = [...dailyBuckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .slice(-CELERATION_WINDOW_DAYS)
    .map(([dayBucket, aggregate]) => ({
      dayBucket,
      behaviorRatePerHour: aggregate.sum / Math.max(1, aggregate.count),
    }))

  if (dailySeries.length < CELERATION_MIN_DAYS) {
    return { celerationValue: 1, celerationDeltaPct: 0 }
  }

  const startDayBucket = dailySeries[0]?.dayBucket ?? 0

  const transformed = dailySeries.map((point) => ({
    x: point.dayBucket - startDayBucket,
    y: Math.log10(Math.max(point.behaviorRatePerHour, 0.01)),
  }))

  const meanX = transformed.reduce((sum, point) => sum + point.x, 0) / transformed.length
  const meanY = transformed.reduce((sum, point) => sum + point.y, 0) / transformed.length

  const covariance = transformed.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
  const varianceX = transformed.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)

  if (varianceX <= Number.EPSILON) {
    return { celerationValue: 1, celerationDeltaPct: 0 }
  }

  const slope = covariance / varianceX
  const celerationValue = clamp(10 ** (slope * CELERATION_PERIOD_DAYS), 0.2, 5)
  const celerationDeltaPct = (celerationValue - 1) * 100

  return { celerationValue, celerationDeltaPct }
}

const computeAttentionLabel = (riskScore: number, celerationValue: number): string => {
  if (riskScore >= 78) {
    if (celerationValue >= CELERATION_RISING_THRESHOLD) {
      return 'Rising trend'
    }
    if (celerationValue <= CELERATION_FALLING_THRESHOLD) {
      return 'Settling trend'
    }
    return 'Needs closer look'
  }
  if (riskScore >= 58) {
    return celerationValue >= 1.08 ? 'Baseline drift' : 'Monitor trend'
  }
  return 'Within expected range'
}

const computeAlertLevel = (riskScore: number): AlertLevel => {
  if (riskScore >= 78) {
    return 'critical'
  }
  if (riskScore >= 58) {
    return 'watch'
  }
  return 'stable'
}

const makeInitialPoint = (
  timestampMs: number,
  behaviorRatePerHour: number,
  skillAccuracyPct: number,
  promptDependencePct: number
): DashboardPoint => ({
  timestampMs,
  behaviorRatePerHour,
  skillAccuracyPct,
  promptDependencePct,
  celerationValue: 1,
  celerationDeltaPct: 0,
  celerationPeriod: 'per_week',
  celerationInterpretation: 'flat',
  riskScore: 0,
})

const createSignalStates = (
  seed: number,
  catalog: SignalCatalogEntry[],
  baselineAnchor: number,
  baselineSpread: number,
  min: number,
  max: number,
  trendRange: number
): { signals: InternalSignalState[]; seed: number } => {
  let currentSeed = seed
  const signals: InternalSignalState[] = []

  catalog.forEach((entry) => {
    const baselineRand = randFromSeed(currentSeed)
    currentSeed = baselineRand.seed
    const baseline = clamp(baselineAnchor + (baselineRand.value - 0.5) * baselineSpread, min, max)

    const trendRand = randFromSeed(currentSeed)
    currentSeed = trendRand.seed
    const trend = (trendRand.value - 0.5) * trendRange

    signals.push({
      signalId: entry.signalId,
      label: entry.label,
      measureLabel: entry.measureLabel,
      color: entry.color,
      min,
      max,
      baseline: round(baseline),
      value: round(baseline),
      trend,
      lastUpdatedTick: 0,
      history: [round(baseline)],
    })
  })

  return { signals, seed: currentSeed }
}

const buildSignalOrder = (seed: number, signalIds: string[]): { ordered: string[]; seed: number } => {
  if (signalIds.length === 0) {
    return { ordered: [], seed }
  }

  let currentSeed = seed
  const startRand = randFromSeed(currentSeed)
  currentSeed = startRand.seed
  const startIndex = Math.floor(startRand.value * signalIds.length) % signalIds.length

  return {
    ordered: signalIds.map((_, index) => signalIds[(startIndex + index) % signalIds.length]),
    seed: currentSeed,
  }
}

const createSkillPrograms = (seed: number): { programs: string[][]; seed: number } => {
  const signalIds = skillCatalog.map((entry) => entry.signalId)
  const orderedSignals = buildSignalOrder(seed, signalIds)

  const programs = [
    takeWrapped(orderedSignals.ordered, 0, SKILL_PROGRAM_SIZE),
    takeWrapped(orderedSignals.ordered, 1, SKILL_PROGRAM_SIZE),
    takeWrapped(orderedSignals.ordered, 2, SKILL_PROGRAM_SIZE),
  ]

  return {
    programs,
    seed: orderedSignals.seed,
  }
}

const createBehaviorFocusSignals = (seed: number): { signalIds: string[]; seed: number } => {
  const signalIds = behaviorCatalog.map((entry) => entry.signalId)
  const orderedSignals = buildSignalOrder(seed, signalIds)
  return {
    signalIds: takeWrapped(orderedSignals.ordered, 0, Math.min(3, orderedSignals.ordered.length)),
    seed: orderedSignals.seed,
  }
}

const createClientState = (index: number, seed: number, timestampMs: number): { state: InternalClientState; seed: number } => {
  let currentSeed = seed

  const ageRand = randFromSeed(currentSeed)
  currentSeed = ageRand.seed
  const ageYears = 4 + Math.floor(ageRand.value * 13)

  const reinforcerRand = randFromSeed(currentSeed)
  currentSeed = reinforcerRand.seed
  const reinforcer = reinforcers[Math.floor(reinforcerRand.value * reinforcers.length) % reinforcers.length]

  const monikerRand = randFromSeed(currentSeed)
  currentSeed = monikerRand.seed
  const moniker = buildMoniker(reinforcer, monikerRand.value)

  const behaviorRand = randFromSeed(currentSeed)
  currentSeed = behaviorRand.seed
  const behaviorBaseline = round(1.2 + behaviorRand.value * 8.8)

  const skillRand = randFromSeed(currentSeed)
  currentSeed = skillRand.seed
  const skillBaseline = round(54 + skillRand.value * 40)

  const promptRand = randFromSeed(currentSeed)
  currentSeed = promptRand.seed
  const promptBaseline = round(18 + promptRand.value * 38)

  const volRand = randFromSeed(currentSeed)
  currentSeed = volRand.seed
  const volatility = 0.35 + volRand.value * 0.75

  const phaseRand = randFromSeed(currentSeed)
  currentSeed = phaseRand.seed
  const phase = 0.2 + phaseRand.value * 1.8

  const trendRandA = randFromSeed(currentSeed)
  currentSeed = trendRandA.seed
  const behaviorTrend = (trendRandA.value - 0.5) * 0.08

  const trendRandB = randFromSeed(currentSeed)
  currentSeed = trendRandB.seed
  const skillTrend = (0.5 - trendRandB.value) * 0.2

  const trendRandC = randFromSeed(currentSeed)
  currentSeed = trendRandC.seed
  const promptTrend = (trendRandC.value - 0.5) * 0.22

  const trendDurationRand = randFromSeed(currentSeed)
  currentSeed = trendDurationRand.seed
  const trendTicksRemaining = 5 + Math.floor(trendDurationRand.value * 8)

  const stabilityRand = randFromSeed(currentSeed)
  currentSeed = stabilityRand.seed
  const stabilityBias = 0.62 + stabilityRand.value * 0.24

  const skillsBuilt = createSignalStates(currentSeed, skillCatalog, skillBaseline, 16, 35, 99, 0.4)
  currentSeed = skillsBuilt.seed

  const behaviorsBuilt = createSignalStates(currentSeed, behaviorCatalog, behaviorBaseline, 3.2, 0.2, 20, 0.2)
  currentSeed = behaviorsBuilt.seed

  const skillProgramsBuilt = createSkillPrograms(currentSeed)
  currentSeed = skillProgramsBuilt.seed

  const behaviorFocusBuilt = createBehaviorFocusSignals(currentSeed)
  currentSeed = behaviorFocusBuilt.seed

  const initialProgramDurationRand = randFromSeed(currentSeed)
  currentSeed = initialProgramDurationRand.seed
  const skillProgramTicksRemaining =
    SKILL_PROGRAM_MIN_TICKS +
    Math.floor(initialProgramDurationRand.value * (SKILL_PROGRAM_MAX_TICKS - SKILL_PROGRAM_MIN_TICKS + 1))

  const initialPoint = makeInitialPoint(timestampMs, behaviorBaseline, skillBaseline, promptBaseline)

  return {
    state: {
      clientId: `demo-client-${index + 1}`,
      moniker,
      ageYears,
      primaryReinforcer: reinforcer,
      seed: currentSeed,
      volatility,
      behaviorBaseline,
      skillBaseline,
      promptBaseline,
      phase,
      behaviorTrend,
      skillTrend,
      promptTrend,
      trendTicksRemaining,
      stabilityBias,
      activeSkillProgramIndex: 0,
      skillProgramTicksRemaining,
      skillProgramSignalIds: skillProgramsBuilt.programs,
      behaviorFocusSignalIds: behaviorFocusBuilt.signalIds,
      points: [initialPoint],
      skillSignals: skillsBuilt.signals,
      behaviorSignals: behaviorsBuilt.signals,
    },
    seed: currentSeed,
  }
}

const preloadClientHistory = (
  client: InternalClientState,
  startTick: number,
  startTimestampMs: number,
  endTimestampMs: number,
  snapshots: number
): { client: InternalClientState; tick: number } => {
  if (snapshots <= 0) {
    return { client, tick: startTick }
  }

  let tick = startTick
  let nextClient = client
  const intervalMs = Math.max(1, (endTimestampMs - startTimestampMs) / snapshots)

  for (let index = 0; index < snapshots; index += 1) {
    tick += 1
    const timestampMs = Math.round(startTimestampMs + intervalMs * (index + 1))
    nextClient = stepClient(nextClient, tick, timestampMs, PRELOAD_TICK_SECONDS)
  }

  return { client: nextClient, tick }
}

const stepSignalGroup = (
  signals: InternalSignalState[],
  tick: number,
  seed: number,
  cadenceFactor: number,
  options?: {
    focusedSignalIds?: Set<string>
    focusedAdvanceBonus?: number
    unfocusedAdvanceScale?: number
    trendDriftScale?: number
    noiseScale?: number
    alphaScale?: number
    maxDeltaScale?: number
  }
): { signals: InternalSignalState[]; seed: number } => {
  let currentSeed = seed
  const focusedSignalIds = options?.focusedSignalIds
  const focusedAdvanceBonus = options?.focusedAdvanceBonus ?? 0
  const unfocusedAdvanceScale = options?.unfocusedAdvanceScale ?? 1
  const trendDriftScale = options?.trendDriftScale ?? 1
  const noiseScale = options?.noiseScale ?? 1
  const alphaScale = options?.alphaScale ?? 1
  const maxDeltaScale = options?.maxDeltaScale ?? 1

  const nextSignals = signals.map((signal) => {
    const advanceRand = randFromSeed(currentSeed)
    currentSeed = advanceRand.seed
    const noiseA = randFromSeed(currentSeed)
    currentSeed = noiseA.seed
    const noiseB = randFromSeed(currentSeed)
    currentSeed = noiseB.seed

    const isFocusedSignal = focusedSignalIds?.has(signal.signalId) ?? false
    const advanceProbability = clamp(
      isFocusedSignal
        ? FIELD_ADVANCE_PROBABILITY + focusedAdvanceBonus
        : FIELD_ADVANCE_PROBABILITY * unfocusedAdvanceScale,
      0.01,
      0.95
    )
    const shouldAdvance = advanceRand.value < advanceProbability
    const trendDrift = (noiseA.value - 0.5) * 0.04 * cadenceFactor * trendDriftScale
    const nextTrend = clamp(signal.trend * 0.96 + trendDrift, -1.2, 1.2)

    const reversion = (signal.baseline - signal.value) * 0.08
    const noise = (noiseB.value - 0.5) * 0.42 * cadenceFactor * noiseScale
    const target = clamp(signal.value + nextTrend * 0.3 + reversion + noise, signal.min, signal.max)

    const alpha = (0.11 + cadenceFactor * 0.06) * alphaScale
    const maxDelta = (0.28 + cadenceFactor * 0.22) * maxDeltaScale
    const value = shouldAdvance ? round(smoothToward(signal.value, target, alpha, maxDelta)) : signal.value

    const history = [...signal.history, value].slice(-HISTORY_LIMIT)

    return {
      ...signal,
      trend: nextTrend,
      value,
      lastUpdatedTick: shouldAdvance ? tick : signal.lastUpdatedTick,
      history,
    }
  })

  return {
    signals: nextSignals,
    seed: currentSeed,
  }
}

const averageSignalValue = (signals: InternalSignalState[]): number => {
  if (signals.length === 0) {
    return 0
  }
  return signals.reduce((sum, signal) => sum + signal.value, 0) / signals.length
}

const stepClient = (
  client: InternalClientState,
  tick: number,
  generatedAtMs: number,
  tickSeconds: number
): InternalClientState => {
  let seed = client.seed
  const cadenceFactor = clamp(tickSeconds / 16, 0.07, 0.95)

  let activeSkillProgramIndex = client.activeSkillProgramIndex
  let skillProgramTicksRemaining = client.skillProgramTicksRemaining
  const skillProgramDurationRand = randFromSeed(seed)
  seed = skillProgramDurationRand.seed

  if (skillProgramTicksRemaining > 0) {
    skillProgramTicksRemaining -= 1
  } else {
    activeSkillProgramIndex = (activeSkillProgramIndex + 1) % Math.max(1, client.skillProgramSignalIds.length)
    skillProgramTicksRemaining =
      SKILL_PROGRAM_MIN_TICKS +
      Math.floor(skillProgramDurationRand.value * (SKILL_PROGRAM_MAX_TICKS - SKILL_PROGRAM_MIN_TICKS + 1))
  }

  const activeSkillSignals = new Set(client.skillProgramSignalIds[activeSkillProgramIndex] ?? [])
  const behaviorFocusSignals = new Set(client.behaviorFocusSignalIds)

  const skillsUpdate = stepSignalGroup(client.skillSignals, tick, seed, cadenceFactor, {
    focusedSignalIds: activeSkillSignals,
    focusedAdvanceBonus: 0.22,
    unfocusedAdvanceScale: 0.18,
    trendDriftScale: 0.88,
    noiseScale: 0.82,
    alphaScale: 0.9,
    maxDeltaScale: 0.86,
  })
  seed = skillsUpdate.seed

  const behaviorsUpdate = stepSignalGroup(client.behaviorSignals, tick, seed, cadenceFactor, {
    focusedSignalIds: behaviorFocusSignals,
    focusedAdvanceBonus: 0.2,
    unfocusedAdvanceScale: 0.1,
    trendDriftScale: 0.75,
    noiseScale: 0.72,
    alphaScale: 0.84,
    maxDeltaScale: 0.78,
  })
  seed = behaviorsUpdate.seed

  const noiseA = randFromSeed(seed)
  seed = noiseA.seed
  const noiseB = randFromSeed(seed)
  seed = noiseB.seed
  const trendGateRand = randFromSeed(seed)
  seed = trendGateRand.seed
  const trendDurationRand = randFromSeed(seed)
  seed = trendDurationRand.seed
  const trendShapeRand = randFromSeed(seed)
  seed = trendShapeRand.seed
  const behaviorAdvanceRand = randFromSeed(seed)
  seed = behaviorAdvanceRand.seed
  const skillAdvanceRand = randFromSeed(seed)
  seed = skillAdvanceRand.seed
  const promptAdvanceRand = randFromSeed(seed)
  seed = promptAdvanceRand.seed

  const previousPoint = client.points[client.points.length - 1]

  let behaviorTrend = client.behaviorTrend
  let skillTrend = client.skillTrend
  let promptTrend = client.promptTrend
  let trendTicksRemaining = client.trendTicksRemaining

  if (trendTicksRemaining > 0) {
    trendTicksRemaining -= 1
    const trendNudge = (trendShapeRand.value - 0.5) * 0.015 * cadenceFactor
    behaviorTrend = clamp(behaviorTrend * 0.98 + trendNudge, -0.32, 0.32)
    skillTrend = clamp(skillTrend * 0.98 - trendNudge * 1.6, -0.9, 0.9)
    promptTrend = clamp(promptTrend * 0.98 + trendNudge * 1.2, -0.9, 0.9)
  } else if (trendGateRand.value > 0.86) {
    const direction = trendShapeRand.value >= 0.5 ? 1 : -1
    const intensity = (0.08 + noiseA.value * 0.16) * cadenceFactor
    behaviorTrend = direction * intensity * client.volatility
    skillTrend = clamp(-direction * (0.18 + noiseB.value * 0.45) * cadenceFactor, -0.9, 0.9)
    promptTrend = clamp(direction * (0.16 + noiseA.value * 0.38) * cadenceFactor, -0.9, 0.9)
    trendTicksRemaining = 6 + Math.floor(trendDurationRand.value * 10)
  } else {
    behaviorTrend *= 0.75
    skillTrend *= 0.75
    promptTrend *= 0.75
  }

  const behaviorComposite = averageSignalValue(behaviorsUpdate.signals)
  const skillComposite = averageSignalValue(skillsUpdate.signals)
  const quietTick = trendTicksRemaining === 0 && noiseB.value < client.stabilityBias
  const oscillation =
    Math.sin((tick / 36) * client.phase) * 0.35 + Math.cos((tick / 44) * (client.phase + 0.2)) * 0.2

  const behaviorTarget = clamp(
    previousPoint.behaviorRatePerHour +
      (behaviorComposite - previousPoint.behaviorRatePerHour) * 0.16 +
      (client.behaviorBaseline - previousPoint.behaviorRatePerHour) * 0.02 +
      behaviorTrend +
      oscillation * client.volatility * 0.2 +
      (noiseA.value - 0.5) * (quietTick ? 0.2 : 0.5) * client.volatility * cadenceFactor,
    0.2,
    20
  )
  const behaviorRate = clamp(
    smoothToward(
      previousPoint.behaviorRatePerHour,
      behaviorTarget,
      quietTick ? 0.16 * cadenceFactor : 0.22 * cadenceFactor,
      quietTick ? 0.2 * cadenceFactor : 0.45 * cadenceFactor
    ),
    0.2,
    20
  )
  const nextBehaviorRate =
    behaviorAdvanceRand.value < FIELD_ADVANCE_PROBABILITY ? behaviorRate : previousPoint.behaviorRatePerHour

  const skillTarget = clamp(
    previousPoint.skillAccuracyPct +
      (skillComposite - previousPoint.skillAccuracyPct) * 0.15 +
      (client.skillBaseline - previousPoint.skillAccuracyPct) * 0.03 +
      skillTrend -
      nextBehaviorRate * 0.06 +
      client.behaviorBaseline * 0.05 +
      (0.5 - noiseB.value) * (quietTick ? 0.4 : 0.9) * cadenceFactor,
    35,
    99
  )
  const skillAccuracy = clamp(
    smoothToward(
      previousPoint.skillAccuracyPct,
      skillTarget,
      quietTick ? 0.15 * cadenceFactor : 0.2 * cadenceFactor,
      quietTick ? 0.45 * cadenceFactor : 0.85 * cadenceFactor
    ),
    35,
    99
  )
  const nextSkillAccuracy =
    skillAdvanceRand.value < FIELD_ADVANCE_PROBABILITY ? skillAccuracy : previousPoint.skillAccuracyPct

  const promptTarget = clamp(
    previousPoint.promptDependencePct +
      (client.promptBaseline - previousPoint.promptDependencePct) * 0.04 +
      promptTrend +
      nextBehaviorRate * 0.18 -
      nextSkillAccuracy * 0.09 +
      (noiseA.value - 0.5) * (quietTick ? 0.4 : 0.95) * cadenceFactor,
    5,
    92
  )
  const promptDependence = clamp(
    smoothToward(
      previousPoint.promptDependencePct,
      promptTarget,
      quietTick ? 0.15 * cadenceFactor : 0.2 * cadenceFactor,
      quietTick ? 0.4 * cadenceFactor : 0.8 * cadenceFactor
    ),
    5,
    92
  )
  const nextPromptDependence =
    promptAdvanceRand.value < FIELD_ADVANCE_PROBABILITY ? promptDependence : previousPoint.promptDependencePct

  const nextPoint = makeInitialPoint(
    generatedAtMs,
    round(nextBehaviorRate),
    round(nextSkillAccuracy),
    round(nextPromptDependence)
  )

  const points = [...client.points, nextPoint].slice(-HISTORY_LIMIT)
  const { celerationValue, celerationDeltaPct } = computeCelerationMetrics(points)
  const riskScore = clamp(
    22 +
      nextPoint.behaviorRatePerHour * 4.5 +
      (100 - nextPoint.skillAccuracyPct) * 0.55 +
      nextPoint.promptDependencePct * 0.35 +
      Math.max(0, celerationDeltaPct) * 1.2,
    0,
    100
  )

  points[points.length - 1] = {
    ...nextPoint,
    celerationValue: round(celerationValue),
    celerationDeltaPct: round(celerationDeltaPct),
    celerationPeriod: 'per_week',
    celerationInterpretation: toCelerationInterpretation(celerationValue),
    riskScore: round(riskScore),
  }

  return {
    ...client,
    seed,
    behaviorTrend,
    skillTrend,
    promptTrend,
    trendTicksRemaining,
    activeSkillProgramIndex,
    skillProgramTicksRemaining,
    points,
    skillSignals: skillsUpdate.signals,
    behaviorSignals: behaviorsUpdate.signals,
  }
}

const toSignalSeries = (signals: InternalSignalState[]): DashboardSignalSeries[] =>
  signals.map((signal) => ({
    signalId: signal.signalId,
    label: signal.label,
    measureLabel: signal.measureLabel,
    color: signal.color,
    currentValue: signal.value,
    lastUpdatedTick: signal.lastUpdatedTick,
    history: signal.history,
  }))

export const createDashboardSimulation = (
  clientCount: number,
  seed: number = Date.now(),
  generatedAtMs: number = Date.now(),
  sessionZoomDays: number = DEFAULT_SESSION_ZOOM_DAYS
): DashboardSimulationState => {
  const count = clamp(Math.floor(clientCount), 1, 60)
  const zoomDays = clamp(Math.floor(sessionZoomDays), 1, 14)
  const preloadSnapshots = Math.max(1, zoomDays * SESSION_SNAPSHOTS_PER_DAY)
  const startTimestampMs = generatedAtMs - zoomDays * DAY_MS
  const clients: InternalClientState[] = []
  let currentSeed = seed >>> 0
  let tick = 0

  for (let index = 0; index < count; index += 1) {
    const built = createClientState(index, currentSeed, startTimestampMs)
    const preloaded = preloadClientHistory(built.state, 0, startTimestampMs, generatedAtMs, preloadSnapshots)
    clients.push(preloaded.client)
    tick = preloaded.tick
    currentSeed = built.seed
  }

  return {
    seed: currentSeed,
    tick,
    generatedAtMs,
    clients,
  }
}

export const tickDashboardSimulation = (
  previous: DashboardSimulationState,
  generatedAtMs: number = Date.now(),
  tickSeconds: number = 3
): DashboardSimulationState => {
  const tick = previous.tick + 1

  return {
    ...previous,
    tick,
    generatedAtMs,
    clients: previous.clients.map((client) => stepClient(client, tick, generatedAtMs, tickSeconds)),
  }
}

export interface DashboardLiveView {
  generatedAtMs: number
  totalClients: number
  watchCount: number
  criticalCount: number
  averageSkillAccuracy: number
  averageBehaviorRate: number
  clients: DashboardClientFeed[]
}

export const toDashboardLiveView = (state: DashboardSimulationState): DashboardLiveView => {
  const clients: DashboardClientFeed[] = state.clients.map((client) => {
    const last = client.points[client.points.length - 1]
    const alertLevel = computeAlertLevel(last.riskScore)

    return {
      clientId: client.clientId,
      moniker: client.moniker,
      ageYears: client.ageYears,
      primaryReinforcer: client.primaryReinforcer,
      alertLevel,
      attentionLabel: computeAttentionLabel(last.riskScore, last.celerationValue),
      points: client.points,
      skillSignals: toSignalSeries(client.skillSignals),
      behaviorSignals: toSignalSeries(client.behaviorSignals),
    }
  })

  const totals = clients.reduce(
    (acc, client) => {
      const last = client.points[client.points.length - 1]
      acc.behaviorRate += last.behaviorRatePerHour
      acc.skillAccuracy += last.skillAccuracyPct
      if (client.alertLevel === 'watch') {
        acc.watch += 1
      }
      if (client.alertLevel === 'critical') {
        acc.critical += 1
      }
      return acc
    },
    { behaviorRate: 0, skillAccuracy: 0, watch: 0, critical: 0 }
  )

  return {
    generatedAtMs: state.generatedAtMs,
    totalClients: clients.length,
    watchCount: totals.watch,
    criticalCount: totals.critical,
    averageSkillAccuracy: clients.length === 0 ? 0 : round(totals.skillAccuracy / clients.length),
    averageBehaviorRate: clients.length === 0 ? 0 : round(totals.behaviorRate / clients.length),
    clients,
  }
}
