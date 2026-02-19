import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkline } from '../components/dashboard/Sparkline'
import {
  createDashboardSimulation,
  tickDashboardSimulation,
  toDashboardLiveView,
  type DashboardClientFeed,
} from '../services/dashboardSimulator'
import { fetchStmInsight, deriveHeuristicInsight, type StmInsight } from '../services/stmBridge'
import './DashboardPage.css'

type ChartMode = 'frequency' | 'celeration'

const chartModeLabels: Record<ChartMode, string> = {
  frequency: 'Rate Trends',
  celeration: 'Celeration Focus',
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

const toStmNotes = (client: DashboardClientFeed): string[] => {
  const latest = client.points[client.points.length - 1]
  return [
    `${client.moniker} behavior rate ${latest.behaviorRatePerHour.toFixed(1)} per hour.`,
    `${client.moniker} skill accuracy ${latest.skillAccuracyPct.toFixed(1)} percent.`,
    `${client.moniker} prompt dependence ${latest.promptDependencePct.toFixed(1)} percent.`,
    `${client.moniker} celeration shift ${latest.celerationDeltaPct.toFixed(1)} percent.`,
  ]
}

const badgeClassByAlert = (alert: DashboardClientFeed['alertLevel']): string => {
  if (alert === 'critical') return 'critical'
  if (alert === 'watch') return 'watch'
  return 'stable'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [clientCount, setClientCount] = useState(14)
  const [intervalSeconds, setIntervalSeconds] = useState(15)
  const [chartMode, setChartMode] = useState<ChartMode>('frequency')
  const [isRunning, setIsRunning] = useState(true)
  const [simulation, setSimulation] = useState(() => createDashboardSimulation(clientCount, Date.now()))
  const [insightsByClient, setInsightsByClient] = useState<Record<string, StmInsight>>({})

  const handleClientCountChange = (nextCount: number) => {
    setClientCount(nextCount)
    setSimulation(createDashboardSimulation(nextCount, Date.now()))
    setInsightsByClient({})
  }

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setSimulation((previous) => tickDashboardSimulation(previous, Date.now()))
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

  const alertFeed = useMemo(
    () =>
      rankedClients.slice(0, 5).map((client) => {
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
        return {
          client,
          latest,
          insight,
        }
      }),
    [insightsByClient, rankedClients]
  )

  const stmStatus = useMemo(() => {
    const values = Object.values(insightsByClient)
    if (values.length === 0) {
      return 'warming'
    }
    const apiCount = values.filter((insight) => insight.source === 'stm-api').length
    return apiCount > 0 ? 'connected' : 'fallback'
  }, [insightsByClient])

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-title-block">
          <p className="dashboard-kicker">Agents of ABA</p>
          <h1>BCBA Real-Time Monitor</h1>
          <p>Live multi-client view for clinical trend detection with agent-assisted signal triage.</p>
        </div>
        <div className="dashboard-header-actions">
          <span className="demo-pill">DEMO STREAM</span>
          <span className={`stm-pill ${stmStatus}`}>STM {stmStatus.toUpperCase()}</span>
          <button type="button" className="back-button" onClick={() => navigate('/demo')}>
            Back to Demo
          </button>
        </div>
      </header>

      <section className="dashboard-controls" aria-label="Dashboard controls">
        <label>
          Update Interval
          <select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))}>
            <option value={15}>15s</option>
            <option value={20}>20s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>
        </label>
        <label>
          Chart Mode
          <select value={chartMode} onChange={(event) => setChartMode(event.target.value as ChartMode)}>
            <option value="frequency">Rate Trends</option>
            <option value="celeration">Celeration Focus</option>
          </select>
        </label>
        <label>
          Simulated Clients
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
          {isRunning ? 'Pause Stream' : 'Resume Stream'}
        </button>
      </section>

      <section className="dashboard-metrics" aria-label="Live summary metrics">
        <article>
          <h3>Clients Online</h3>
          <p>{view.totalClients}</p>
          <span>Simulated feed active</span>
        </article>
        <article>
          <h3>Watch + Critical</h3>
          <p>{view.watchCount + view.criticalCount}</p>
          <span>{view.criticalCount} critical signals</span>
        </article>
        <article>
          <h3>Avg Skill Accuracy</h3>
          <p>{view.averageSkillAccuracy.toFixed(1)}%</p>
          <span>Across active panel</span>
        </article>
        <article>
          <h3>Avg Behavior Rate</h3>
          <p>{view.averageBehaviorRate.toFixed(1)}/hr</p>
          <span>{chartModeLabels[chartMode]}</span>
        </article>
      </section>

      <div className="dashboard-body">
        <section className="dashboard-table-wrap" aria-label="Client trend board">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Client Moniker</th>
                <th>Behavior Signal</th>
                <th>Skill Signal</th>
                <th>Celeration</th>
                <th>Agent Readout</th>
              </tr>
            </thead>
            <tbody>
              {rankedClients.map((client) => {
                const latest = client.points[client.points.length - 1]
                const insight = insightsByClient[client.clientId]
                const behaviorSeries = client.points.map((point) => point.behaviorRatePerHour)
                const skillSeries = client.points.map((point) => point.skillAccuracyPct)
                const celerationSeries = client.points.map((point) => point.celerationDeltaPct)
                const celerationText = `${latest.celerationDeltaPct > 0 ? '+' : ''}${latest.celerationDeltaPct.toFixed(1)}%`
                const celerationClass = latest.celerationDeltaPct >= 8 ? 'risk-high' : latest.celerationDeltaPct >= 0 ? 'risk-mid' : 'risk-low'

                return (
                  <tr key={client.clientId} className={`row-${badgeClassByAlert(client.alertLevel)}`}>
                    <td>
                      <div className="moniker-cell">
                        <div>
                          <strong>{client.moniker}</strong>
                          <span>{ageBand(client.ageYears)} | {client.primaryReinforcer}</span>
                        </div>
                        <em className={`alert-badge ${badgeClassByAlert(client.alertLevel)}`}>{client.alertLevel}</em>
                      </div>
                    </td>
                    <td>
                      <div className="metric-block">
                        <span>{latest.behaviorRatePerHour.toFixed(1)}/hr</span>
                        <Sparkline
                          values={chartMode === 'frequency' ? behaviorSeries : celerationSeries}
                          stroke={latest.behaviorRatePerHour > 7 ? '#f56565' : '#ed8936'}
                          threshold={chartMode === 'frequency' ? 6 : 0}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="metric-block">
                        <span>{latest.skillAccuracyPct.toFixed(1)}%</span>
                        <Sparkline values={skillSeries} stroke={latest.skillAccuracyPct < 70 ? '#f56565' : '#48bb78'} threshold={72} />
                      </div>
                    </td>
                    <td>
                      <div className="celeration-cell">
                        <strong className={celerationClass}>{celerationText}</strong>
                        <span>{client.attentionLabel}</span>
                      </div>
                    </td>
                    <td>
                      <div className="agent-cell">
                        <p>{insight?.summary ?? 'Agent profiling baseline...'}</p>
                        <span>{insight ? `${insight.source} | ${formatMsAgo(insight.evaluatedAtMs)}` : formatMsAgo(latest.timestampMs)}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <aside className="dashboard-alerts" aria-label="Alert feed">
          <h2>Agent Alert Feed</h2>
          <ul>
            {alertFeed.map(({ client, insight, latest }) => (
              <li key={client.clientId} className={badgeClassByAlert(client.alertLevel)}>
                <header>
                  <strong>{client.moniker}</strong>
                  <span>{latest.riskScore.toFixed(1)} risk</span>
                </header>
                <p>{insight.summary}</p>
                <footer>
                  <span>{client.attentionLabel}</span>
                  <span>{formatMsAgo(latest.timestampMs)}</span>
                </footer>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
