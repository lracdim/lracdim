import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Eye, KeyRound, Pencil, Plus, Users } from 'lucide-react'
import { ApiError, get, patch, post } from '../../lib/api'
import * as f from '../../lib/format'
import { session } from '../../lib/session'
import type { ClientDetail, ClientRow, CreateClientResponse, Invite, Invoice, SessionResponse, Site, User } from '../../lib/types'
import { DataTable } from '../../components/DataTable'
import { InviteLink, InvoiceModal, ProjectCard, SlaPill } from '../../components/shared'
import { IssueList, MonitorPill, VISIBILITY_HINT } from '../../components/reports'
import { Async, Button, Card, Empty, ErrorBox, Field, Grid, Modal, PageHeader, Pill, ScoreRing, scoreTone, Segmented, Stat, StatePill } from '../../components/ui'

const col = createColumnHelper<ClientRow>()
const COLS = [
  col.accessor('company', { header: 'Client', cell: (c) => <><strong>{c.getValue()}</strong><div className="muted small">{c.row.original.contactName}{c.row.original.industry ? ` · ${c.row.original.industry}` : ''}</div></> }),
  col.accessor('status', { header: 'Status', cell: (c) => <StatePill value={c.getValue()} /> }),
  col.accessor('plan', { header: 'Plan' }),
  col.accessor('mrr', { header: 'MRR', meta: { align: 'right' }, cell: (c) => f.money(c.getValue()) }),
  col.accessor('health', { header: 'Health', meta: { align: 'right' }, cell: (c) => <Pill tone={scoreTone(c.getValue())}>{c.getValue() ?? '—'}</Pill> }),
  col.accessor('visibility', { header: 'Visibility', meta: { align: 'right' }, cell: (c) => <Pill tone={scoreTone(c.getValue())}>{c.getValue() ?? '—'}</Pill> }),
  col.accessor('hoursUsed', { header: 'Hours (mo)', meta: { align: 'right' }, cell: (c) => <span className={c.getValue() > c.row.original.includedHours ? 'tone-text--serious' : ''}>{c.getValue()} / {c.row.original.includedHours}</span> }),
  col.accessor('openTickets', { header: 'Tickets', meta: { align: 'right' } }),
  col.accessor('overdue', { header: 'Overdue', meta: { align: 'right' }, cell: (c) => (c.getValue() ? <span className="tone-text--critical">{f.money(c.getValue())}</span> : '—') }),
  col.accessor('renewalDays', { header: 'Renewal', meta: { align: 'right' }, cell: (c) => (c.getValue() == null ? '—' : `${c.getValue()} d`) }),
  col.accessor('lifetimeValue', { header: 'Lifetime value', meta: { align: 'right' }, cell: (c) => f.money(c.getValue()) }),
  col.accessor('riskScore', { header: 'Churn risk', cell: (c) => <StatePill value={`${c.row.original.churnRisk}_risk`} label={c.row.original.churnRisk} /> }),
]

function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [result, setResult] = useState<CreateClientResponse | null>(null)
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => post<CreateClientResponse>('/v1/admin/clients', body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      if (r.invite) setResult(r)
      else {
        onClose()
        navigate({ to: '/admin/clients/$clientId', params: { clientId: r.client.id } })
      }
    },
  })
  const fields = m.error instanceof ApiError ? m.error.fields : undefined
  const close = () => {
    setResult(null)
    m.reset()
    onClose()
  }
  return (
    <Modal open={open} onClose={close} title={result ? 'Client created' : 'New client'}>
      {result?.invite ? (
        <div className="form">
          <InviteLink invite={result.invite} />
          <div className="row end">
            <Button variant="primary" onClick={() => { const id = result.client.id; close(); navigate({ to: '/admin/clients/$clientId', params: { clientId: id } }) }}>Open client</Button>
          </div>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
            m.mutate({ company: fd.company, contactName: fd.contactName, email: fd.email, industry: fd.industry, plan: fd.plan, website: fd.website || null, portalAccess: fd.portalAccess === 'on' })
          }}
        >
          <div className="form__row">
            <Field label="Company" error={fields?.company}><input name="company" required minLength={2} /></Field>
            <Field label="Industry"><input name="industry" placeholder="e.g. Healthcare" /></Field>
          </div>
          <div className="form__row">
            <Field label="Contact name" error={fields?.contactName}><input name="contactName" required minLength={2} /></Field>
            <Field label="Contact email" error={fields?.email}><input name="email" type="email" required /></Field>
          </div>
          <div className="form__row">
            <Field label="Care plan">
              <select name="plan" defaultValue="Growth"><option>Essentials</option><option>Growth</option><option>Scale</option></select>
            </Field>
            <Field label="Website" hint="Added to uptime monitoring right away" error={fields?.website}><input name="website" placeholder="example.com" /></Field>
          </div>
          <label className="check-row"><input type="checkbox" name="portalAccess" /> Invite the contact to the client portal (you get a link to send them)</label>
          {m.isError && !fields && <ErrorBox error={m.error} />}
          <div className="row end gap-s">
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={m.isPending}>{m.isPending ? 'Creating…' : 'Create client'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function AdminClientsPage() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'clients'], queryFn: () => get<ClientRow[]>('/v1/admin/clients') })
  return (
    <>
      <PageHeader title="Clients" sub="Every account at a glance — revenue, website health, workload and churn risk." actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>New client</Button>} />
      <Async q={q}>
        {(rows) =>
          rows.length ? (
            <div className="stack">
              <Grid cols={4}>
                <Stat label="Clients" value={rows.length} hint={`${rows.filter((r) => r.status === 'active').length} active`} />
                <Stat label="MRR" value={f.money(rows.filter((r) => ['active', 'onboarding'].includes(r.status)).reduce((a, r) => a + r.mrr, 0))} />
                <Stat label="Avg lifetime value" value={f.money(rows.reduce((a, r) => a + r.lifetimeValue, 0) / Math.max(1, rows.length))} hint="paid invoices" />
                <Stat label="High churn risk" value={rows.filter((r) => r.churnRisk === 'high').length} tone={rows.some((r) => r.churnRisk === 'high') ? 'critical' : 'good'} />
              </Grid>
              <Card pad={false}>
                <DataTable data={rows} columns={COLS} search="Search clients" onRowClick={(r) => navigate({ to: '/admin/clients/$clientId', params: { clientId: r.id } })} initialSort={[{ id: 'mrr', desc: true }]} />
              </Card>
            </div>
          ) : (
            <Card>
              <Empty title="No clients yet" icon={<Users />}>
                Create a client here, or convert a lead from the <Link to="/admin/pipeline">sales pipeline</Link>.
              </Empty>
            </Card>
          )
        }
      </Async>
      <NewClientModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/* ------------------------------------------------------------------ detail */
function EditClient({ c, open, onClose }: { c: ClientRow; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/v1/admin/clients/${c.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
  })
  const fields = m.error instanceof ApiError ? m.error.fields : undefined
  return (
    <Modal open={open} onClose={onClose} title={`Edit ${c.company}`}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
          m.mutate({ ...d, nps: d.nps === '' ? null : Number(d.nps) })
        }}
      >
        <div className="form__row">
          <Field label="Company" error={fields?.company}><input name="company" defaultValue={c.company} required minLength={2} /></Field>
          <Field label="Industry"><input name="industry" defaultValue={c.industry} /></Field>
        </div>
        <div className="form__row">
          <Field label="Contact name" error={fields?.contactName}><input name="contactName" defaultValue={c.contactName} required minLength={2} /></Field>
          <Field label="Contact email" error={fields?.email}><input name="email" type="email" defaultValue={c.email} required /></Field>
        </div>
        <div className="form__row">
          <Field label="Plan" hint="Sets MRR and included hours"><select name="plan" defaultValue={c.plan}><option>Essentials</option><option>Growth</option><option>Scale</option></select></Field>
          <Field label="Status"><select name="status" defaultValue={c.status}><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="paused">Paused</option><option value="churned">Churned</option></select></Field>
        </div>
        <div className="form__row">
          <Field label="Renewal date"><input type="date" name="renewalDate" defaultValue={c.renewalDate ?? ''} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={c.phone} /></Field>
          <Field label="NPS (0–10)" hint="From your last survey" error={fields?.nps}><input type="number" name="nps" min={0} max={10} defaultValue={c.nps ?? ''} /></Field>
        </div>
        <Field label="Private notes" hint="Only visible to the studio"><textarea name="notes" rows={4} defaultValue={c.notes} /></Field>
        {m.isError && !fields && <ErrorBox error={m.error} />}
        <div className="row end gap-s"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={m.isPending}>Save</Button></div>
      </form>
    </Modal>
  )
}

function PortalUsers({ clientId, users }: { clientId: string; users: User[] }) {
  const qc = useQueryClient()
  const [invite, setInvite] = useState<Invite | null>(null)
  const m = useMutation({
    mutationFn: (userId?: string) => post<{ invite: Invite; user: User }>(`/v1/admin/clients/${clientId}/invite`, userId ? { userId } : {}),
    onSuccess: (r) => {
      setInvite(r.invite)
      qc.invalidateQueries({ queryKey: ['admin', 'client', clientId] })
    },
  })
  return (
    <>
      {users.length ? (
        <ul className="feed">
          {users.map((u) => (
            <li key={u.id}>
              <strong>{u.name}</strong>
              <span className="muted small">{u.email} · {u.active ? `last sign-in ${f.ago(u.lastLoginAt)}` : 'invite not accepted yet'}</span>
              <Button size="sm" icon={<KeyRound />} onClick={() => m.mutate(u.id)} disabled={m.isPending} title={u.active ? 'Issue a link that resets their password' : 'Issue a fresh invite link'}>
                {u.active ? 'Reset link' : 'New invite'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="row between wrap gap-s">
          <p className="muted small">No portal login yet.</p>
          <Button size="sm" icon={<KeyRound />} onClick={() => m.mutate(undefined)} disabled={m.isPending}>Invite to portal</Button>
        </div>
      )}
      {m.isError && <ErrorBox error={m.error} />}
      <Modal open={Boolean(invite)} onClose={() => setInvite(null)} title="Portal invite">
        {invite && <InviteLink invite={invite} />}
      </Modal>
    </>
  )
}

export function AdminClientPage() {
  const { clientId } = useParams({ strict: false }) as { clientId: string }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'overview' | 'sites' | 'projects' | 'support' | 'billing'>('overview')
  const [edit, setEdit] = useState(false)
  const [inv, setInv] = useState<Invoice | null>(null)
  const q = useQuery({ queryKey: ['admin', 'client', clientId], queryFn: () => get<ClientDetail>(`/v1/admin/clients/${clientId}`) })
  const viewAs = useMutation({
    mutationFn: () => post<SessionResponse>(`/v1/admin/clients/${clientId}/impersonate`),
    onSuccess: (s) => {
      session.impersonate(s)
      qc.clear()
      navigate({ to: '/portal' })
    },
  })
  return (
    <>
      <Link to="/admin/clients" className="back"><ArrowLeft /> All clients</Link>
      <Async q={q}>
        {(d) => (
          <>
            <PageHeader
              eyebrow={`${d.row.industry || 'Client'} · since ${f.date(d.client.since)}`}
              title={d.client.company}
              sub={<>{d.client.contactName} · <a href={`mailto:${d.client.email}`}>{d.client.email}</a>{d.client.phone && ` · ${d.client.phone}`}</>}
              actions={
                <>
                  <StatePill value={d.client.status} />
                  <StatePill value={`${d.row.churnRisk}_risk`} label={`${d.row.churnRisk} churn risk`} />
                  <Button icon={<Pencil />} onClick={() => setEdit(true)}>Edit</Button>
                  <Button variant="primary" icon={<Eye />} onClick={() => viewAs.mutate()} disabled={viewAs.isPending || !d.users.length} title={d.users.length ? 'See the portal exactly as this client does (one hour)' : 'Invite the client to the portal first'}>View as client</Button>
                </>
              }
            />
            {viewAs.isError && <ErrorBox error={viewAs.error} />}
            <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'sites', label: `Websites (${d.sites.length})` }, { value: 'projects', label: `Projects (${d.projects.length})` }, { value: 'support', label: `Support (${d.tickets.length})` }, { value: 'billing', label: 'Billing' }]} />

            {tab === 'overview' && (
              <div className="stack">
                <Grid cols={4}>
                  <Stat label="MRR" value={f.money(d.client.mrr)} hint={`${d.client.plan} plan`} />
                  <Stat label="Lifetime value" value={f.money(d.row.lifetimeValue)} hint="paid invoices" />
                  <Stat label="Hours this month" value={`${d.hours.used} / ${d.hours.included}`} tone={d.hours.used > d.hours.included ? 'serious' : undefined} hint={d.hours.used ? `effective ${f.money(d.client.mrr / d.hours.used)}/h` : undefined} />
                  <Stat label="Renewal" value={d.row.renewalDays == null ? '—' : `${d.row.renewalDays} days`} hint={f.date(d.client.renewalDate)} />
                </Grid>
                <Grid cols={4}>
                  <Stat label="Uptime (30 days)" value={f.pct(d.uptime30, 2)} hint={d.sites.length ? `${d.sites.length} website${d.sites.length === 1 ? '' : 's'}` : 'no websites yet'} />
                  <Stat label="Open requests" value={d.openTickets} />
                  <Stat label="Outstanding" value={f.money(d.balance.amount)} tone={d.balance.overdue ? 'critical' : undefined} hint={d.balance.overdue ? `${f.money(d.balance.overdue)} overdue` : undefined} />
                  <Stat label="NPS" value={d.client.nps ?? '—'} hint="last survey" />
                </Grid>
                <Grid cols={3}>
                  <Card className="hero-score hero-score--pair">
                    <ScoreRing score={d.scores.health} label="Health" size={104} />
                    <span title={VISIBILITY_HINT}><ScoreRing score={d.scores.visibility} label="Visibility" size={104} /></span>
                  </Card>
                  <Card title="Top issues to fix" className="span-2">
                    {d.sites.some((s) => s.lastAuditAt) ? <IssueList issues={d.topIssues} showSite={d.sites.length > 1} compact /> : <Empty title="No examinations yet">Re-scan a website to see its issues here.</Empty>}
                  </Card>
                </Grid>
                <Grid cols={2}>
                  <Card title="Private notes" actions={<Button size="sm" icon={<Pencil />} onClick={() => setEdit(true)}>Edit</Button>}>
                    <p className="pre">{d.client.notes || <span className="muted">No notes yet.</span>}</p>
                  </Card>
                  <Card title="Portal users" sub="Invites are links you send yourself">
                    <PortalUsers clientId={d.client.id} users={d.users} />
                  </Card>
                </Grid>
              </div>
            )}

            {tab === 'sites' && <SitesTable sites={d.sites} clientId={d.client.id} />}

            {tab === 'projects' && (
              <div className="stack">{d.projects.length ? d.projects.map((p) => <ProjectCard key={p.id} p={p} />) : <Card><Empty title="No projects">Create one from <Link to="/admin/projects">Projects</Link>.</Empty></Card>}</div>
            )}

            {tab === 'support' && (
              <Card pad={false}>
                {d.tickets.length ? (
                  <table className="table">
                    <thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Priority</th><th>SLA</th><th>Updated</th></tr></thead>
                    <tbody>
                      {d.tickets.map((t) => (
                        <tr key={t.id} className="is-link" onClick={() => navigate({ to: '/admin/support/$ticketId', params: { ticketId: t.id } })}>
                          <td className="muted">{t.number}</td><td><strong>{t.subject}</strong></td><td><StatePill value={t.status} /></td><td><StatePill value={t.priority} /></td><td><SlaPill t={t} /></td><td className="muted">{f.ago(t.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty title="No support requests">Requests the client sends from the portal appear here.</Empty>
                )}
              </Card>
            )}

            {tab === 'billing' && (
              <div className="stack">
                <Grid cols={3}>
                  <Stat label="Outstanding" value={f.money(d.billing.outstanding)} />
                  <Stat label="Overdue" value={f.money(d.billing.overdue)} tone={d.billing.overdue ? 'critical' : 'good'} />
                  <Stat label="Paid this year" value={f.money(d.billing.paidThisYear)} />
                </Grid>
                <Card pad={false}>
                  {d.billing.invoices.length ? (
                    <table className="table">
                      <thead><tr><th>Invoice</th><th>Description</th><th>Issued</th><th>Status</th><th className="num">Amount</th></tr></thead>
                      <tbody>
                        {d.billing.invoices.map((i) => (
                          <tr key={i.id} className="is-link" onClick={() => setInv(i)}><td><strong>{i.number}</strong></td><td className="muted">{i.items[0]?.description}</td><td>{f.date(i.issuedAt)}</td><td><StatePill value={i.status} /></td><td className="num">{f.money(i.amount)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty title="No invoices">Create one from <Link to="/admin/billing">Billing</Link>.</Empty>
                  )}
                </Card>
              </div>
            )}
            <EditClient c={{ ...d.row }} open={edit} onClose={() => setEdit(false)} />
            <InvoiceModal inv={inv} onClose={() => setInv(null)} company={d.client.company} />
          </>
        )}
      </Async>
    </>
  )
}

export function SitesTable({ sites, clientId }: { sites: Site[]; clientId?: string }) {
  const navigate = useNavigate()
  const [add, setAdd] = useState(false)
  const go = (id: string) => navigate({ to: '/admin/sites/$siteId', params: { siteId: id } })
  return (
    <Card pad={false} actions={clientId && <Button size="sm" icon={<Plus />} onClick={() => setAdd(true)}>Add website</Button>}>
      {sites.length ? (
        <div className="dt__scroll">
          <table className="table">
            <thead><tr><th>Website</th>{!clientId && <th>Client</th>}<th>Status</th><th className="num">Health</th><th className="num">Visibility</th><th className="num">Uptime 30d</th><th className="num">Response</th><th>SSL</th><th>Examined</th></tr></thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className="is-link" tabIndex={0} onClick={() => go(s.id)} onKeyDown={(e) => e.key === 'Enter' && go(s.id)}>
                  <td><strong>{s.name}</strong><div className="muted small">{s.host} · {s.platform} / {s.hosting}</div></td>
                  {!clientId && <td>{s.company}</td>}
                  <td><MonitorPill status={s.monitoring.status} />{s.incidents7d > 0 && <div className="small tone-text--warning">{s.incidents7d} incident(s) 7d</div>}</td>
                  <td className="num"><Pill tone={scoreTone(s.health)}>{s.health ?? '—'}</Pill></td>
                  <td className="num"><Pill tone={scoreTone(s.visibility)}>{s.visibility ?? '—'}</Pill></td>
                  <td className="num">{f.pct(s.uptime30, 2)}</td>
                  <td className="num">{s.avgResponseMs == null ? '—' : `${s.avgResponseMs} ms`}</td>
                  <td><Pill tone={s.sslValid == null ? 'neutral' : s.sslValid ? 'good' : 'critical'}>{s.sslValid == null ? '—' : s.sslValid ? 'Valid' : 'Failing'}</Pill></td>
                  <td className="muted">{f.ago(s.lastAuditAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No websites yet">{clientId ? 'Add the client’s website to start uptime monitoring and examinations.' : 'Websites are added from a client’s page; each one is monitored by Signal and examined by Vector.'}</Empty>
      )}
      {clientId && <AddSite clientId={clientId} open={add} onClose={() => setAdd(false)} />}
    </Card>
  )
}

function AddSite({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (body: Record<string, string>) => post<Site>('/v1/admin/sites', { ...body, clientId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
  })
  const fields = m.error instanceof ApiError ? m.error.fields : undefined
  return (
    <Modal open={open} onClose={onClose} title="Add website to monitoring">
      <form className="form" onSubmit={(e) => { e.preventDefault(); m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>) }}>
        <Field label="Name" error={fields?.name}><input name="name" required placeholder="Main website" /></Field>
        <Field label="Address" error={fields?.url} hint="Checked every 5 minutes by Signal"><input name="url" required placeholder="example.com" /></Field>
        <div className="form__row">
          <Field label="Platform"><input name="platform" placeholder="WordPress, Shopify, Next.js…" /></Field>
          <Field label="Hosting"><input name="hosting" placeholder="Vercel, WP Engine…" /></Field>
        </div>
        {m.isError && !fields && <ErrorBox error={m.error} />}
        <div className="row end gap-s"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={m.isPending}>{m.isPending ? 'Adding…' : 'Add website'}</Button></div>
      </form>
    </Modal>
  )
}
