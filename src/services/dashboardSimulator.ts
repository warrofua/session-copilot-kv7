export type AlertLevel = 'stable' | 'watch' | 'critical'

export interface DashboardPoint {
  timestampMs: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationValue: number
  celerationDeltaPct: number
  riskScore: number
}

export interface DashboardSignalSeries {
  signalId: string
  label: string
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
  points: DashboardPoint[]
  skillSignals: InternalSignalState[]
  behaviorSignals: InternalSignalState[]
}

type SignalCatalogEntry = {
  signalId: string
  label: string
  color: string
}

const HISTORY_LIMIT = 42
const CELERATION_WINDOW_POINTS = 12
const CELERATION_MIN_POINTS = 8
const CELERATION_PERIOD_MS = 60_000
const DAY_MS = 86_400_000
const DEFAULT_SESSION_ZOOM_DAYS = 5
const SESSION_SNAPSHOTS_PER_DAY = 12
const PRELOAD_TICK_SECONDS = 15

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

const ageTags = ['Tiny', 'Junior', 'Prime', 'Teen', 'Navigator', 'Anchor']

const skillCatalog: SignalCatalogEntry[] = [
  { signalId: 'receptive-id', label: 'Receptive ID', color: '#63b3ed' },
  { signalId: 'manding', label: 'Manding', color: '#4fd1c5' },
  { signalId: 'imitation', label: 'Imitation', color: '#68d391' },
  { signalId: 'intraverbal', label: 'Intraverbal', color: '#f6ad55' },
  { signalId: 'listener-response', label: 'Listener Resp', color: '#f687b3' },
]

const behaviorCatalog: SignalCatalogEntry[] = [
  { signalId: 'aggression', label: 'Aggression', color: '#fc8181' },
  { signalId: 'elopement', label: 'Elopement', color: '#f6ad55' },
  { signalId: 'sib', label: 'SIB', color: '#f687b3' },
  { signalId: 'tantrum', label: 'Tantrum', color: '#f56565' },
  { signalId: 'refusal', label: 'Refusal', color: '#90cdf4' },
]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const round = (value: number): number => Number(value.toFixed(2))

const smoothToward = (previous: number, target: number, alpha: number, maxDelta: number): number => {
  const blended = previous + (target - previous) * alpha
  return clamp(blended, previous - maxDelta, previous + maxDelta)
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

const buildMoniker = (ageYears: number, reinforcer: string, raw: number): string => {
  const ageBand =
    ageYears <= 5
      ? ageTags[0]
      : ageYears <= 8
        ? ageTags[1]
        : ageYears <= 11
          ? ageTags[2]
          : ageYears <= 14
            ? ageTags[3]
            : ageYears <= 16
              ? ageTags[4]
              : ageTags[5]
  const reinforcerNoun = reinforcer.split(' ')[0]
  const suffix = Math.floor(raw * 90 + 10)
  return `${ageBand}-${reinforcerNoun}-${suffix}`
}

const computeCelerationMetrics = (points: DashboardPoint[]): { celerationValue: number; celerationDeltaPct: number } => {
  if (points.length < CELERATION_MIN_POINTS) {
    return { celerationValue: 1, celerationDeltaPct: 0 }
  }

  const window = points.slice(-CELERATION_WINDOW_POINTS)
  const startTimestampMs = window[0]?.timestampMs ?? 0

  const transformed = window.map((point) => ({
    x: (point.timestampMs - startTimestampMs) / CELERATION_PERIOD_MS,
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
  const celerationValue = clamp(10 ** slope, 0.2, 5)
  const celerationDeltaPct = (celerationValue - 1) * 100

  return { celerationValue, celerationDeltaPct }
}

const computeAttentionLabel = (riskScore: number, celerationValue: number): string => {
  if (riskScore >= 78) {
    if (celerationValue >= 1.08) {
      return 'Escalating quickly'
    }
    if (celerationValue <= 0.93) {
      return 'Decelerating'
    }
    return 'High concern'
  }
  if (riskScore >= 58) {
    return celerationValue >= 1.04 ? 'Shift in baseline' : 'Needs watch'
  }
  return 'Within expected variance'
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
  const moniker = buildMoniker(ageYears, reinforcer, monikerRand.value)

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
  activationThreshold: number
): { signals: InternalSignalState[]; seed: number } => {
  let currentSeed = seed

  const gateRand = randFromSeed(currentSeed)
  currentSeed = gateRand.seed
  const indexRand = randFromSeed(currentSeed)
  currentSeed = indexRand.seed

  const hasPrimaryUpdate = gateRand.value > activationThreshold
  const primaryIndex = Math.floor(indexRand.value * signals.length) % signals.length

  const nextSignals = signals.map((signal, index) => {
    const noiseA = randFromSeed(currentSeed)
    currentSeed = noiseA.seed
    const noiseB = randFromSeed(currentSeed)
    currentSeed = noiseB.seed

    const isPrimary = hasPrimaryUpdate && index === primaryIndex
    const trendDrift = (noiseA.value - 0.5) * (isPrimary ? 0.08 : 0.03) * cadenceFactor
    const nextTrend = clamp(signal.trend * 0.94 + trendDrift, -1.2, 1.2)

    const reversion = (signal.baseline - signal.value) * (isPrimary ? 0.08 : 0.04)
    const noise = (noiseB.value - 0.5) * (isPrimary ? 1.4 : 0.45) * cadenceFactor
    const target = clamp(signal.value + nextTrend * 0.45 + reversion + noise, signal.min, signal.max)

    const alpha = (isPrimary ? 0.22 : 0.14) * cadenceFactor
    const maxDelta = (isPrimary ? 0.95 : 0.35) * cadenceFactor
    const value = round(smoothToward(signal.value, target, alpha, maxDelta))

    const history = [...signal.history, value].slice(-HISTORY_LIMIT)

    return {
      ...signal,
      trend: nextTrend,
      value,
      lastUpdatedTick: isPrimary ? tick : signal.lastUpdatedTick,
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
  const cadenceFactor = clamp(tickSeconds / 12, 0.25, 1.2)

  const skillsUpdate = stepSignalGroup(client.skillSignals, tick, seed, cadenceFactor, 0.34)
  seed = skillsUpdate.seed

  const behaviorsUpdate = stepSignalGroup(client.behaviorSignals, tick, seed, cadenceFactor, 0.45)
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

  const skillTarget = clamp(
    previousPoint.skillAccuracyPct +
      (skillComposite - previousPoint.skillAccuracyPct) * 0.15 +
      (client.skillBaseline - previousPoint.skillAccuracyPct) * 0.03 +
      skillTrend -
      behaviorRate * 0.06 +
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

  const promptTarget = clamp(
    previousPoint.promptDependencePct +
      (client.promptBaseline - previousPoint.promptDependencePct) * 0.04 +
      promptTrend +
      behaviorRate * 0.18 -
      skillAccuracy * 0.09 +
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

  const nextPoint = makeInitialPoint(generatedAtMs, round(behaviorRate), round(skillAccuracy), round(promptDependence))

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
    riskScore: round(riskScore),
  }

  return {
    ...client,
    seed,
    behaviorTrend,
    skillTrend,
    promptTrend,
    trendTicksRemaining,
    points,
    skillSignals: skillsUpdate.signals,
    behaviorSignals: behaviorsUpdate.signals,
  }
}

const toSignalSeries = (signals: InternalSignalState[]): DashboardSignalSeries[] =>
  signals.map((signal) => ({
    signalId: signal.signalId,
    label: signal.label,
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
  tickSeconds: number = 15
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
