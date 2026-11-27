import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { del, get, patch, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { AdminWork, ClientRow, Milestone, Project, Ticket, WorkItem } from '../../lib/types'
import { DataTable } from '../../components/DataTable'
import { MonthSelect, lastMonths, ProjectCard, SlaPill, Thread } from '../../components/shared'
import { Async, Button, Card, Empty, ErrorBox, Field, Grid, Meter, Modal, PageHeader, Segmented, Stat, StatePill } from '../../components/ui'

export function useClients() {
  return useQuery({ queryKey: ['admin', 'clients'], queryFn: () => get<ClientRow[]>('/v1/admin/clients') })
}

export function ClientSelect({ name = 'clientId', defaultValue }: { name?: string; defaultValue?: string }) {
  const c = useClients()
  if (c.data && !c.data.length) {
    return (
      <select name={name} required disabled defaultValue="">
        <option value="">Add a client first (Clients → New client)</option>
      </select>
    )
  }
  return (
    <select name={name} required defaultValue={defaultValue ?? ''}>
      <option value="">Choose a client…</option>
      {c.data?.map((x) => <option key={x.id} value={x.id}>{x.company}</option>)}
    </select>
  )
}

/* ------------------------------------------------------------------ projects */
export function AdminProjectsPage() {
  const qc = useQueryClient()
  const [show, setShow] = useState<'active' | 'all'>('active')
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState<Project | null>(null)
  const q = useQuery({ queryKey: ['admin', 'projects'], queryFn: () => get<Project[]>('/v1/admin/projects') })
  const done = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const advance = useMutation({ mutationFn: (id: string) => post(`/v1/admin/projects/${id}/advance`), onSuccess: done })
  const health = useMutation({ mutationFn: ({ id, health }: { id: string; health: string }) => patch(`/v1/admin/projects/${id}`, { health }), onSuccess: done })
  const ms = useMutation({ mutationFn: ({ p, m, status }: { p: string; m: string; status: string }) => patch(`/v1/admin/projects/${p}/milestones/${m}`, { status }), onSuccess: done })
  const create = useMutation({ mutationFn: (b: Record<string, unknown>) => post('/v1/admin/projects', b), onSuccess: () => { done(); setCreating(false) } })
  const addMs = useMutation({ mutationFn: (b: Record<string, unknown>) => post(`/v1/admin/projects/${adding!.id}/milestones`, b), onSuccess: () => { done(); setAdding(null) } })
  const next = (m: Milestone): string | null => ({ upcoming: 'in_progress', in_progress: 'awaiting_approval', awaiting_approval: null, done: null })[m.status] ?? null

  return (
    <>
      <PageHeader
        title="Projects"
        sub="Every build and programme: phase, milestones, client approvals, budget and hours."
        actions={<><Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} /><Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>New project</Button></>}
      />
      {(advance.isError || ms.isError) && <ErrorBox error={advance.error ?? ms.error} />}
      <Async q={q}>
        {(list) => {
          const active = list.filter((p) => p.health !== 'complete')
          if (!list.length) {
            return (
              <Card>
                <Empty title="No projects yet" icon={<FolderKanban />}>Create a project for a client to track its phase, milestones, approvals, budget and hours.</Empty>
              </Card>
            )
          }
          return (
            <div className="stack">
              <Grid cols={4}>
                <Stat label="Active projects" value={active.length} />
                <Stat label="At risk / late" value={active.filter((p) => p.health !== 'on_track').length} tone={active.some((p) => p.health !== 'on_track') ? 'warning' : 'good'} />
                <Stat label="Awaiting client approval" value={list.flatMap((p) => p.milestones).filter((m) => m.status === 'awaiting_approval').length} />
                <Stat label="Project value in flight" value={f.money(active.reduce((a, p) => a + p.budget, 0))} hint={`${active.reduce((a, p) => a + p.hoursLogged, 0)} of ${active.reduce((a, p) => a + p.hoursBudget, 0)} h used`} />
              </Grid>
              {show === 'active' && !active.length && <Card><Empty title="No active projects">Every project is complete. Switch to All to see them.</Empty></Card>}
              {(show === 'active' ? active : list).map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  headerExtra={
                    <>
                      <select value={p.health} aria-label="Project health" onChange={(e) => health.mutate({ id: p.id, health: e.target.value })}>
                        <option value="on_track">On track</option><option value="at_risk">At risk</option><option value="late">Late</option><option value="complete">Complete</option>
                      </select>
                      <Button size="sm" icon={<Plus />} onClick={() => setAdding(p)}>Milestone</Button>
                      {p.phase !== 'maintenance' && <Button size="sm" icon={<ChevronRight />} onClick={() => advance.mutate(p.id)} disabled={advance.isPending}>Next phase</Button>}
                    </>
                  }
                  milestoneAction={(m) => {
                    const n = next(m)
                    if (m.status === 'awaiting_approval') return <span className="muted small">Client to approve</span>
                    return n ? <Button size="sm" onClick={() => ms.mutate({ p: p.id, m: m.id, status: n })}>{n === 'in_progress' ? 'Start' : 'Request approval'}</Button> : null
                  }}
                />
              ))}
            </div>
          )
        }}
      </Async>
      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <form className="form" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; create.mutate({ ...d, budget: Number(d.budget), hoursBudget: Number(d.hoursBudget) }) }}>
          <Field label="Client"><ClientSelect /></Field>
          <div className="form__row">
            <Field label="Project name"><input name="name" required /></Field>
            <Field label="Type"><select name="type"><option>Rebuild</option><option>Feature</option><option>Optimisation</option><option>GEO programme</option><option>SEO programme</option><option>Automation</option><option>Custom system</option></select></Field>
          </div>
          <div className="form__row">
            <Field label="Due date"><input type="date" name="dueDate" required /></Field>
            <Field label="Budget (USD)"><input type="number" name="budget" min={0} step={100} required /></Field>
            <Field label="Hours budget"><input type="number" name="hoursBudget" min={0} required /></Field>
          </div>
          {create.isError && <ErrorBox error={create.error} />}
          <div className="row end gap-s"><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" type="submit">Create project</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(adding)} onClose={() => setAdding(null)} title={`Add milestone — ${adding?.name ?? ''}`}>
        <form className="form" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; addMs.mutate({ title: d.title, dueDate: d.dueDate, needsApproval: d.needsApproval === 'on' }) }}>
          <Field label="Milestone"><input name="title" required minLength={2} placeholder="e.g. Homepage design" /></Field>
          <Field label="Due date"><input type="date" name="dueDate" required /></Field>
          <label className="check-row"><input type="checkbox" name="needsApproval" /> The client signs this off in the portal</label>
          {addMs.isError && <ErrorBox error={addMs.error} />}
          <div className="row end gap-s"><Button onClick={() => setAdding(null)}>Cancel</Button><Button variant="primary" type="submit">Add</Button></div>
        </form>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------------ time & work log */
const wcol = createColumnHelper<WorkItem>()

export function AdminWorkPage() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(f.thisMonth())
  const [logging, setLogging] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'work', month], queryFn: () => get<AdminWork>(`/v1/admin/worklog?month=${month}`), placeholderData: (p) => p })
  const add = useMutation({ mutationFn: (b: Record<string, unknown>) => post('/v1/admin/worklog', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); setLogging(false) } })
  const remove = useMutation({ mutationFn: (id: string) => del(`/v1/admin/worklog/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) })
  const WCOLS = [
    wcol.accessor('date', { header: 'Date', cell: (c) => f.date(c.getValue()) }),
    wcol.accessor('company', { header: 'Client' }),
    wcol.accessor('title', { header: 'Task', cell: (c) => <strong>{c.getValue()}</strong> }),
    wcol.accessor('category', { header: 'Type', cell: (c) => <span className="tag">{c.getValue()}</span> }),
    wcol.accessor('by', { header: 'By' }),
    wcol.accessor('minutes', { header: 'Time', meta: { align: 'right' }, cell: (c) => f.minutes(c.getValue()) }),
    wcol.display({
      id: 'del',
      header: '',
      cell: (c) => (
        <button type="button" className="icon-btn" aria-label={`Delete entry ${c.row.original.title}`} title="Delete entry" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete "${c.row.original.title}"?`)) remove.mutate(c.row.original.id) }}>
          <Trash2 />
        </button>
      ),
    }),
  ]
  return (
    <>
      <PageHeader
        title="Time & work log"
        sub="Log care work against each client's plan. Clients see these entries in their portal."
        actions={<><MonthSelect value={month} months={lastMonths(6)} onChange={setMonth} /><Button variant="primary" icon={<Plus />} onClick={() => setLogging(true)}>Log time</Button></>}
      />
      <Async q={q}>
        {(d) => {
          const used = d.perClient.reduce((a, c) => a + c.hoursUsed, 0)
          const inc = d.perClient.reduce((a, c) => a + c.hoursIncluded, 0)
          const over = d.perClient.filter((c) => c.hoursUsed > c.hoursIncluded)
          return (
            <div className="stack">
              <Grid cols={3}>
                <Stat label="Hours logged" value={f.hours(used)} hint={`${inc} h sold in retainers`} />
                <Stat label="Retainer utilisation" value={`${inc ? Math.round((used / inc) * 100) : 0}%`} />
                <Stat label="Over-serviced clients" value={over.length} hint={over.map((c) => c.company).join(', ') || 'none'} tone={over.length ? 'serious' : 'good'} />
              </Grid>
              <Card title="Hours by client" sub="Effective hourly rate = plan price ÷ hours worked">
                {d.perClient.length ? (
                  <ul className="util">
                    {d.perClient.map((c) => (
                      <li key={c.clientId}>
                        <Link to="/admin/clients/$clientId" params={{ clientId: c.clientId }}><strong>{c.company}</strong></Link>
                        <span className="muted small">{c.plan}</span>
                        <Meter value={c.hoursUsed} max={c.hoursIncluded} label={<>{c.hoursUsed} / {c.hoursIncluded} h</>} />
                        <span className="num small">{c.effectiveRate ? `${f.money(c.effectiveRate)}/h` : '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No clients yet">Retainer hours per client appear here once you add clients.</Empty>
                )}
              </Card>
              {remove.isError && <ErrorBox error={remove.error} />}
              <Card title="Entries" pad={false}>
                <DataTable data={d.items} columns={WCOLS} search="Search entries" pageSize={15} empty={`No work logged in ${f.monthLabel(d.month)}`} />
              </Card>
            </div>
          )
        }}
      </Async>
      <Modal open={logging} onClose={() => setLogging(false)} title="Log time">
        <form className="form" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; add.mutate({ ...d, minutes: Number(d.minutes) }) }}>
          <Field label="Client"><ClientSelect /></Field>
          <Field label="What did you do?"><input name="title" required placeholder="e.g. Plugin updates and backup test" /></Field>
          <div className="form__row">
            <Field label="Type"><select name="category">{['maintenance', 'security', 'seo', 'aeo', 'geo', 'performance', 'content', 'feature'].map((c) => <option key={c} value={c}>{f.titleCase(c)}</option>)}</select></Field>
            <Field label="Date"><input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <Field label="Minutes"><input type="number" name="minutes" min={5} step={5} defaultValue={30} required /></Field>
          </div>
          {add.isError && <ErrorBox error={add.error} />}
          <div className="row end gap-s"><Button onClick={() => setLogging(false)}>Cancel</Button><Button variant="primary" type="submit">Save entry</Button></div>
        </form>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------------ support desk */
const tcol = createColumnHelper<Ticket>()
const TCOLS = [
  tcol.accessor('number', { header: '#', cell: (c) => <span className="muted">{c.getValue()}</span> }),
  tcol.accessor('subject', { header: 'Subject', cell: (c) => <><strong>{c.getValue()}</strong><div className="muted small clamp">{c.row.original.lastMessage}</div></> }),
  tcol.accessor('company', { header: 'Client' }),
  tcol.accessor('category', { header: 'Type', cell: (c) => <span className="tag">{c.getValue()}</span> }),
  tcol.accessor('priority', { header: 'Priority', cell: (c) => <StatePill value={c.getValue()} /> }),
  tcol.accessor('status', { header: 'Status', cell: (c) => <StatePill value={c.getValue()} /> }),
  tcol.accessor('slaState', { header: 'SLA', cell: (c) => <SlaPill t={c.row.original} /> }),
  tcol.accessor('updatedAt', { header: 'Updated', cell: (c) => f.ago(c.getValue()) }),
]

export function AdminSupportPage() {
  const navigate = useNavigate()
  const [show, setShow] = useState<'open' | 'all'>('open')
  const q = useQuery({ queryKey: ['admin', 'tickets'], queryFn: () => get<Ticket[]>('/v1/admin/tickets') })
  return (
    <>
      <PageHeader title="Support desk" sub="Client requests with response-time targets: urgent 2 h · high 8 h · normal 24 h · low 72 h." actions={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />} />
      <Async q={q}>
        {(list) => {
          const open = list.filter((t) => t.status !== 'resolved')
          const answered = list.filter((t) => t.firstResponseHours != null)
          return (
            <div className="stack">
              <Grid cols={4}>
                <Stat label="Open" value={open.length} />
                <Stat label="SLA breached" value={open.filter((t) => t.slaState === 'breached').length} tone={open.some((t) => t.slaState === 'breached') ? 'critical' : 'good'} />
                <Stat label="Waiting on client" value={open.filter((t) => t.status === 'waiting').length} />
                <Stat label="Avg first response" value={answered.length ? `${(answered.reduce((a, t) => a + (t.firstResponseHours ?? 0), 0) / answered.length).toFixed(1)} h` : '—'} />
              </Grid>
              <Card pad={false}>
                <DataTable
                  data={show === 'open' ? open : list}
                  columns={TCOLS}
                  search="Search tickets"
                  empty={list.length ? 'No open tickets' : 'No support requests yet — clients send them from the portal'}
                  onRowClick={(t) => navigate({ to: '/admin/support/$ticketId', params: { ticketId: t.id } })}
                />
              </Card>
            </div>
          )
        }}
      </Async>
    </>
  )
}

export function AdminTicketPage() {
  const { ticketId } = useParams({ strict: false }) as { ticketId: string }
  const qc = useQueryClient()
  const key = ['admin', 'ticket', ticketId]
  const q = useQuery({ queryKey: key, queryFn: () => get<Ticket>(`/v1/admin/tickets/${ticketId}`) })
  const onDone = (t: Ticket) => { qc.setQueryData(key, t); qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }); qc.invalidateQueries({ queryKey: ['admin', 'overview'] }) }
  const reply = useMutation({ mutationFn: (body: string) => post<Ticket>(`/v1/admin/tickets/${ticketId}/messages`, { body }), onSuccess: onDone })
  const update = useMutation({ mutationFn: (b: Record<string, string>) => patch<Ticket>(`/v1/admin/tickets/${ticketId}`, b), onSuccess: onDone })
  return (
    <>
      <Link to="/admin/support" className="back"><ArrowLeft /> Support desk</Link>
      <Async q={q}>
        {(t) => (
          <>
            <PageHeader eyebrow={`#${t.number} · ${t.company} · opened ${f.dateTime(t.createdAt)}`} title={t.subject} actions={<SlaPill t={t} />} />
            <Grid cols={3}>
              <Card className="span-2">
                <Thread messages={t.messages ?? []} onSend={(b) => reply.mutate(b)} sending={reply.isPending} placeholder="Reply to the client…" />
                {reply.isError && <ErrorBox error={reply.error} />}
              </Card>
              <Card title="Ticket">
                <div className="form">
                  <Field label="Status">
                    <select value={t.status} onChange={(e) => update.mutate({ status: e.target.value })}>
                      <option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting on client</option><option value="resolved">Resolved</option>
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
                      <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </Field>
                  <ul className="kv">
                    <li><span>Response due</span><span>{f.dateTime(t.slaDueAt)}</span></li>
                    <li><span>First reply</span><span>{t.firstResponseHours == null ? 'Not yet' : `${t.firstResponseHours} h`}</span></li>
                    <li><span>Type</span><span className="tag">{t.category}</span></li>
                  </ul>
                  <Link className="link" to="/admin/clients/$clientId" params={{ clientId: t.clientId }}>Open client</Link>
                </div>
              </Card>
            </Grid>
          </>
        )}
      </Async>
    </>
  )
}

