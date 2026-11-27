import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { cx } from './ui'

/* Chart palette (dark, validated on the #18191b surface with the dataviz validator):
   --s1 blue, --s2 orange, --s3 aqua, --s4 yellow, --s5 magenta — assigned in this fixed order. */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

export interface Series {
  key: string
  label: string
  color?: string
}

type Row = object
const at = (d: Row, k: string) => (d as Record<string, unknown>)[k] as string | number | null | undefined

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="legend">
      {series.map((s, i) => (
        <li key={s.key}>
          <span className="legend__swatch" style={{ background: s.color ?? SERIES[i] }} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div className="tip" style={{ left, top: y }}>
      {children}
    </div>
  )
}

/** Line / area chart with crosshair tooltip. One y-axis only. */
export function LineChart({
  data, x, series, height = 220, yFormat = (v) => String(v), xFormat = (v) => String(v), area = true, invert = false, yMin, label,
}: {
  data: Row[]; x: string; series: Series[]; height?: number; yFormat?: (v: number) => string; xFormat?: (v: string) => string
  area?: boolean; invert?: boolean; yMin?: number; label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { t: 12, r: 12, b: 26, l: 48 }
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const vals = data.flatMap((d) => series.map((s) => Number(at(d, s.key) ?? 0)))
  const max = niceMax(Math.max(...vals, 0))
  const min = yMin ?? (invert ? Math.max(1, Math.min(...vals)) : 0)
  const top = invert ? Math.max(...vals) : max
  const sx = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const sy = (v: number) => {
    const t = (v - min) / (top - min || 1)
    return invert ? pad.t + t * ih : pad.t + ih - t * ih
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (top - min))
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 80))))
  const colors = series.map((s, i) => s.color ?? SERIES[i])

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - box.left) / box.width
    setHover(Math.round(rel * (data.length - 1)))
  }

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <Legend series={series.map((s, i) => ({ ...s, color: colors[i] }))} />}
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} className="grid-line" />
            <text x={pad.l - 8} y={sy(t)} className="axis-text" textAnchor="end" dominantBaseline="middle">
              {yFormat(Math.round(t * 10) / 10)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % step === 0 ? (
            <text key={i} x={sx(i)} y={height - 6} className="axis-text" textAnchor="middle">
              {xFormat(String(at(d, x)))}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = data.map((d, i) => `${sx(i)},${sy(Number(at(d, s.key) ?? 0))}`)
          return (
            <g key={s.key}>
              {area && si === 0 && (
                <path d={`M${pad.l},${sy(min)} L${pts.join(' L')} L${sx(data.length - 1)},${sy(min)} Z`} fill={colors[si]} className="area" />
              )}
              <polyline points={pts.join(' ')} fill="none" stroke={colors[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {hover != null && data[hover] && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
            {series.map((s, si) => (
              <circle key={s.key} cx={sx(hover)} cy={sy(Number(at(data[hover], s.key) ?? 0))} r={4.5} fill={colors[si]} className="dot" />
            ))}
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && data[hover] && (
        <Tooltip x={sx(hover)} y={pad.t} width={width}>
          <div className="tip__title">{xFormat(String(at(data[hover], x)))}</div>
          {series.map((s, si) => (
            <div className="tip__row" key={s.key}>
              <span className="legend__swatch" style={{ background: colors[si] }} />
              {s.label}
              <b>{yFormat(Number(at(data[hover], s.key) ?? 0))}</b>
            </div>
          ))}
        </Tooltip>
      )}
      <DataTableSr data={data} x={x} series={series} yFormat={yFormat} caption={label} />
    </div>
  )
}

/** Vertical bars (one measure over a category / time axis). */
export function BarChart({
  data, x, y, height = 220, yFormat = (v) => String(v), xFormat = (v) => String(v), color = SERIES[0], label, highlightLast,
}: {
  data: Row[]; x: string; y: string; height?: number; yFormat?: (v: number) => string; xFormat?: (v: string) => string; color?: string; label: string; highlightLast?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { t: 12, r: 8, b: 26, l: 52 }
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const max = niceMax(Math.max(...data.map((d) => Number(at(d, y) ?? 0)), 0))
  const bw = iw / data.length
  const barW = Math.max(4, Math.min(44, bw - 2))
  const sy = (v: number) => pad.t + ih - (v / max) * ih
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t * max)} y2={sy(t * max)} className="grid-line" />
            <text x={pad.l - 8} y={sy(t * max)} className="axis-text" textAnchor="end" dominantBaseline="middle">
              {yFormat(t * max)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = Number(at(d, y) ?? 0)
          const h = Math.max(0, pad.t + ih - sy(v))
          const bx = pad.l + i * bw + (bw - barW) / 2
          const r = Math.min(4, h)
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${bx},${pad.t + ih} V${pad.t + ih - h + r} Q${bx},${pad.t + ih - h} ${bx + r},${pad.t + ih - h} H${bx + barW - r} Q${bx + barW},${pad.t + ih - h} ${bx + barW},${pad.t + ih - h + r} V${pad.t + ih} Z`}
                  fill={color}
                  opacity={hover == null || hover === i ? (highlightLast && i !== data.length - 1 && hover == null ? 0.55 : 1) : 0.45}
                />
              )}
              <text x={pad.l + i * bw + bw / 2} y={height - 6} className="axis-text" textAnchor="middle">
                {data.length > 16 && i % 2 ? '' : xFormat(String(at(d, x)))}
              </text>
            </g>
          )
        })}
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="base-line" />
      </svg>
      {hover != null && (
        <Tooltip x={pad.l + hover * bw + bw / 2} y={pad.t} width={width}>
          <div className="tip__title">{xFormat(String(at(data[hover], x)))}</div>
          <div className="tip__row">
            <b>{yFormat(Number(at(data[hover], y) ?? 0))}</b>
          </div>
        </Tooltip>
      )}
      <DataTableSr data={data} x={x} series={[{ key: y, label: y }]} yFormat={yFormat} caption={label} />
    </div>
  )
}

/** Ranked horizontal bars with labels and values in text ink (magnitude: one hue). */
export function HBars({ rows, format = (v) => String(v), color = SERIES[0], max }: { rows: { label: ReactNode; value: number; sub?: ReactNode }[]; format?: (v: number) => string; color?: string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="hbars">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="hbars__row">
            <span className="hbars__label">{r.label}</span>
            <span className="hbars__value">
              {format(r.value)}
              {r.sub && <span className="muted small"> {r.sub}</span>}
            </span>
          </div>
          <div className="hbars__track">
            <div className="hbars__fill" style={{ width: `${(r.value / top) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Uptime strip (up to 90 days): each cell is a day, toned by status with a legend + tooltip. */
export function UptimeStrip({ days }: { days: { date: string; uptimePct: number | null; incidents: number; avgResponseMs?: number | null }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const tone = (p: number | null) => (p == null ? 'neutral' : p >= 99.99 ? 'good' : p >= 99 ? 'warning' : 'critical')
  const shown = (p: number | null) => (p == null ? 'no checks' : `${p.toFixed(2)}%`)
  return (
    <div className="uptime">
      <div className="uptime__cells" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <span
            key={d.date}
            className={cx('uptime__cell', `tone-bg--${tone(d.uptimePct)}`, hover === i && 'is-hover')}
            onMouseEnter={() => setHover(i)}
            aria-label={`${d.date}: ${shown(d.uptimePct)} uptime`}
          />
        ))}
        {hover != null && (
          <div className="tip" style={{ left: `${(hover / days.length) * 100}%`, top: -8, transform: 'translate(-50%, -100%)' }}>
            <div className="tip__title">{new Date(`${days[hover].date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            <div className="tip__row">
              Uptime <b>{shown(days[hover].uptimePct)}</b>
            </div>
            <div className="tip__row">
              Incidents <b>{days[hover].incidents}</b>
            </div>
            {days[hover].avgResponseMs != null && (
              <div className="tip__row">
                Response <b>{days[hover].avgResponseMs} ms</b>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="uptime__foot muted small">
        <span>{days.length} day{days.length === 1 ? '' : 's'} ago</span>
        <ul className="legend legend--inline">
          <li><span className="legend__swatch tone-bg--good" />No downtime</li>
          <li><span className="legend__swatch tone-bg--warning" />Minor</li>
          <li><span className="legend__swatch tone-bg--critical" />Major</li>
        </ul>
        <span>Today</span>
      </div>
    </div>
  )
}

/** Screen-reader table mirror of a chart so data is never visual-only. */
function DataTableSr({ data, x, series, yFormat, caption }: { data: Row[]; x: string; series: Series[]; yFormat: (v: number) => string; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{x}</th>
          {series.map((s) => (
            <th key={s.key}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((d, i) => (
          <tr key={i}>
            <td>{String(at(d, x))}</td>
            {series.map((s) => (
              <td key={s.key}>{yFormat(Number(at(d, s.key) ?? 0))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
