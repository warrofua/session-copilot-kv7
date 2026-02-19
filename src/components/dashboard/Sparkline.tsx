import { useId, useMemo } from 'react'

type SparklineProps = {
  values: number[]
  width?: number
  height?: number
  stroke?: string
  threshold?: number
  className?: string
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export function Sparkline({
  values,
  width = 180,
  height = 44,
  stroke = '#63b3ed',
  threshold,
  className,
}: SparklineProps) {
  const id = useId()
  const gradientId = useMemo(() => `spark-${stroke.replace('#', '')}-${id.replace(/[:]/g, '')}`, [id, stroke])

  const pathData = useMemo(() => {
    if (values.length === 0) {
      return ''
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width
        const y = height - ((value - min) / range) * height
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`
      })
      .join(' ')
  }, [height, values, width])

  const thresholdY = useMemo(() => {
    if (threshold === undefined || values.length === 0) {
      return null
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const y = height - ((threshold - min) / range) * height
    return clamp(y, 0, height)
  }, [height, threshold, values])

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend sparkline"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.36" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
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
      {pathData ? (
        <>
          <path d={`${pathData} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${gradientId})`} />
          <path d={pathData} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
    </svg>
  )
}
