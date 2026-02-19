import { useEffect, useMemo, useRef, useState } from 'react'
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

const toStmNotes = (client: DashboardClientFeed): string[] => {
  const latest = client.points[client.points.length - 1]
  return [
    `${client.moniker} behavior rate ${latest.behaviorRatePerHour.toFixed(1)} per hour.`,
    `${client.moniker} skill accuracy ${latest.skillAccuracyPct.toFixed(1)} percent.`,
    `${client.moniker} prompt dependence ${latest.promptDependencePct.toFixed(1)} percent.`,
    `${client.moniker} celeration ${formatCeleration(latest.celerationValue)} per minute.`,
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

export function DashboardPage() {
  const navigate = useNavigate()
  const [clientCount, setClientCount] = useState(14)
  const [sessionZoomDays, setSessionZoomDays] = useState(5)
  const [intervalSeconds, setIntervalSeconds] = useState(1)
  const [signalLines, setSignalLines] = useState(3)
  const [isRunning, setIsRunning] = useState(true)
  const [simulation, setSimulation] = useState(() => createDashboardSimulation(clientCount, Date.now(), Date.now(), 5))
  const [insightsByClient, setInsightsByClient] = useState<Record<string, StmInsight>>({})
  const [isAlertMenuOpen, setIsAlertMenuOpen] = useState(false)
  const [unseenAlertCount, setUnseenAlertCount] = useState(0)
  const [alertInbox, setAlertInbox] = useState<AlertInboxItem[]>([])
  const previousAlertRef = useRef<Record<string, AlertSnapshot>>({})

  const handleClientCountChange = (nextCount: number) => {
    setClientCount(nextCount)
    setSimulation(createDashboardSimulation(nextCount, Date.now(), Date.now(), sessionZoomDays))
    setInsightsByClient({})
    setAlertInbox([])
    setUnseenAlertCount(0)
    previousAlertRef.current = {}
  }

  const handleZoomDaysChange = (nextZoomDays: number) => {
    setSessionZoomDays(nextZoomDays)
    setSimulation(createDashboardSimulation(clientCount, Date.now(), Date.now(), nextZoomDays))
    setInsightsByClient({})
    setAlertInbox([])
    setUnseenAlertCount(0)
    previousAlertRef.current = {}
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
          <p>Calm, real-time visibility into client progress and session trends across the caseload.</p>
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
              <ul>
                {alertInbox.slice(0, 12).map((alert) => (
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
            <option value={1}>1s</option>
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
        <label>
          Clients in View
          <input
            type="range"
            min={8}
            max={28}
            step={1}
            value={clientCount}
            onChange={(event) => handleClientCountChange(Number(event.target.value))}
          />
          <span>{clientCount}</span>
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
            const skillSignals = [...client.skillSignals].sort(byRecentTrial).slice(0, signalLines)

            const behaviorSeries = behaviorSignals.map((signal) => ({
              id: signal.signalId,
              label: signal.label,
              values: signal.history.slice(-36),
              stroke: signal.color,
            }))
            const skillSeries = skillSignals.map((signal) => ({
              id: signal.signalId,
              label: signal.label,
              values: signal.history.slice(-36),
              stroke: signal.color,
            }))
            const noteText = formatAgentNote(client.moniker, insight.summary)

            const celerationText = `${formatCeleration(latest.celerationValue)}/min`
            const celerationClass =
              latest.celerationValue >= 1.08 ? 'risk-high' : latest.celerationValue >= 1 ? 'risk-mid' : 'risk-low'

            return (
              <article key={client.clientId} className={`client-card row-${badgeClassByAlert(client.alertLevel)}`}>
                <header className="client-card-header">
                  <div>
                    <strong>{client.moniker}</strong>
                    <span>
                      {ageBand(client.ageYears)} | {client.primaryReinforcer}
                    </span>
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
                  </div>

                  <aside className="client-card-note">
                    <h4>Clinical Note</h4>
                    <p>{noteText}</p>
                    <span>{insight.source === 'stm-api' ? 'stm-api' : 'heuristic'} | {formatMsAgo(latest.timestampMs)}</span>
                  </aside>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
