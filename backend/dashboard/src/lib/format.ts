const nf = new Intl.NumberFormat('en-US')
const cf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const cfc = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export const num = (n: number | null | undefined) => (n == null ? '—' : nf.format(n))
export const money = (n: number | null | undefined) => (n == null ? '—' : cf.format(n))
export const moneyShort = (n: number) => (Math.abs(n) >= 10000 ? cfc.format(n) : cf.format(n))
export const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n.toFixed(digits)}%`)
export const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function toDate(v: string) {
  return new Date(v.length === 10 ? `${v}T12:00:00` : v)
}
export const day = (v?: string | null) => (v ? toDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')
export const date = (v?: string | null) =>
  v ? toDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
export const dateTime = (v?: string | null) =>
  v ? toDate(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
export const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
export const monthShort = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short' })

export function ago(v?: string | null) {
  if (!v) return '—'
  const s = (Date.now() - toDate(v).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`
  return date(v)
}

export function duration(sec: number) {
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

export const hours = (h: number) => `${h.toFixed(h % 1 ? 1 : 0)} h`
export const minutes = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`)
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export const thisMonth = () => new Date().toISOString().slice(0, 7)
