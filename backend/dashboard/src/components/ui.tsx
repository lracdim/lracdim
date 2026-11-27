import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, Minus, X } from 'lucide-react'

export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'signal' | 'info'

export const scoreTone = (s: number | null | undefined): Tone =>
  s == null ? 'neutral' : s >= 80 ? 'good' : s >= 60 ? 'warning' : 'critical'
export const scoreWord = (s: number | null | undefined) =>
  s == null ? 'No data' : s >= 90 ? 'Excellent' : s >= 80 ? 'Good' : s >= 60 ? 'Needs work' : 'Poor'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ layout */
export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function Card({ title, sub, actions, children, className, pad = true }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', !pad && 'card--flush', className)}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="muted small">{sub}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Grid({ cols = 4, children, className }: { cols?: 1 | 2 | 3 | 4 | 5; children: ReactNode; className?: string }) {
  return <div className={cx('grid', `grid--${cols}`, className)}>{children}</div>
}

/* ------------------------------------------------------------------ numbers */
export function Delta({ value, goodWhen = 'up', suffix = '%' }: { value: number | null | undefined; goodWhen?: 'up' | 'down'; suffix?: string }) {
  if (value == null) return <span className="delta delta--flat">—</span>
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  const good = flat ? null : goodWhen === 'up' ? up : !up
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cx('delta', good === true && 'delta--good', good === false && 'delta--bad', flat && 'delta--flat')}>
      <Icon aria-hidden="true" />
      {Math.abs(value).toFixed(1)}
      {suffix}
      <span className="sr-only">{up ? 'increase' : 'decrease'}</span>
    </span>
  )
}

export function Stat({ label, value, delta, goodWhen, hint, icon, tone }: { label: string; value: ReactNode; delta?: number | null; goodWhen?: 'up' | 'down'; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className={cx('stat', tone && `stat--${tone}`)}>
      <div className="stat__label">
        {icon}
        {label}
      </div>
      <div className="stat__value">{value}</div>
      <div className="stat__foot">
        {delta !== undefined && <Delta value={delta} goodWhen={goodWhen} />}
        {hint && <span className="muted small">{hint}</span>}
      </div>
    </div>
  )
}

export function ScoreRing({ score, label, size = 104, sub }: { score: number | null | undefined; label?: string; size?: number; sub?: string }) {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, score ?? 0))
  const tone = scoreTone(score)
  return (
    <figure className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'}: ${score ?? 'no data'} out of 100, ${scoreWord(score)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={cx('ring__bar', `tone-stroke--${tone}`)}
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring__num" style={{ fontSize: size * 0.28 }}>
          {score ?? '—'}
        </text>
      </svg>
      {label && <figcaption className="ring__label">{label}</figcaption>}
      <span className={cx('ring__word', `tone-text--${tone}`)}>{sub ?? scoreWord(score)}</span>
    </figure>
  )
}

export function Meter({ value, max, label, tone }: { value: number; max: number; label?: ReactNode; tone?: Tone }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0
  const t = tone ?? (value > max ? 'serious' : 'signal')
  return (
    <div className="meter">
      {label && <div className="meter__label">{label}</div>}
      <div className="meter__track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
        <div className={cx('meter__fill', `tone-bg--${t}`)} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ badges */
export function Pill({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cx('pill', `pill--${tone}`)}>
      {icon}
      {children}
    </span>
  )
}

const STATE_TONES: Record<string, Tone> = {
  active: 'good', onboarding: 'info', paused: 'warning', churned: 'critical',
  paid: 'good', sent: 'info', overdue: 'critical', draft: 'neutral', void: 'neutral',
  open: 'info', in_progress: 'signal', waiting: 'warning', resolved: 'good',
  on_track: 'good', at_risk: 'warning', late: 'critical', complete: 'neutral',
  new: 'signal', contacted: 'info', qualified: 'good', won: 'good', lost: 'neutral',
  reviewing: 'info', call_booked: 'signal', proposal: 'warning',
  urgent: 'critical', high: 'serious', normal: 'neutral', low: 'neutral',
  met: 'good', missed: 'serious', breached: 'critical', due_soon: 'warning', pending: 'neutral',
  done: 'good', upcoming: 'neutral', awaiting_approval: 'warning',
  critical: 'critical', warning: 'warning', info: 'info',
  low_risk: 'good', medium_risk: 'warning', high_risk: 'critical',
}

export function StatePill({ value, label }: { value: string; label?: string }) {
  return <Pill tone={STATE_TONES[value] ?? 'neutral'}>{label ?? value.replace(/_/g, ' ')}</Pill>
}

/* ------------------------------------------------------------------ controls */
export function Button({ children, variant = 'ghost', size, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'quiet'; size?: 'sm'; icon?: ReactNode }) {
  return (
    <button type="button" {...rest} className={cx('btn', `btn--${variant}`, size && `btn--${size}`, rest.className)}>
      {icon}
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={cx('seg__btn', o.value === value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className={cx('field', error && 'field--bad')}>
      <span className="field__label">{label}</span>
      {children}
      {(error || hint) && <span className="field__hint">{error || hint}</span>}
    </label>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={cx('modal', wide && 'modal--wide')} onClose={onClose} onCancel={onClose}>
      <header className="modal__head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X />
        </button>
      </header>
      <div className="modal__body">{open && children}</div>
    </dialog>
  )
}

/* ------------------------------------------------------------------ states */
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <p className="muted small">{children}</p>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Loader2 aria-hidden="true" />
      {label}
    </span>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="error-box" role="alert">
      <AlertTriangle aria-hidden="true" />
      <span>{msg}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk sk--title" />
      <div className="grid grid--4">
        {[0, 1, 2, 3].map((i) => (
          <div className="sk sk--tile" key={i} />
        ))}
      </div>
      <div className="sk sk--block" />
    </div>
  )
}

/** Render loading / error / data states for a TanStack query in one place. */
export function Async<T>({ q, children }: { q: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (q.isPending) return <Skeleton />
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  return <>{children(q.data)}</>
}
