import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkline } from '../components/dashboard/Sparkline'
import {
  createDashboardSimulation,
  tickDashboardSimulation,
  toDashboardLiveView,
  type AlertLevel,
  type DashboardClientFeed,
  type DashboardSignalSeries,
} from '../services/dashboardSimulator'
import { fetchStmInsight, deriveHeuristicInsight, type StmInsight } from '../services/stmBridge'
import { streamInboxSuggestion, type InboxSuggestionRequest } from '../services/inboxSuggestionService'
import './DashboardPage.css'

type AlertSnapshot = {
  level: AlertLevel
  riskScore: number
}

type AlertInboxItem = {
  id: string
  clientId: string
  moniker: string
  level: AlertLevel
  summary: string
  attentionLabel: string
  riskScore: number
  timestampMs: number
}

type InboxSummaryStatus = 'idle' | 'streaming' | 'ready' | 'error'

type InboxChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  timestampMs: number
}

const DAY_WINDOW_MS = 86_400_000
const WEEK_WINDOW_MS = DAY_WINDOW_MS * 7
const BEHAVIOR_TREND_WINDOW_DAYS = 7
const FIXED_CLIENT_COUNT = 8

type ReinforcerIconKey =
  | 'token'
  | 'music'
  | 'sensory'
  | 'lego'
  | 'bubbles'
  | 'tablet'
  | 'movement'
  | 'art'
  | 'story'
  | 'snack'
  | 'puzzle'
  | 'trampoline'
  | 'generic'

type ToneTriplet = [number, number, number]

type ClientVisualTheme = {
  background: string
  borderColor: string
  iconBackground: string
  iconColor: string
}

const tonePresets: ReadonlyArray<{ primary: ToneTriplet; secondary: ToneTriplet; border: ToneTriplet }> = [
  { primary: [88, 131, 188], secondary: [118, 171, 148], border: [158, 190, 220] },
  { primary: [101, 143, 181], secondary: [152, 170, 132], border: [171, 199, 213] },
  { primary: [87, 151, 169], secondary: [133, 181, 178], border: [156, 207, 210] },
  { primary: [112, 129, 188], secondary: [152, 160, 207], border: [181, 189, 224] },
  { primary: [98, 138, 170], secondary: [118, 179, 198], border: [168, 201, 219] },
  { primary: [83, 145, 182], secondary: [171, 170, 140], border: [171, 198, 213] },
]

const ageBand = (ageYears: number): string => {
  if (ageYears <= 5) return 'Early Learner'
  if (ageYears <= 8) return 'Child'
  if (ageYears <= 12) return 'Pre-Teen'
  return 'Teen'
}

const formatMsAgo = (timestampMs: number): string => {
  const delta = Math.max(0, Date.now() - timestampMs)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

const formatCeleration = (celerationValue: number): string =>
  celerationValue >= 1 ? `x${celerationValue.toFixed(2)}` : `÷${(1 / Math.max(celerationValue, 0.01)).toFixed(2)}`

const signalDelta = (signal: DashboardSignalSeries): number => {
  if (signal.history.length < 2) {
    return 0
  }
  return signal.history[signal.history.length - 1] - signal.history[signal.history.length - 2]
}

const summarizeSignalSlice = (signals: DashboardSignalSeries[], count: number): string =>
  signals
    .slice(0, count)
    .map((signal) => {
      const delta = signalDelta(signal)
      const direction = Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'rising' : 'decreasing'
      return `${signal.label} ${signal.currentValue.toFixed(1)} (${signal.measureLabel}, ${direction})`
    })
    .join('; ')

const toStmNotes = (client: DashboardClientFeed): string[] => {
  const latest = client.points[client.points.length - 1]
  const prioritizedBehaviors = [...client.behaviorSignals].sort((left, right) => right.lastUpdatedTick - left.lastUpdatedTick)
  const prioritizedSkills = [...client.skillSignals].sort((left, right) => right.lastUpdatedTick - left.lastUpdatedTick)
  const behaviorSnapshot = summarizeSignalSlice(prioritizedBehaviors, 3)
  const skillSnapshot = summarizeSignalSlice(prioritizedSkills, 3)

  return [
    `${client.moniker} behavior composite ${latest.behaviorRatePerHour.toFixed(1)} events per hour over the past week.`,
    `${client.moniker} skill accuracy ${latest.skillAccuracyPct.toFixed(1)}% with prompt dependence ${latest.promptDependencePct.toFixed(1)}%.`,
    `${client.moniker} behavior measures: ${behaviorSnapshot}.`,
    `${client.moniker} active skill set: ${skillSnapshot}.`,
    `${client.moniker} behavior celeration ${formatCeleration(latest.celerationValue)} per week (${latest.celerationDeltaPct.toFixed(1)}% delta, ${latest.celerationInterpretation} trend).`,
  ]
}

const badgeClassByAlert = (alert: DashboardClientFeed['alertLevel']): string => {
  if (alert === 'critical') return 'critical'
  if (alert === 'watch') return 'watch'
  return 'stable'
}

const alertLabelByLevel: Record<AlertLevel, string> = {
  critical: 'review',
  watch: 'monitor',
  stable: 'steady',
}

const byRecentTrial = (left: DashboardSignalSeries, right: DashboardSignalSeries): number =>
  right.lastUpdatedTick - left.lastUpdatedTick

const formatAgentNote = (moniker: string, summary: string): string => {
  const normalizedMoniker = moniker.toLowerCase()
  return summary.toLowerCase().startsWith(normalizedMoniker) ? summary : `${moniker}: ${summary}`
}

const toSameDaySignalHistory = (client: DashboardClientFeed, signal: DashboardSignalSeries): number[] => {
  const latestTimestampMs = client.points[client.points.length - 1]?.timestampMs ?? Date.now()
  const dayStartTimestampMs = latestTimestampMs - DAY_WINDOW_MS
  const sameDayValues = signal.history.filter((_, index) => (client.points[index]?.timestampMs ?? 0) >= dayStartTimestampMs)
  return sameDayValues.length >= 2 ? sameDayValues : signal.history.slice(-12)
}

const toWindowSignalHistory = (
  client: DashboardClientFeed,
  signal: DashboardSignalSeries,
  windowMs: number,
  fallbackPoints: number
): number[] => {
  const latestTimestampMs = client.points[client.points.length - 1]?.timestampMs ?? Date.now()
  const windowStartTimestampMs = latestTimestampMs - windowMs
  const values = signal.history.filter((_, index) => (client.points[index]?.timestampMs ?? 0) >= windowStartTimestampMs)
  return values.length >= 2 ? values : signal.history.slice(-fallbackPoints)
}

const hashClientKey = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const clampChannel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

const shiftTone = (tone: ToneTriplet, shift: number): ToneTriplet => [
  clampChannel(tone[0] + shift),
  clampChannel(tone[1] + shift),
  clampChannel(tone[2] + shift),
]

const toneToRgb = (tone: ToneTriplet): string => `${tone[0]} ${tone[1]} ${tone[2]}`

const toClientVisualTheme = (client: DashboardClientFeed): ClientVisualTheme => {
  const hash = hashClientKey(`${client.clientId}-${client.moniker}-${client.primaryReinforcer}`)
  const preset = tonePresets[hash % tonePresets.length]
  const shift = ((hash >>> 5) % 18) - 9
  const primaryTone = shiftTone(preset.primary, shift)
  const secondaryTone = shiftTone(preset.secondary, shift)
  const borderTone = shiftTone(preset.border, shift)

  return {
    background: `linear-gradient(118deg, rgb(${toneToRgb(primaryTone)} / 0.2), rgb(${toneToRgb(
      secondaryTone
    )} / 0.16) 42%, rgb(255 255 255 / 0.04) 100%)`,
    borderColor: `rgb(${toneToRgb(borderTone)} / 0.34)`,
    iconBackground: `rgb(${toneToRgb(primaryTone)} / 0.3)`,
    iconColor: `rgb(${toneToRgb(borderTone)} / 0.95)`,
  }
}

const normalizeIconKey = (value: string): ReinforcerIconKey => {
  const normalized = value.toLowerCase()
  if (normalized.includes('token')) return 'token'
  if (normalized.includes('music')) return 'music'
  if (normalized.includes('sensory') || normalized.includes('swing')) return 'sensory'
  if (normalized.includes('lego')) return 'lego'
  if (normalized.includes('bubble')) return 'bubbles'
  if (normalized.includes('tablet')) return 'tablet'
  if (normalized.includes('movement')) return 'movement'
  if (normalized.includes('art')) return 'art'
  if (normalized.includes('story')) return 'story'
  if (normalized.includes('snack')) return 'snack'
  if (normalized.includes('puzzle')) return 'puzzle'
  if (normalized.includes('trampoline')) return 'trampoline'
  return 'generic'
}

const toReinforcerIconKey = (client: DashboardClientFeed): ReinforcerIconKey => {
  const monikerParts = client.moniker.split('-')
  const monikerProgram = monikerParts[1] ?? ''
  const fromMoniker = normalizeIconKey(monikerProgram)
  if (fromMoniker !== 'generic') return fromMoniker
  return normalizeIconKey(client.primaryReinforcer)
}

const iconPathByReinforcer: Record<ReinforcerIconKey, ReactNode> = {
  token: (
    <>
      <polygon points="12,2.6 20.4,7.2 20.4,16.8 12,21.4 3.6,16.8 3.6,7.2" />
      <path d="M8.2 12h7.6" />
    </>
  ),
  music: (
    <>
      <path d="M8 5.5v10.5a2.4 2.4 0 1 1-1.8-2.3V7.1l8.8-2v8.9a2.4 2.4 0 1 1-1.8-2.3V5.5L8 6.8" />
    </>
  ),
  sensory: (
    <>
      <path d="M3.2 8.2c2.3-2.4 4.5-2.4 6.8 0s4.5 2.4 6.8 0 4.5-2.4 6.8 0" />
      <path d="M3.2 15.8c2.3-2.4 4.5-2.4 6.8 0s4.5 2.4 6.8 0 4.5-2.4 6.8 0" />
    </>
  ),
  lego: (
    <>
      <rect x="4.1" y="8" width="15.8" height="11.8" rx="2" />
      <rect x="6.6" y="5" width="2.6" height="3" rx="0.7" />
      <rect x="10.7" y="5" width="2.6" height="3" rx="0.7" />
      <rect x="14.8" y="5" width="2.6" height="3" rx="0.7" />
    </>
  ),
  bubbles: (
    <>
      <circle cx="8" cy="14.5" r="4.2" />
      <circle cx="14.6" cy="8.6" r="3" />
      <circle cx="18.6" cy="14.8" r="2.4" />
    </>
  ),
  tablet: (
    <>
      <rect x="6" y="3.6" width="12" height="16.8" rx="2.2" />
      <path d="M10 6.6h4" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  movement: (
    <>
      <path d="M5 14c2.2-2 4.3-2 6.5 0" />
      <path d="M12 14c2.2-2 4.3-2 6.5 0" />
      <path d="M9 10.8l2.2 2.2L9 15.2" />
      <path d="M15 10.8l2.2 2.2-2.2 2.2" />
    </>
  ),
  art: (
    <>
      <path d="M6.3 17.8c0-1.8 1.3-3.2 3-3.2h1.1c1.4 0 2.5-1.2 2.5-2.7 0-3.2-2.5-5.7-5.6-5.7-3.4 0-6.1 2.8-6.1 6.2 0 3.4 2.7 6.2 6.1 6.2h5.9c1.5 0 2.7-1.3 2.7-2.9 0-1.6-1.2-2.9-2.7-2.9-.8 0-1.5.6-1.5 1.4v.3c0 1.5-1.1 2.7-2.5 2.7h-1c-1.1 0-1.9.9-1.9 2z" />
    </>
  ),
  story: (
    <>
      <path d="M5 4.8h8.2a3.3 3.3 0 0 1 3.3 3.3v11.1H8.3A3.3 3.3 0 0 0 5 22.5z" />
      <path d="M8.3 19.2V8.1a3.3 3.3 0 0 0-3.3-3.3H3.5v11.1a3.3 3.3 0 0 0 3.3 3.3h1.5z" />
    </>
  ),
  snack: (
    <>
      <path d="M12 5.2c-2.9 0-5.3 2.4-5.3 5.4 0 4.8 5.3 8.6 5.3 8.6s5.3-3.8 5.3-8.6c0-3-2.4-5.4-5.3-5.4z" />
      <path d="M12 5.2c0-1.4.9-2.4 2.2-2.9" />
    </>
  ),
  puzzle: (
    <>
      <path d="M8.1 4h3.2a2.1 2.1 0 1 1 4.2 0H19a1.7 1.7 0 0 1 1.7 1.7v3.2a2.1 2.1 0 1 0 0 4.2v3.2A1.7 1.7 0 0 1 19 18h-3.2a2.1 2.1 0 1 1-4.2 0H8.1A1.7 1.7 0 0 1 6.4 16.3v-3.2a2.1 2.1 0 1 0 0-4.2V5.7A1.7 1.7 0 0 1 8.1 4z" />
    </>
  ),
  trampoline: (
    <>
      <ellipse cx="12" cy="10.8" rx="6.8" ry="3.3" />
      <path d="M6.8 10.8v6.8M17.2 10.8v6.8M9.4 13.6v4M14.6 13.6v4" />
      <path d="M5.2 18.4h13.6" />
    </>
  ),
  generic: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </>
  ),
}

function ReinforcerIcon({ iconKey }: { iconKey: ReinforcerIconKey }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      {iconPathByReinforcer[iconKey]}
    </svg>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [sessionZoomDays, setSessionZoomDays] = useState(7)
  const [intervalSeconds, setIntervalSeconds] = useState(3)
  const [signalLines, setSignalLines] = useState(3)
  const [isRunning, setIsRunning] = useState(true)
  const [simulation, setSimulation] = useState(() =>
    createDashboardSimulation(FIXED_CLIENT_COUNT, Date.now(), Date.now(), BEHAVIOR_TREND_WINDOW_DAYS)
  )
  const [insightsByClient, setInsightsByClient] = useState<Record<string, StmInsight>>({})
  const [isAlertMenuOpen, setIsAlertMenuOpen] = useState(false)
  const [unseenAlertCount, setUnseenAlertCount] = useState(0)
  const [alertInbox, setAlertInbox] = useState<AlertInboxItem[]>([])
  const [inboxSummaryText, setInboxSummaryText] = useState('Open Inbox to generate a live BCBA caseload summary.')
  const [inboxSummaryStatus, setInboxSummaryStatus] = useState<InboxSummaryStatus>('idle')
  const [inboxSummaryTimestampMs, setInboxSummaryTimestampMs] = useState<number | null>(null)
  const [inboxChatInput, setInboxChatInput] = useState('')
  const [inboxChatMessages, setInboxChatMessages] = useState<InboxChatMessage[]>([])
  const [isInboxChatStreaming, setIsInboxChatStreaming] = useState(false)
  const [expandedNoteClientId, setExpandedNoteClientId] = useState<string | null>(null)
  const previousAlertRef = useRef<Record<string, AlertSnapshot>>({})
  const summaryInFlightRef = useRef(false)

  const handleZoomDaysChange = (nextZoomDays: number) => {
    setSessionZoomDays(nextZoomDays)
    setSimulation(
      createDashboardSimulation(FIXED_CLIENT_COUNT, Date.now(), Date.now(), Math.max(nextZoomDays, BEHAVIOR_TREND_WINDOW_DAYS))
    )
    setInsightsByClient({})
    setAlertInbox([])
    setUnseenAlertCount(0)
    setInboxSummaryText('Open Inbox to generate a live BCBA caseload summary.')
    setInboxSummaryStatus('idle')
    setInboxSummaryTimestampMs(null)
    setInboxChatInput('')
    setInboxChatMessages([])
    setIsInboxChatStreaming(false)
    setExpandedNoteClientId(null)
    previousAlertRef.current = {}
    summaryInFlightRef.current = false
  }

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setSimulation((previous) => tickDashboardSimulation(previous, Date.now(), intervalSeconds))
    }, intervalSeconds * 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [intervalSeconds, isRunning])

  const view = useMemo(() => toDashboardLiveView(simulation), [simulation])

  const rankedClients = useMemo(
    () =>
      [...view.clients].sort((a, b) => {
        const aRisk = a.points[a.points.length - 1]?.riskScore ?? 0
        const bRisk = b.points[b.points.length - 1]?.riskScore ?? 0
        return bRisk - aRisk
      }),
    [view.clients]
  )

  const inboxSummaryPayload = useMemo<InboxSuggestionRequest>(
    () => ({
      summaryScope: 'caseload',
      generatedAtMs: Date.now(),
      totalClients: view.totalClients,
      watchCount: view.watchCount,
      criticalCount: view.criticalCount,
      averageBehaviorRate: view.averageBehaviorRate,
      averageSkillAccuracy: view.averageSkillAccuracy,
      alerts: rankedClients
        .filter((client) => client.alertLevel !== 'stable')
        .slice(0, FIXED_CLIENT_COUNT)
        .map((client) => {
          const latest = client.points[client.points.length - 1]
          return {
            moniker: client.moniker,
            level: client.alertLevel,
            attentionLabel: client.attentionLabel,
            riskScore: latest.riskScore,
            behaviorRatePerHour: latest.behaviorRatePerHour,
            skillAccuracyPct: latest.skillAccuracyPct,
            promptDependencePct: latest.promptDependencePct,
            celerationValue: latest.celerationValue,
            celerationDeltaPct: latest.celerationDeltaPct,
            celerationPeriod: latest.celerationPeriod,
            celerationInterpretation: latest.celerationInterpretation,
          }
        }),
      clients: rankedClients.slice(0, FIXED_CLIENT_COUNT).map((client) => {
        const latest = client.points[client.points.length - 1]
        return {
          moniker: client.moniker,
          level: client.alertLevel,
          attentionLabel: client.attentionLabel,
          riskScore: latest.riskScore,
          behaviorRatePerHour: latest.behaviorRatePerHour,
          skillAccuracyPct: latest.skillAccuracyPct,
          promptDependencePct: latest.promptDependencePct,
          celerationValue: latest.celerationValue,
          celerationDeltaPct: latest.celerationDeltaPct,
          celerationPeriod: latest.celerationPeriod,
          celerationInterpretation: latest.celerationInterpretation,
        }
      }),
    }),
    [rankedClients, view.averageBehaviorRate, view.averageSkillAccuracy, view.criticalCount, view.totalClients, view.watchCount]
  )

  const streamInboxSummary = useCallback(async () => {
    if (summaryInFlightRef.current) {
      return
    }

    summaryInFlightRef.current = true
    setInboxSummaryStatus('streaming')
    setInboxSummaryText('Synthesizing caseload snapshot...')

    let summaryText = ''

    try {
      await streamInboxSuggestion(inboxSummaryPayload, (chunk) => {
        summaryText += chunk
        const next = summaryText.trim()
        if (next) {
          setInboxSummaryText(next)
        }
      })

      const finalText = summaryText.trim()
      if (!finalText) {
        throw new Error('Empty stream result')
      }

      setInboxSummaryText(finalText)
      setInboxSummaryStatus('ready')
      setInboxSummaryTimestampMs(Date.now())
    } catch {
      setInboxSummaryStatus('error')
      setInboxSummaryText('Unable to generate GPT caseload summary. Review alert feed and try opening Inbox again.')
    } finally {
      summaryInFlightRef.current = false
    }
  }, [inboxSummaryPayload])

  const handleInboxChatSend = useCallback(async () => {
    const message = inboxChatInput.trim()
    if (!message || isInboxChatStreaming) {
      return
    }

    const userMessage: InboxChatMessage = {
      id: `chat-user-${Date.now()}`,
      role: 'user',
      text: message,
      timestampMs: Date.now(),
    }
    const assistantMessageId = `chat-assistant-${Date.now()}`
    const priorTurns = inboxChatMessages.slice(-6).map((turn) => ({ role: turn.role, text: turn.text }))

    setInboxChatInput('')
    setIsInboxChatStreaming(true)
    setInboxChatMessages((previous) => [
      ...previous,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        text: 'Thinking through the caseload context...',
        timestampMs: Date.now(),
      },
    ])

    let assistantText = ''

    try {
      await streamInboxSuggestion(
        {
          ...inboxSummaryPayload,
          summaryScope: 'chat',
          message,
          currentSummary: inboxSummaryText,
          recentMessages: priorTurns,
        },
        (chunk) => {
          assistantText += chunk
          const nextText = assistantText.trim()
          if (!nextText) {
            return
          }
          setInboxChatMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId
                ? { ...item, text: nextText }
                : item
            )
          )
        }
      )
    } catch {
      setInboxChatMessages((previous) =>
        previous.map((item) =>
          item.id === assistantMessageId
            ? { ...item, text: 'Unable to stream reply right now. Please try again in a moment.' }
            : item
        )
      )
    } finally {
      setIsInboxChatStreaming(false)
    }
  }, [inboxChatInput, inboxChatMessages, inboxSummaryPayload, inboxSummaryText, isInboxChatStreaming])

  useEffect(() => {
    if (simulation.tick === 0 || simulation.tick % 4 !== 0) {
      return
    }

    const focusClients = rankedClients.slice(0, 3)
    if (focusClients.length === 0) {
      return
    }

    let cancelled = false

    const enrich = async () => {
      const updates = await Promise.all(
        focusClients.map(async (client) => {
          const latest = client.points[client.points.length - 1]
          const baseInput = {
            clientId: client.clientId,
            moniker: client.moniker,
            notes: toStmNotes(client),
            behaviorRatePerHour: latest.behaviorRatePerHour,
            skillAccuracyPct: latest.skillAccuracyPct,
            promptDependencePct: latest.promptDependencePct,
            celerationDeltaPct: latest.celerationDeltaPct,
          }

          const insight = await fetchStmInsight(baseInput)
          return { clientId: client.clientId, insight }
        })
      )

      if (cancelled) {
        return
      }

      setInsightsByClient((previous) => {
        const next = { ...previous }
        updates.forEach(({ clientId, insight }) => {
          next[clientId] = insight
        })
        return next
      })
    }

    void enrich()

    return () => {
      cancelled = true
    }
  }, [rankedClients, simulation.tick])

  useEffect(() => {
    const inboxUpdates: AlertInboxItem[] = []

    rankedClients.forEach((client) => {
      const latest = client.points[client.points.length - 1]
      const previous = previousAlertRef.current[client.clientId]
      const level = client.alertLevel

      const escalated =
        !previous
          ? level !== 'stable'
          : (previous.level === 'stable' && level !== 'stable') ||
            (previous.level === 'watch' && level === 'critical')

      const riskJump = previous ? latest.riskScore - previous.riskScore >= 8 && level !== 'stable' : false

      if (level !== 'stable' && (escalated || riskJump)) {
        const fallbackInsight = deriveHeuristicInsight({
          clientId: client.clientId,
          moniker: client.moniker,
          notes: toStmNotes(client),
          behaviorRatePerHour: latest.behaviorRatePerHour,
          skillAccuracyPct: latest.skillAccuracyPct,
          promptDependencePct: latest.promptDependencePct,
          celerationDeltaPct: latest.celerationDeltaPct,
        })
        const insight = insightsByClient[client.clientId] ?? fallbackInsight

        inboxUpdates.push({
          id: `${client.clientId}-${simulation.tick}-${level}`,
          clientId: client.clientId,
          moniker: client.moniker,
          level,
          summary: insight.summary,
          attentionLabel: client.attentionLabel,
          riskScore: latest.riskScore,
          timestampMs: latest.timestampMs,
        })
      }

      previousAlertRef.current[client.clientId] = {
        level,
        riskScore: latest.riskScore,
      }
    })

    if (inboxUpdates.length > 0) {
      const timeoutId = window.setTimeout(() => {
        setAlertInbox((previous) => [...inboxUpdates, ...previous].slice(0, 48))
        if (!isAlertMenuOpen) {
          setUnseenAlertCount((previous) => previous + inboxUpdates.length)
        }
      }, 0)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }

    return undefined
  }, [insightsByClient, isAlertMenuOpen, rankedClients, simulation.tick])

  const stmStatus = useMemo(() => {
    const values = Object.values(insightsByClient)
    if (values.length === 0) {
      return 'warming'
    }
    const apiCount = values.filter((insight) => insight.source === 'stm-api').length
    return apiCount > 0 ? 'connected' : 'fallback'
  }, [insightsByClient])

  const handleAlertToggle = () => {
    setIsAlertMenuOpen((previous) => {
      const next = !previous
      if (next) {
        if (unseenAlertCount >= 3 || inboxSummaryStatus === 'idle') {
          void streamInboxSummary()
        }
        setUnseenAlertCount(0)
      }
      return next
    })
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-title-block">
          <p className="dashboard-kicker">Agents of ABA</p>
          <h1>Clinical Session Overview</h1>
        </div>

        <div className="dashboard-header-center">
          <button
            type="button"
            className={`alert-dropdown-toggle ${unseenAlertCount > 0 ? 'ping' : ''}`}
            onClick={handleAlertToggle}
            aria-expanded={isAlertMenuOpen}
          >
            Inbox
            <span className="alert-pill">{unseenAlertCount > 99 ? '99+' : unseenAlertCount}</span>
          </button>
          <span className="alert-summary-text">
            {view.totalClients} active | {view.watchCount} monitor | {view.criticalCount} review
          </span>

          {isAlertMenuOpen ? (
            <div className="alert-dropdown-menu" role="region" aria-label="Recent alerts">
              <section className="inbox-summary-card" aria-live="polite">
                <header>
                  <strong>Caseload Summary</strong>
                  <span>{inboxSummaryStatus === 'streaming' ? 'gpt-5 streaming' : 'gpt-5'}</span>
                </header>
                <p>{inboxSummaryText}</p>
                <footer>
                  <span>{view.totalClients} clients in view</span>
                  <span>{inboxSummaryTimestampMs ? formatMsAgo(inboxSummaryTimestampMs) : 'not generated yet'}</span>
                </footer>
              </section>

              <ul>
                {alertInbox.slice(0, 8).map((alert) => (
                  <li key={alert.id} className={badgeClassByAlert(alert.level)}>
                    <header>
                      <strong>{alert.moniker}</strong>
                      <span>{alert.riskScore.toFixed(1)} signal</span>
                    </header>
                    <p>{alert.summary}</p>
                    <footer>
                      <span>{alert.attentionLabel}</span>
                      <span>{formatMsAgo(alert.timestampMs)}</span>
                    </footer>
                  </li>
                ))}
                {alertInbox.length === 0 ? (
                  <li className="stable empty-alert-item">
                    <p>No new items right now.</p>
                  </li>
                ) : null}
              </ul>

              <div className="inbox-chat-shell">
                <div className="inbox-chat-log" aria-label="Inbox chat">
                  {inboxChatMessages.length === 0 ? (
                    <p className="chat-empty">Ask for a drill-down, protocol suggestion, or next-session focus.</p>
                  ) : (
                    inboxChatMessages.slice(-6).map((message) => (
                      <article key={message.id} className={`chat-message ${message.role}`}>
                        <span>{message.role === 'assistant' ? 'Agent' : 'You'}</span>
                        <p>{message.text}</p>
                      </article>
                    ))
                  )}
                </div>
                <div className="inbox-chat-compose">
                  <input
                    id="inbox-chat-input"
                    name="inbox-chat-input"
                    type="text"
                    placeholder="Ask the inbox agent..."
                    value={inboxChatInput}
                    onChange={(event) => setInboxChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleInboxChatSend()
                      }
                    }}
                  />
                  <button type="button" onClick={() => void handleInboxChatSend()} disabled={isInboxChatStreaming}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="dashboard-header-actions">
          <span className="demo-pill">Demo</span>
          <span className={`stm-pill ${stmStatus}`}>STM {stmStatus === 'connected' ? 'Connected' : stmStatus === 'fallback' ? 'Fallback' : 'Warming'}</span>
          <button type="button" className="back-button" onClick={() => navigate('/demo')}>
            Back to Demo
          </button>
        </div>
      </header>

      <section className="dashboard-controls" aria-label="Dashboard controls">
        <label>
          Refresh
          <select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))}>
            <option value={2}>2s</option>
            <option value={3}>3s</option>
            <option value={4}>4s</option>
            <option value={5}>5s</option>
            <option value={8}>8s</option>
            <option value={10}>10s</option>
          </select>
        </label>
        <label>
          Lines per Chart
          <select value={signalLines} onChange={(event) => setSignalLines(Number(event.target.value))}>
            <option value={2}>2 lines</option>
            <option value={3}>3 lines</option>
            <option value={4}>4 lines</option>
          </select>
        </label>
        <label>
          History Window
          <select value={sessionZoomDays} onChange={(event) => handleZoomDaysChange(Number(event.target.value))}>
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>7 days</option>
          </select>
        </label>
        <button type="button" className="run-toggle" onClick={() => setIsRunning((previous) => !previous)}>
          {isRunning ? 'Pause Updates' : 'Resume Updates'}
        </button>
      </section>

      <section className="dashboard-metrics" aria-label="Live summary metrics">
        <article>
          <h3>Clients Online</h3>
          <p>{view.totalClients}</p>
          <span>Demo stream active</span>
        </article>
        <article>
          <h3>Monitor + Review</h3>
          <p>{view.watchCount + view.criticalCount}</p>
          <span>{view.criticalCount} clients to review</span>
        </article>
        <article>
          <h3>Avg Skill Accuracy</h3>
          <p>{view.averageSkillAccuracy.toFixed(1)}%</p>
          <span>Across active clients</span>
        </article>
        <article>
          <h3>Avg Behavior Rate</h3>
          <p>{view.averageBehaviorRate.toFixed(1)}/hr</p>
          <span>Across active clients</span>
        </article>
      </section>

      <div className="dashboard-body">
        <section className="dashboard-client-grid" aria-label="Client trend board">
          {rankedClients.map((client) => {
            const latest = client.points[client.points.length - 1]
            const fallbackInsight = deriveHeuristicInsight({
              clientId: client.clientId,
              moniker: client.moniker,
              notes: toStmNotes(client),
              behaviorRatePerHour: latest.behaviorRatePerHour,
              skillAccuracyPct: latest.skillAccuracyPct,
              promptDependencePct: latest.promptDependencePct,
              celerationDeltaPct: latest.celerationDeltaPct,
            })
            const insight = insightsByClient[client.clientId] ?? fallbackInsight

            const behaviorSignals = [...client.behaviorSignals].sort(byRecentTrial).slice(0, signalLines)
            const rankedSkillSignals = [...client.skillSignals].sort(byRecentTrial)
            const skillSignals = rankedSkillSignals.slice(0, signalLines)
            const lastRunSkillSignal = rankedSkillSignals[0]

            const behaviorSeries = behaviorSignals.map((signal) => ({
              id: signal.signalId,
              label: signal.label,
              values: toWindowSignalHistory(client, signal, WEEK_WINDOW_MS, 84),
              stroke: signal.color,
            }))
            const skillSeries = skillSignals.map((signal) => ({
              id: signal.signalId,
              label: signal.label,
              values: signal.history.slice(-36),
              stroke: signal.color,
            }))
            const lastRunSkillSeries = lastRunSkillSignal
              ? [
                  {
                    id: `last-run-${lastRunSkillSignal.signalId}`,
                    label: lastRunSkillSignal.label,
                    values: toSameDaySignalHistory(client, lastRunSkillSignal),
                    stroke: lastRunSkillSignal.color,
                  },
                ]
              : []
            const noteText = formatAgentNote(client.moniker, insight.summary)
            const noteMeta = `${insight.source === 'stm-api' ? 'stm-api' : 'heuristic'} | ${formatMsAgo(latest.timestampMs)}`
            const isNoteExpanded = expandedNoteClientId === client.clientId
            const iconKey = toReinforcerIconKey(client)
            const visualTheme = toClientVisualTheme(client)
            const cardStyle: CSSProperties = {
              background: visualTheme.background,
              borderColor: visualTheme.borderColor,
            }
            const iconStyle: CSSProperties = {
              background: visualTheme.iconBackground,
              color: visualTheme.iconColor,
              borderColor: visualTheme.borderColor,
            }

            const celerationText = `${formatCeleration(latest.celerationValue)}/wk`
            const celerationClass =
              latest.celerationInterpretation === 'worsening'
                ? 'risk-high'
                : latest.celerationInterpretation === 'improving'
                  ? 'risk-low'
                  : 'risk-mid'

            return (
              <article
                key={client.clientId}
                className={`client-card row-${badgeClassByAlert(client.alertLevel)}`}
                style={cardStyle}
              >
                <header className="client-card-header">
                  <div className="client-identity">
                    <span className="client-icon-badge" style={iconStyle}>
                      <ReinforcerIcon iconKey={iconKey} />
                    </span>
                    <div>
                      <strong>{client.moniker}</strong>
                      <span>
                        {ageBand(client.ageYears)} | {client.primaryReinforcer}
                      </span>
                    </div>
                  </div>
                  <div className="client-card-badges">
                    <em className={`alert-badge ${badgeClassByAlert(client.alertLevel)}`}>
                      {alertLabelByLevel[client.alertLevel]}
                    </em>
                    <span className={`celeration-pill ${celerationClass}`}>{celerationText}</span>
                  </div>
                </header>

                <div className="client-card-main">
                  <div className="client-signal-grid">
                    <div className="metric-block compact">
                      <p className="signal-title">Behavior Trends</p>
                      <span>{latest.behaviorRatePerHour.toFixed(1)}/hr</span>
                      <Sparkline
                        className="multi-sparkline"
                        series={behaviorSeries}
                        threshold={6}
                        showLegend
                        legendMaxItems={signalLines}
                        ariaLabel="Behavior trend signals"
                      />
                    </div>
                    <div className="metric-block compact">
                      <p className="signal-title">Skill Trends</p>
                      <span>{latest.skillAccuracyPct.toFixed(1)}%</span>
                      <Sparkline
                        className="multi-sparkline"
                        series={skillSeries}
                        threshold={72}
                        showLegend
                        legendMaxItems={signalLines}
                        ariaLabel="Skill trend signals"
                      />
                    </div>
                    <div className="metric-block compact">
                      <p className="signal-title">Last Run Skill</p>
                      <span>{lastRunSkillSignal ? `${lastRunSkillSignal.currentValue.toFixed(1)}%` : '--'}</span>
                      <Sparkline
                        className="multi-sparkline"
                        series={lastRunSkillSeries}
                        threshold={72}
                        showLegend
                        legendMaxItems={1}
                        ariaLabel="Last run skill same-day trend"
                      />
                    </div>
                  </div>

                  <div className="client-card-note-shell">
                    <aside className={`client-card-note ${isNoteExpanded ? 'expanded' : ''}`}>
                      <p>{noteText}</p>
                      <span>{noteMeta}</span>
                    </aside>
                    <button
                      type="button"
                      className={`client-card-note-toggle ${isNoteExpanded ? 'expanded' : ''} ${
                        !isNoteExpanded && client.alertLevel !== 'stable' ? 'pulse' : ''
                      }`}
                      aria-expanded={isNoteExpanded}
                      aria-label={isNoteExpanded ? 'Close clinical note' : 'Open clinical note'}
                      onClick={() =>
                        setExpandedNoteClientId((previous) => (previous === client.clientId ? null : client.clientId))
                      }
                    >
                      <span className="open-rail-label">OPEN</span>
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
