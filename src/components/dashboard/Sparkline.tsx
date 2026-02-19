import { useId, useMemo } from 'react'

export type SparklineSeries = {
  id: string
  label: string
  values: number[]
  stroke: string
}

type SparklineProps = {
  values?: number[]
  series?: SparklineSeries[]
  width?: number
  height?: number
  stroke?: string
  threshold?: number
  className?: string
  showLegend?: boolean
  legendMaxItems?: number
  ariaLabel?: string
  showYAxis?: boolean
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const asSeries = (values: number[] | undefined, stroke: string): SparklineSeries[] => {
  if (!values || values.length === 0) {
    return []
  }
  return [{ id: 'primary', label: 'Primary', values, stroke }]
}

const formatAxisValue = (value: number): string => {
  const magnitude = Math.abs(value)
  if (magnitude >= 100) return value.toFixed(0)
  if (magnitude >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function Sparkline({
  values,
  series,
  width = 190,
  height = 56,
  stroke = '#63b3ed',
  threshold,
  className,
  showLegend = false,
  legendMaxItems = 3,
  ariaLabel = 'Trend sparkline',
  showYAxis = true,
}: SparklineProps) {
  const id = useId()
  const activeSeries = useMemo(() => {
    const provided = series?.filter((entry) => entry.values.length > 0) ?? []
    return provided.length > 0 ? provided : asSeries(values, stroke)
  }, [series, stroke, values])

  const bounds = useMemo(() => {
    const allValues = activeSeries.flatMap((entry) => entry.values)
    if (allValues.length === 0) {
      return { min: 0, max: 1, range: 1 }
    }

    const baseMin = Math.min(...allValues)
    const baseMax = Math.max(...allValues)
    const rawRange = baseMax - baseMin
    if (rawRange <= Number.EPSILON) {
      const baselinePadding = Math.max(Math.abs(baseMin) * 0.02, 0.08)
      const min = baseMin - baselinePadding
      const max = baseMax + baselinePadding
      return { min, max, range: Math.max(max - min, 0.16) }
    }

    // Keep truthful data but normalize tightly so subtle trend shifts are visible.
    const padding = Math.max(rawRange * 0.08, 0.01)
    const min = baseMin - padding
    const max = baseMax + padding

    return { min, max, range: Math.max(max - min, 0.02) }
  }, [activeSeries])

  const axisTicks = useMemo(() => {
    const top = bounds.max
    const middle = bounds.min + bounds.range / 2
    const bottom = bounds.min
    return [top, middle, bottom]
  }, [bounds.max, bounds.min, bounds.range])

  const layout = useMemo(() => {
    const leftGutter = showYAxis ? 24 : 4
    const rightPadding = 2
    const plotX = leftGutter
    const plotWidth = Math.max(1, width - leftGutter - rightPadding)
    return { leftGutter, plotX, plotWidth }
  }, [showYAxis, width])

  const thresholdY = useMemo(() => {
    if (threshold === undefined || activeSeries.length === 0) {
      return null
    }
    const y = height - ((threshold - bounds.min) / bounds.range) * height
    return clamp(y, 0, height)
  }, [activeSeries.length, bounds.min, bounds.range, height, threshold])

  const pathBySeries = useMemo(() => {
    return activeSeries.map((entry, index) => {
      const path = entry.values
        .map((value, valueIndex) => {
          const x = layout.plotX + (valueIndex / Math.max(1, entry.values.length - 1)) * layout.plotWidth
          const y = height - ((value - bounds.min) / bounds.range) * height
          return `${valueIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`
        })
        .join(' ')

      return {
        id: `${id.replace(/[:]/g, '')}-${entry.id}-${index}`,
        stroke: entry.stroke,
        label: entry.label,
        path,
      }
    })
  }, [activeSeries, bounds.min, bounds.range, height, id, layout.plotWidth, layout.plotX])

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <rect x={layout.plotX} y="0" width={layout.plotWidth} height={height} rx="8" fill="rgba(255,255,255,0.02)" />
        {showYAxis ? (
          <>
            <line x1={layout.plotX} y1="0" x2={layout.plotX} y2={height} stroke="rgba(148,163,184,0.5)" strokeWidth="1" />
            {axisTicks.map((tick) => {
              const y = clamp(height - ((tick - bounds.min) / bounds.range) * height, 0, height)
              return (
                <g key={`${id}-axis-${tick.toFixed(3)}`}>
                  <line
                    x1={layout.plotX - 3}
                    y1={y}
                    x2={width}
                    y2={y}
                    stroke="rgba(148,163,184,0.18)"
                    strokeWidth="0.8"
                    strokeDasharray="2 4"
                  />
                  <text x={layout.plotX - 5} y={y + 3} textAnchor="end" fill="rgba(148,163,184,0.86)" fontSize="7">
                    {formatAxisValue(tick)}
                  </text>
                </g>
              )
            })}
          </>
        ) : null}
        {thresholdY !== null ? (
          <line
            x1={layout.plotX}
            y1={thresholdY}
            x2={width}
            y2={thresholdY}
            stroke="rgba(245,101,101,0.38)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        ) : null}
        {pathBySeries.map((entry) => (
          <path
            key={entry.id}
            d={entry.path}
            fill="none"
            stroke={entry.stroke}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {showLegend && activeSeries.length > 0 ? (
        <ul className="sparkline-legend" aria-label="Chart legend">
          {activeSeries.slice(0, legendMaxItems).map((entry) => (
            <li key={`${entry.id}-legend`}>
              <span className="swatch" style={{ backgroundColor: entry.stroke }} />
              <span className="label">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
