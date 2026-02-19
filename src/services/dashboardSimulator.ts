export type AlertLevel = 'stable' | 'watch' | 'critical'

export interface DashboardPoint {
  timestampMs: number
  behaviorRatePerHour: number
  skillAccuracyPct: number
  promptDependencePct: number
  celerationDeltaPct: number
  riskScore: number
}

export interface DashboardClientFeed {
  clientId: string
  moniker: string
  ageYears: number
  primaryReinforcer: string
  alertLevel: AlertLevel
  attentionLabel: string
  points: DashboardPoint[]
}

export interface DashboardSimulationState {
  seed: number
  tick: number
  generatedAtMs: number
  clients: InternalClientState[]
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
  points: DashboardPoint[]
}

const HISTORY_LIMIT = 42

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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const round = (value: number): number => Number(value.toFixed(2))

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
  const ageBand = ageYears <= 5 ? ageTags[0] : ageYears <= 8 ? ageTags[1] : ageYears <= 11 ? ageTags[2] : ageYears <= 14 ? ageTags[3] : ageYears <= 16 ? ageTags[4] : ageTags[5]
  const reinforcerNoun = reinforcer.split(' ')[0]
  const suffix = Math.floor(raw * 90 + 10)
  return `${ageBand}-${reinforcerNoun}-${suffix}`
}

const computeCelerationDelta = (points: DashboardPoint[]): number => {
  if (points.length < 10) {
    return 0
  }
  const recent = points.slice(-5)
  const prior = points.slice(-10, -5)
  const recentMean = recent.reduce((sum, point) => sum + point.behaviorRatePerHour, 0) / recent.length
  const priorMean = prior.reduce((sum, point) => sum + point.behaviorRatePerHour, 0) / prior.length

  if (priorMean === 0) {
    return 0
  }

  return ((recentMean - priorMean) / priorMean) * 100
}

const computeAttentionLabel = (riskScore: number, celerationDeltaPct: number): string => {
  if (riskScore >= 78) {
    return celerationDeltaPct > 0 ? 'Escalating quickly' : 'High concern'
  }
  if (riskScore >= 58) {
    return celerationDeltaPct > 8 ? 'Shift in baseline' : 'Needs watch'
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
  celerationDeltaPct: 0,
  riskScore: 0,
})

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
  const volatility = 0.5 + volRand.value * 1.8

  const phaseRand = randFromSeed(currentSeed)
  currentSeed = phaseRand.seed
  const phase = 0.2 + phaseRand.value * 1.8

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
      points: [initialPoint],
    },
    seed: currentSeed,
  }
}

const stepClient = (client: InternalClientState, tick: number, generatedAtMs: number): InternalClientState => {
  let seed = client.seed

  const noiseA = randFromSeed(seed)
  seed = noiseA.seed
  const noiseB = randFromSeed(seed)
  seed = noiseB.seed
  const spikeRand = randFromSeed(seed)
  seed = spikeRand.seed

  const oscillation = Math.sin((tick / 8) * client.phase) + Math.cos((tick / 11) * (client.phase + 0.25)) * 0.7
  const randomShock = (noiseA.value - 0.5) * 2.5 * client.volatility
  const spike = spikeRand.value > 0.965 ? 4 + spikeRand.value * 8 : 0

  const behaviorRate = clamp(client.behaviorBaseline + oscillation * client.volatility + randomShock + spike, 0.2, 20)

  const skillDrift = Math.sin((tick / 10) * (client.phase * 0.75)) * 5.5 + (0.5 - noiseB.value) * 6
  const skillAccuracy = clamp(client.skillBaseline - behaviorRate * 0.9 + skillDrift, 25, 99)

  const promptDrift = Math.cos((tick / 7) * client.phase) * 4 + behaviorRate * 1.75 + (noiseA.value - 0.5) * 6
  const promptDependence = clamp(client.promptBaseline + promptDrift - skillAccuracy * 0.28, 5, 96)

  const nextPoint = makeInitialPoint(generatedAtMs, round(behaviorRate), round(skillAccuracy), round(promptDependence))

  const points = [...client.points, nextPoint].slice(-HISTORY_LIMIT)
  const celerationDeltaPct = computeCelerationDelta(points)
  const riskScore = clamp(
    22 + nextPoint.behaviorRatePerHour * 4.5 + (100 - nextPoint.skillAccuracyPct) * 0.55 + nextPoint.promptDependencePct * 0.35 + Math.max(0, celerationDeltaPct) * 1.2,
    0,
    100
  )

  points[points.length - 1] = {
    ...nextPoint,
    celerationDeltaPct: round(celerationDeltaPct),
    riskScore: round(riskScore),
  }

  return {
    ...client,
    seed,
    points,
  }
}

export const createDashboardSimulation = (
  clientCount: number,
  seed: number = Date.now(),
  generatedAtMs: number = Date.now()
): DashboardSimulationState => {
  const count = clamp(Math.floor(clientCount), 1, 60)
  const clients: InternalClientState[] = []
  let currentSeed = seed >>> 0

  for (let index = 0; index < count; index += 1) {
    const built = createClientState(index, currentSeed, generatedAtMs)
    clients.push(built.state)
    currentSeed = built.seed
  }

  return {
    seed: currentSeed,
    tick: 0,
    generatedAtMs,
    clients,
  }
}

export const tickDashboardSimulation = (
  previous: DashboardSimulationState,
  generatedAtMs: number = Date.now()
): DashboardSimulationState => {
  const tick = previous.tick + 1

  return {
    ...previous,
    tick,
    generatedAtMs,
    clients: previous.clients.map((client) => stepClient(client, tick, generatedAtMs)),
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
      attentionLabel: computeAttentionLabel(last.riskScore, last.celerationDeltaPct),
      points: client.points,
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
