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
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const asSeries = (values: number[] | undefined, stroke: string): SparklineSeries[] => {
  if (!values || values.length === 0) {
    return []
  }
  return [{ id: 'primary', label: 'Primary', values, stroke }]
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
    const midpoint = (baseMin + baseMax) / 2

    // Keep charts expressive when values are tightly clustered.
    const minRange = Math.max(rawRange, Math.max(0.2, Math.abs(midpoint) * 0.08))
    const paddedRange = minRange * 1.25
    const min = midpoint - paddedRange / 2
    const max = midpoint + paddedRange / 2

    return { min, max, range: paddedRange || 1 }
  }, [activeSeries])

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
          const x = (valueIndex / Math.max(1, entry.values.length - 1)) * width
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
  }, [activeSeries, bounds.min, bounds.range, height, id, width])

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
        <rect x="0" y="0" width={width} height={height} rx="8" fill="rgba(255,255,255,0.02)" />
        {thresholdY !== null ? (
          <line
            x1="0"
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
