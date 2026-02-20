import { useId, useMemo } from 'react'

type AxisSide = 'left' | 'right'

export type SparklineSeries = {
  id: string
  label: string
  values: number[]
  stroke: string
  axis?: AxisSide
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
  dualAxis?: boolean
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

const averageOfSeries = (entry: SparklineSeries): number =>
  entry.values.reduce((sum, value) => sum + value, 0) / Math.max(1, entry.values.length)

const computeBounds = (values: number[]): { min: number; max: number; range: number } => {
  if (values.length === 0) {
    return { min: 0, max: 1, range: 1 }
  }

  const baseMin = Math.min(...values)
  const baseMax = Math.max(...values)
  const rawRange = baseMax - baseMin
  if (rawRange <= Number.EPSILON) {
    const baselinePadding = Math.max(Math.abs(baseMin) * 0.02, 0.08)
    const min = baseMin - baselinePadding
    const max = baseMax + baselinePadding
    return { min, max, range: Math.max(max - min, 0.16) }
  }

  const padding = Math.max(rawRange * 0.08, 0.01)
  const min = baseMin - padding
  const max = baseMax + padding
  return { min, max, range: Math.max(max - min, 0.02) }
}

const axisTicksFromBounds = (bounds: { min: number; range: number; max: number }): number[] => {
  const top = bounds.max
  const middle = bounds.min + bounds.range / 2
  const bottom = bounds.min
  return [top, middle, bottom]
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
  dualAxis = false,
}: SparklineProps) {
  const id = useId()
  const activeSeries = useMemo(() => {
    const provided = series?.filter((entry) => entry.values.length > 0) ?? []
    return provided.length > 0 ? provided : asSeries(values, stroke)
  }, [series, stroke, values])

  const seriesWithAxis = useMemo(() => {
    const shouldSplitAxis = dualAxis && activeSeries.length > 1
    if (!shouldSplitAxis) {
      return activeSeries.map((entry) => ({ ...entry, axis: 'left' as const }))
    }

    const assigned = activeSeries
      .filter((entry) => entry.axis === 'left' || entry.axis === 'right')
      .map((entry) => ({ ...entry, axis: entry.axis as AxisSide }))
    const unassigned = activeSeries.filter((entry) => entry.axis !== 'left' && entry.axis !== 'right')

    let leftMeanSum = assigned.filter((entry) => entry.axis === 'left').reduce((sum, entry) => sum + averageOfSeries(entry), 0)
    let rightMeanSum = assigned.filter((entry) => entry.axis === 'right').reduce((sum, entry) => sum + averageOfSeries(entry), 0)

    const autoAssigned = [...unassigned]
      .sort((left, right) => averageOfSeries(right) - averageOfSeries(left))
      .map((entry) => {
        const mean = averageOfSeries(entry)
        if (leftMeanSum <= rightMeanSum) {
          leftMeanSum += mean
          return { ...entry, axis: 'left' as const }
        }
        rightMeanSum += mean
        return { ...entry, axis: 'right' as const }
      })

    return [...assigned, ...autoAssigned]
  }, [activeSeries, dualAxis])

  const leftSeries = useMemo(() => seriesWithAxis.filter((entry) => entry.axis === 'left'), [seriesWithAxis])
  const rightSeries = useMemo(() => seriesWithAxis.filter((entry) => entry.axis === 'right'), [seriesWithAxis])
  const hasDualAxes = dualAxis && rightSeries.length > 0

  const boundsByAxis = useMemo(() => {
    const allValues = seriesWithAxis.flatMap((entry) => entry.values)
    const leftValues = leftSeries.flatMap((entry) => entry.values)
    const rightValues = rightSeries.flatMap((entry) => entry.values)

    const leftBounds = computeBounds(leftValues.length > 0 ? leftValues : allValues)
    const rightBounds = hasDualAxes
      ? computeBounds(rightValues.length > 0 ? rightValues : leftValues.length > 0 ? leftValues : allValues)
      : leftBounds

    return { left: leftBounds, right: rightBounds }
  }, [hasDualAxes, leftSeries, rightSeries, seriesWithAxis])

  const leftAxisTicks = useMemo(() => axisTicksFromBounds(boundsByAxis.left), [boundsByAxis.left])
  const rightAxisTicks = useMemo(() => axisTicksFromBounds(boundsByAxis.right), [boundsByAxis.right])

  const layout = useMemo(() => {
    const leftGutter = showYAxis ? 24 : 4
    const rightPadding = showYAxis && hasDualAxes ? 24 : 2
    const plotX = leftGutter
    const plotWidth = Math.max(1, width - leftGutter - rightPadding)
    const rightAxisX = plotX + plotWidth
    return { leftGutter, plotX, plotWidth, rightAxisX }
  }, [hasDualAxes, showYAxis, width])

  const thresholdY = useMemo(() => {
    if (threshold === undefined || seriesWithAxis.length === 0) {
      return null
    }
    const y = height - ((threshold - boundsByAxis.left.min) / boundsByAxis.left.range) * height
    return clamp(y, 0, height)
  }, [boundsByAxis.left.min, boundsByAxis.left.range, height, seriesWithAxis.length, threshold])

  const pathBySeries = useMemo(() => {
    return seriesWithAxis.map((entry, index) => {
      const axisBounds = entry.axis === 'right' ? boundsByAxis.right : boundsByAxis.left
      const path = entry.values
        .map((value, valueIndex) => {
          const x = layout.plotX + (valueIndex / Math.max(1, entry.values.length - 1)) * layout.plotWidth
          const y = height - ((value - axisBounds.min) / axisBounds.range) * height
          return `${valueIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`
        })
        .join(' ')

      return {
        id: `${id.replace(/[:]/g, '')}-${entry.id}-${index}`,
        stroke: entry.stroke,
        label: entry.label,
        axis: entry.axis,
        path,
      }
    })
  }, [boundsByAxis.left, boundsByAxis.right, height, id, layout.plotWidth, layout.plotX, seriesWithAxis])

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
            {leftAxisTicks.map((tick) => {
              const y = clamp(height - ((tick - boundsByAxis.left.min) / boundsByAxis.left.range) * height, 0, height)
              return (
                <g key={`${id}-axis-${tick.toFixed(3)}`}>
                  <line
                    x1={layout.plotX - 3}
                    y1={y}
                    x2={layout.rightAxisX}
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
            {hasDualAxes ? (
              <>
                <line
                  x1={layout.rightAxisX}
                  y1="0"
                  x2={layout.rightAxisX}
                  y2={height}
                  stroke="rgba(148,163,184,0.5)"
                  strokeWidth="1"
                />
                {rightAxisTicks.map((tick) => {
                  const y = clamp(height - ((tick - boundsByAxis.right.min) / boundsByAxis.right.range) * height, 0, height)
                  return (
                    <g key={`${id}-axis-right-${tick.toFixed(3)}`}>
                      <text x={layout.rightAxisX + 5} y={y + 3} textAnchor="start" fill="rgba(148,163,184,0.86)" fontSize="7">
                        {formatAxisValue(tick)}
                      </text>
                    </g>
                  )
                })}
              </>
            ) : null}
          </>
        ) : null}
        {thresholdY !== null ? (
          <line
            x1={layout.plotX}
            y1={thresholdY}
            x2={layout.rightAxisX}
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
      {showLegend && seriesWithAxis.length > 0 ? (
        <ul className="sparkline-legend" aria-label="Chart legend">
          {seriesWithAxis.slice(0, legendMaxItems).map((entry) => (
            <li key={`${entry.id}-legend`}>
              <span className="swatch" style={{ backgroundColor: entry.stroke }} />
              <span className="label">{entry.label}</span>
              {hasDualAxes ? <span className={`axis-tag ${entry.axis}`}>{entry.axis === 'left' ? 'L' : 'R'}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
