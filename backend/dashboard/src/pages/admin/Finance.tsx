import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { CheckCircle2, Database, Plus, Trash2 } from 'lucide-react'
import { get, patch, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { Activity, AdminOverview, Invoice, InvoicesReport, SettingsResponse } from '../../lib/types'
import { DataTable } from '../../components/DataTable'
import { HBars } from '../../components/charts'
import { InvoiceModal } from '../../components/shared'
import { Async, Button, Card, ErrorBox, Field, Grid, Modal, PageHeader, Pill, Segmented, Stat, StatePill } from '../../components/ui'
import { ClientSelect } from './Delivery'

/* ------------------------------------------------------------------ billing */
function NewInvoice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [items, setItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }])
  const m = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/v1/admin/invoices', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      setItems([{ description: '', quantity: 1, unitPrice: 0 }])
      onClose()
    },
  })
  const total = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0)
  const set = (n: number, k: 'description' | 'quantity' | 'unitPrice', v: string) =>
    setItems(items.map((it, i) => (i === n ? { ...it, [k]: k === 'description' ? v : Number(v) } : it)))
  return (
    <Modal open={open} onClose={onClose} title="New invoice" wide>
      <form className="form" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; m.mutate({ clientId: d.clientId, kind: d.kind, dueInDays: Number(d.dueInDays), send: d.send === 'on', items }) }}>
        <div className="form__row">
          <Field label="Client"><ClientSelect /></Field>
          <Field label="Type"><select name="kind"><option value="one_off">One-off</option><option value="project">Project</option><option value="retainer">Retainer</option></select></Field>
          <Field label="Due in (days)"><input type="number" name="dueInDays" defaultValue={14} min={0} max={120} /></Field>
        </div>
        <table className="table line-items">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={n}>
                <td><input value={it.description} onChange={(e) => set(n, 'description', e.target.value)} required aria-label="Description" /></td>
                <td><input type="number" min={0.25} step={0.25} value={it.quantity} onChange={(e) => set(n, 'quantity', e.target.value)} aria-label="Quantity" /></td>
                <td><input type="number" min={0} step={10} value={it.unitPrice} onChange={(e) => set(n, 'unitPrice', e.target.value)} aria-label="Unit price" /></td>
                <td className="num">{f.money(it.quantity * it.unitPrice)}</td>
                <td>{items.length > 1 && <button type="button" className="icon-btn" aria-label="Remove line" onClick={() => setItems(items.filter((_, i) => i !== n))}><Trash2 /></button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}><Button size="sm" icon={<Plus />} onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])}>Add line</Button></td><td className="num"><b>{f.money(total)}</b></td><td /></tr></tfoot>
        </table>
        <label className="check-row"><input type="checkbox" name="send" defaultChecked /> Mark as sent (otherwise saved as a draft the client does not see)</label>
        <p className="muted small">This records the invoice; send it to the client yourself. Nothing here takes payments — mark it paid when the money arrives.</p>
        {m.isError && <ErrorBox error={m.error} />}
        <div className="row end gap-s"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={m.isPending}>Create invoice</Button></div>
      </form>
    </Modal>
  )
}

const icol = createColumnHelper<Invoice>()

export function AdminBillingPage() {
  const qc = useQueryClient()
  const [show, setShow] = useState<'unpaid' | 'all'>('unpaid')
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Invoice | null>(null)
  const q = useQuery({ queryKey: ['admin', 'invoices'], queryFn: () => get<InvoicesReport>('/v1/admin/invoices') })
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<AdminOverview>('/v1/admin/overview') })
  const mark = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => patch(`/v1/admin/invoices/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) })
  const cols = [
    icol.accessor('number', { header: 'Invoice', cell: (c) => <strong>{c.getValue()}</strong> }),
    icol.accessor('company', { header: 'Client' }),
    icol.accessor((i) => i.items[0]?.description ?? '', { id: 'desc', header: 'Description', cell: (c) => <span className="muted">{c.getValue() as string}</span> }),
    icol.accessor('issuedAt', { header: 'Issued', cell: (c) => f.date(c.getValue()) }),
    icol.accessor('dueAt', { header: 'Due', cell: (c) => f.date(c.getValue()) }),
    icol.accessor('status', { header: 'Status', cell: (c) => <StatePill value={c.getValue()} /> }),
    icol.accessor('amount', { header: 'Amount', meta: { align: 'right' }, cell: (c) => f.money(c.getValue()) }),
    icol.display({
      id: 'act', header: '',
      cell: (c) => {
        const i = c.row.original
        return (
          <div className="row gap-s end" onClick={(e) => e.stopPropagation()}>
            {['sent', 'overdue'].includes(i.status) && <Button size="sm" icon={<CheckCircle2 />} onClick={() => mark.mutate({ id: i.id, status: 'paid' })}>Mark paid</Button>}
            {i.status === 'draft' && <Button size="sm" onClick={() => mark.mutate({ id: i.id, status: 'sent' })}>Send</Button>}
          </div>
        )
      },
    }),
  ]
  return (
    <>
      <PageHeader title="Billing & revenue" sub="Invoices, receivables and recurring revenue." actions={<Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>New invoice</Button>} />
      <Async q={q}>
        {(d) => {
          const unpaid = d.items.filter((i) => ['sent', 'overdue', 'draft'].includes(i.status))
          return (
            <div className="stack">
              <Grid cols={4}>
                <Stat label="MRR" value={f.money(overview.data?.mrr)} hint={`${f.money(overview.data?.arr)} ARR`} />
                <Stat label="Collected (12 months)" value={f.money(overview.data?.revenue.trailing12)} />
                <Stat label="Outstanding" value={f.money(d.aging.current)} hint="not yet due" />
                <Stat label="Overdue" value={f.money(d.aging['1-30'] + d.aging['31-60'] + d.aging['60+'])} tone={d.aging['1-30'] + d.aging['31-60'] + d.aging['60+'] ? 'critical' : 'good'} />
              </Grid>
              <Grid cols={2}>
                <Card title="Receivables aging" sub="Unpaid invoices by days past due">
                  <HBars rows={(['current', '1-30', '31-60', '60+'] as const).map((k) => ({ label: k === 'current' ? 'Not yet due' : `${k} days late`, value: d.aging[k] }))} format={f.money} />
                </Card>
                <Card title="Care plans">
                  <ul className="kv">
                    {Object.entries(d.plans).map(([name, p]) => (
                      <li key={name}><strong>{name}</strong><span className="muted small">{p.includedHours} h / mo · {p.features.slice(-1)[0]}</span><Pill tone="signal">{f.money(p.price)}/mo</Pill></li>
                    ))}
                  </ul>
                </Card>
              </Grid>
              {mark.isError && <ErrorBox error={mark.error} />}
              <Card pad={false} actions={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'unpaid', label: `Unpaid (${unpaid.length})` }, { value: 'all', label: 'All' }]} />} title="Invoices">
                <DataTable data={show === 'unpaid' ? unpaid : d.items} columns={cols} search="Search invoices" onRowClick={setOpen} pageSize={15} empty={d.items.length ? 'No unpaid invoices' : 'No invoices yet'} />
              </Card>
            </div>
          )
        }}
      </Async>
      <NewInvoice open={creating} onClose={() => setCreating(false)} />
      <InvoiceModal inv={open} onClose={() => setOpen(null)} />
    </>
  )
}

/* ------------------------------------------------------------------ activity */
const acol = createColumnHelper<Activity>()
const ACOLS = [
  acol.accessor('at', { header: 'When', cell: (c) => f.dateTime(c.getValue()) }),
  acol.accessor('actor', { header: 'Who', cell: (c) => <strong>{c.getValue()}</strong> }),
  acol.accessor('action', { header: 'Action', cell: (c) => <span className="tag">{c.getValue()}</span> }),
  acol.accessor('target', { header: 'What' }),
  acol.accessor('detail', { header: 'Detail', cell: (c) => <span className="muted">{c.getValue()}</span> }),
]

export function AdminActivityPage() {
  const q = useQuery({ queryKey: ['admin', 'activity'], queryFn: () => get<Activity[]>('/v1/admin/activity?limit=500') })
  return (
    <>
      <PageHeader title="Activity log" sub="Audit trail of sign-ins, changes, scans, approvals and messages — by the studio and by clients." />
      <Async q={q}>{(rows) => <Card pad={false}><DataTable data={rows} columns={ACOLS} search="Search activity" pageSize={25} /></Card>}</Async>
    </>
  )
}

/* ------------------------------------------------------------------ settings */
const INTEG_TONE = { connected: 'good', not_connected: 'neutral' } as const

export function AdminSettingsPage() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => get<SettingsResponse>('/v1/admin/settings') })
  return (
    <>
      <PageHeader title="Settings" sub="Team, plans, data sources and storage." />
      <Async q={q}>
        {(d) => (
          <div className="stack">
            <Grid cols={2}>
              <Card title="Data sources" sub="Where the dashboard's numbers come from">
                <ul className="kv">
                  {d.integrations.map((i) => (
                    <li key={i.key}><strong>{i.name}</strong><span className="muted small">{i.detail}</span><Pill tone={INTEG_TONE[i.status]}>{f.titleCase(i.status)}</Pill></li>
                  ))}
                </ul>
              </Card>
              <div className="stack">
                <Card title="Team" sub="Admins are added with npm run studio:create-admin in worker/">
                  <ul className="feed">{d.team.map((u) => <li key={u.id}><strong>{u.name}</strong><span className="muted small">{u.email} · last sign-in {f.ago(u.lastLoginAt)}</span><Pill tone="signal">Admin</Pill></li>)}</ul>
                </Card>
                <Card title="Data" sub={`Runs on ${d.environment}`}>
                  <ul className="kv">
                    <li><Database /><span>Storage</span><span className="muted">Cloudflare {d.storage.backend.toUpperCase()}</span></li>
                    {Object.entries(d.storage.counts).map(([k, n]) => <li key={k}><span>{f.titleCase(k.replace(/([A-Z])/g, ' $1'))}</span><span className="num">{f.num(n)}</span></li>)}
                    <li><span>Portal invites last</span><span className="num">{d.inviteDays} days</span></li>
                  </ul>
                </Card>
              </div>
            </Grid>
            <Card title="Care plans" sub="Edit in worker/src/studio/plans.js, then deploy">
              <ul className="kv">
                {Object.entries(d.plans).map(([name, p]) => (
                  <li key={name}><strong>{name}</strong><span className="muted small">{p.includedHours} h / mo · {p.features.join(' · ')}</span><Pill tone="signal">{f.money(p.price)}/mo</Pill></li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </Async>
    </>
  )
}
