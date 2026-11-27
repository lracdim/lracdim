import { useState, type ReactNode } from 'react'
import { Check, Copy, Printer, Send } from 'lucide-react'
import * as f from '../lib/format'
import type { Invite, Invoice, Message, Project, Ticket } from '../lib/types'
import { BrandMark, Logotype } from './Shell'
import { Button, cx, Meter, Modal, Pill, StatePill } from './ui'

export const PHASES = ['discovery', 'strategy', 'design', 'development', 'qa', 'launch', 'maintenance']
const PHASE_LABEL: Record<string, string> = { qa: 'QA & approval' }

export function PhaseSteps({ phase }: { phase: string }) {
  const at = PHASES.indexOf(phase)
  return (
    <ol className="phases" aria-label={`Phase: ${phase}`}>
      {PHASES.map((p, i) => (
        <li key={p} className={cx(i < at && 'is-done', i === at && 'is-now')} aria-current={i === at ? 'step' : undefined}>
          <span className="phases__dot">{i < at ? <Check /> : i + 1}</span>
          <span className="phases__label">{PHASE_LABEL[p] ?? f.titleCase(p)}</span>
        </li>
      ))}
    </ol>
  )
}

export function ProjectCard({ p, milestoneAction, headerExtra }: { p: Project; milestoneAction?: (m: Project['milestones'][number]) => ReactNode; headerExtra?: ReactNode }) {
  const done = p.milestones.filter((m) => m.status === 'done').length
  return (
    <section className="card project">
      <header className="card__head">
        <div>
          <div className="eyebrow">{p.company ? `${p.company} · ` : ''}{p.type}</div>
          <h2>{p.name}</h2>
          <p className="muted small">
            {f.date(p.startDate)} → {f.date(p.dueDate)} · {done}/{p.milestones.length} milestones
          </p>
        </div>
        <div className="row gap-s wrap">
          <StatePill value={p.health} />
          {headerExtra}
        </div>
      </header>
      <PhaseSteps phase={p.phase} />
      <div className="project__meters">
        <Meter value={done} max={Math.max(1, p.milestones.length)} label={<>Progress <b>{Math.round((done / Math.max(1, p.milestones.length)) * 100)}%</b></>} tone="signal" />
        <Meter value={p.hoursLogged} max={p.hoursBudget} label={<>Hours <b>{p.hoursLogged}</b> of {p.hoursBudget}</>} />
      </div>
      <ul className="milestones">
        {p.milestones.map((m) => (
          <li key={m.id} className={cx('ms', `ms--${m.status}`)}>
            <span className="ms__dot" aria-hidden="true">{m.status === 'done' && <Check />}</span>
            <div className="ms__body">
              <strong>{m.title}</strong>
              <span className="muted small">
                {m.status === 'done' && m.approvedAt ? `Approved ${f.date(m.approvedAt)}${m.approvedBy ? ` by ${m.approvedBy}` : ''}` : `Due ${f.date(m.dueDate)}`}
              </span>
            </div>
            <StatePill value={m.status} />
            {milestoneAction?.(m)}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Thread({ messages, onSend, sending, disabled, placeholder = 'Write a reply…' }: { messages: Message[]; onSend: (body: string) => void; sending?: boolean; disabled?: boolean; placeholder?: string }) {
  const [body, setBody] = useState('')
  return (
    <div className="thread">
      <ol className="thread__list">
        {messages.map((m) => (
          <li key={m.id} className={cx('msg', m.role === 'admin' ? 'msg--studio' : 'msg--client')}>
            <div className="msg__meta">
              <strong>{m.author}</strong>
              <span className="muted small">{m.role === 'admin' ? 'lracdimension' : 'Client'} · {f.dateTime(m.at)}</span>
            </div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <form
        className="thread__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim()) return
          onSend(body.trim())
          setBody('')
        }}
      >
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} rows={3} disabled={disabled} aria-label="Reply" />
        <Button variant="primary" type="submit" icon={<Send />} disabled={sending || disabled || !body.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  )
}

export function SlaPill({ t }: { t: Ticket }) {
  const label = { met: 'SLA met', missed: 'SLA missed', breached: 'SLA breached', due_soon: 'Reply due soon', pending: `Reply within ${t.slaHours}h` }[t.slaState]
  return <StatePill value={t.slaState} label={label} />
}

export function InvoiceDoc({ inv, company }: { inv: Invoice; company?: string }) {
  return (
    <div className="invoice-doc printable">
      <header className="row between">
        <div className="row gap-s">
          <BrandMark />
          <div>
            <strong><Logotype /></strong>
            <div className="muted small">Engineering studio</div>
          </div>
        </div>
        <div className="right">
          <div className="eyebrow">Invoice</div>
          <strong>{inv.number}</strong>
          <div><StatePill value={inv.status} /></div>
        </div>
      </header>
      <div className="row between invoice-doc__meta">
        <div>
          <div className="muted small">Billed to</div>
          <strong>{company ?? inv.company}</strong>
        </div>
        <div className="right">
          <div className="muted small">Issued {f.date(inv.issuedAt)}</div>
          <div className="muted small">Due {f.date(inv.dueAt)}</div>
          {inv.paidAt && <div className="small tone-text--good">Paid {f.date(inv.paidAt)}</div>}
        </div>
      </div>
      <table className="table">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {inv.items.map((i, n) => (
            <tr key={n}><td>{i.description}</td><td className="num">{i.quantity}</td><td className="num">{f.money(i.unitPrice)}</td><td className="num">{f.money(i.quantity * i.unitPrice)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="num"><b>{f.money(inv.amount)}</b></td></tr></tfoot>
      </table>
      <div className="row end no-print">
        <Button icon={<Printer />} onClick={() => window.print()}>Print / save PDF</Button>
      </div>
    </div>
  )
}

export function InvoiceModal({ inv, onClose, company }: { inv: Invoice | null; onClose: () => void; company?: string }) {
  return (
    <Modal open={Boolean(inv)} onClose={onClose} title={inv ? `Invoice ${inv.number}` : ''} wide>
      {inv && <InvoiceDoc inv={inv} company={company} />}
    </Modal>
  )
}

/**
 * A portal invite to hand to the client. The token is shown only once (the
 * Worker stores its hash), so the admin copies the link now; a new invite can
 * be issued from the client's page at any time.
 */
export function InviteLink({ invite }: { invite: Invite }) {
  const link = `${window.location.origin}/invite#t=${invite.token}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="stack">
      <p>
        Send this link to <b>{invite.email}</b> yourself (the portal sends no email). It lets them choose a password and works once, until {f.dateTime(invite.expiresAt)}.
      </p>
      <div className="copy-box">
        <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <Button icon={copied ? <Check /> : <Copy />} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <p className="muted small">This link is not shown again. If it gets lost, issue a new invite from the client's page.</p>
    </div>
  )
}

export function MonthSelect({ value, months, onChange }: { value: string; months: string[]; onChange: (m: string) => void }) {
  return (
    <label className="select-wrap">
      <span className="sr-only">Month</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {months.map((m) => <option key={m} value={m}>{f.monthLabel(m)}</option>)}
      </select>
    </label>
  )
}

export function lastMonths(n: number) {
  const out: string[] = []
  const d = new Date()
  d.setDate(15)
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 7))
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

export { Pill }
