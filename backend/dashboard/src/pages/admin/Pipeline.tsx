import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ExternalLink, Inbox, Radar, UserPlus } from 'lucide-react'
import { get, patch, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { CreateClientResponse, Invite, PlanName, Prospect, Stage } from '../../lib/types'
import { InviteLink } from '../../components/shared'
import { Async, Button, Empty, ErrorBox, Field, Grid, Modal, PageHeader, Pill, scoreTone, Segmented, Stat } from '../../components/ui'

const STAGES: { key: Stage; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'call_booked', label: 'Call booked' },
  { key: 'proposal', label: 'Proposal sent' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]
const PLANS: PlanName[] = ['Essentials', 'Growth', 'Scale']

function ProspectModal({ p, onClose }: { p: Prospect | null; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PlanName>('Growth')
  const [portal, setPortal] = useState(false)
  const [done, setDone] = useState<{ clientId: string; invite: Invite | null; warning: string | null } | null>(null)
  const save = useMutation({
    mutationFn: (body: { stage: Stage; value: number; notes: string }) => patch<Prospect>(`/v1/admin/prospects/${p!.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
  })
  const convert = useMutation({
    mutationFn: () => post<CreateClientResponse>(`/v1/admin/prospects/${p!.id}/convert`, { plan, portalAccess: portal }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      if (r.invite || r.warning) setDone({ clientId: r.client.id, invite: r.invite, warning: r.warning })
      else {
        onClose()
        navigate({ to: '/admin/clients/$clientId', params: { clientId: r.client.id } })
      }
    },
  })
  const close = () => {
    setDone(null)
    save.reset()
    convert.reset()
    onClose()
  }
  return (
    <Modal open={Boolean(p)} onClose={close} title={done ? 'Client created' : p?.company ?? ''}>
      {p && done && (
        <div className="form">
          {done.warning && <div className="error-box" role="status"><span>{done.warning}</span></div>}
          {done.invite && <InviteLink invite={done.invite} />}
          <div className="row end">
            <Button variant="primary" onClick={() => { const id = done.clientId; close(); navigate({ to: '/admin/clients/$clientId', params: { clientId: id } }) }}>Open client</Button>
          </div>
        </div>
      )}
      {p && !done && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            save.mutate({ stage: fd.get('stage') as Stage, value: Number(fd.get('value') || 0), notes: String(fd.get('notes') || '') })
          }}
        >
          <div className="muted small">
            <Pill tone={p.kind === 'contact' ? 'signal' : 'info'}>{p.source}</Pill> {p.name} · <a href={`mailto:${p.email}`}>{p.email}</a>
            {p.website && <> · <a href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{p.website.replace(/^https?:\/\//, '')} <ExternalLink className="inline-icon" /></a></>}
            {' '}· {f.ago(p.createdAt)}
          </div>
          <blockquote className="quote pre">{p.message || 'No message.'}</blockquote>
          <ul className="kv">
            {p.details.projectType && <li><span>Project type</span><span>{p.details.projectType}</span></li>}
            {p.details.budgetRange && <li><span>Budget</span><span>{p.details.budgetRange}</span></li>}
            {p.details.timeline && <li><span>Timeline</span><span>{p.details.timeline}</span></li>}
            {p.kind === 'report' && (
              <li>
                <span>Vector examination</span>
                <span className="row gap-s">
                  <Pill tone={scoreTone(p.healthScore)}>Health {p.healthScore ?? '—'}</Pill>
                  <Pill tone={scoreTone(p.visibility)}>Visibility {p.visibility ?? '—'}</Pill>
                  {p.auditId && <Link className="link" to="/admin/audit" search={{ id: p.auditId, url: undefined }}>Open</Link>}
                </span>
              </li>
            )}
            {p.details.reportStatus && <li><span>Report email</span><span className="tag">{p.details.reportStatus}</span></li>}
          </ul>
          <div className="form__row">
            <Field label="Stage">
              <select name="stage" defaultValue={p.stage}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            </Field>
            <Field label="Deal value (USD)">
              <input name="value" type="number" min={0} step={100} defaultValue={p.value} />
            </Field>
          </div>
          <Field label="Notes" hint="Only visible to the studio">
            <textarea name="notes" rows={3} defaultValue={p.notes} placeholder="Call notes, budget, decision maker…" />
          </Field>
          {(save.isError || convert.isError) && <ErrorBox error={save.error ?? convert.error} />}
          <div className="row between wrap gap-s">
            {!p.clientId ? (
              <div className="row gap-s wrap">
                <select value={plan} onChange={(e) => setPlan(e.target.value as PlanName)} aria-label="Plan for the new client">
                  {PLANS.map((x) => <option key={x}>{x}</option>)}
                </select>
                <label className="check-row"><input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} /> Invite to portal</label>
                <Button icon={<UserPlus />} disabled={convert.isPending} onClick={() => convert.mutate()}>Convert to client</Button>
              </div>
            ) : (
              <Link className="link" to="/admin/clients/$clientId" params={{ clientId: p.clientId }}>Converted — open client</Link>
            )}
            <Button variant="primary" type="submit" disabled={save.isPending}>Save</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default function AdminPipelinePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState<Prospect | null>(null)
  const [kind, setKind] = useState<'all' | 'contact' | 'report'>('all')
  const q = useQuery({ queryKey: ['admin', 'prospects'], queryFn: () => get<Prospect[]>('/v1/admin/prospects') })
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => patch(`/v1/admin/prospects/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
  return (
    <>
      <PageHeader
        title="Sales pipeline"
        sub="Project inquiries from the site's contact form and people who asked for an emailed Vector report. Move a lead along from its card."
        actions={<Segmented label="Lead source" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'contact', label: 'Inquiries' }, { value: 'report', label: 'Vector reports' }]} />}
      />
      {move.isError && <ErrorBox error={move.error} />}
      <Async q={q}>
        {(all) => {
          const list = kind === 'all' ? all : all.filter((p) => p.kind === kind)
          const open_ = list.filter((p) => !['won', 'lost'].includes(p.stage))
          const won = list.filter((p) => p.stage === 'won')
          const lost = list.filter((p) => p.stage === 'lost')
          if (!all.length) {
            return (
              <Empty title="No leads yet" icon={<Inbox />}>
                Leads appear here when someone sends the project form on the site or requests a full Vector report.
              </Empty>
            )
          }
          return (
            <div className="stack">
              <Grid cols={4}>
                <Stat label="Open leads" value={open_.length} hint={f.money(open_.reduce((a, p) => a + p.value, 0))} />
                <Stat label="New this week" value={list.filter((p) => Date.now() - new Date(p.createdAt).getTime() < 7 * 864e5).length} />
                <Stat label="Won" value={f.money(won.reduce((a, p) => a + p.value, 0))} hint={`${won.length} deal${won.length === 1 ? '' : 's'}`} tone={won.length ? 'good' : undefined} />
                <Stat label="Win rate" value={won.length + lost.length ? `${Math.round((won.length / (won.length + lost.length)) * 100)}%` : '—'} />
              </Grid>
              <div className="kanban">
                {STAGES.map((s) => {
                  const items = list.filter((p) => p.stage === s.key)
                  return (
                    <section className="kanban__col" key={s.key} aria-label={s.label}>
                      <header>
                        <strong>{s.label}</strong>
                        <span className="muted small">{items.length} · {f.moneyShort(items.reduce((a, p) => a + p.value, 0))}</span>
                      </header>
                      {items.map((p) => (
                        <article key={p.id} className="deal" onClick={() => setOpen(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(p)}>
                          <div className="row between">
                            <strong>{p.company}</strong>
                            <span className="small">{p.value ? f.moneyShort(p.value) : '—'}</span>
                          </div>
                          <div className="muted small">{p.name} · {f.ago(p.createdAt)}</div>
                          <p className="small clamp">{p.message || p.details.projectType || ''}</p>
                          <div className="row gap-s wrap">
                            <span className="tag">{p.kind === 'contact' ? p.details.projectType || 'Inquiry' : 'Vector report'}</span>
                            {p.kind === 'report' && <Pill tone={scoreTone(p.healthScore)}>Health {p.healthScore ?? '—'}</Pill>}
                          </div>
                          <div className="deal__actions" onClick={(e) => e.stopPropagation()}>
                            <select value={p.stage} aria-label={`Stage for ${p.company}`} onChange={(e) => move.mutate({ id: p.id, stage: e.target.value })}>
                              {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                            {p.website && (
                              <button type="button" className="icon-btn" title="Examine their website" aria-label={`Examine ${p.website}`} onClick={() => navigate({ to: '/admin/audit', search: { url: p.website, id: undefined } })}>
                                <Radar />
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </section>
                  )
                })}
              </div>
            </div>
          )
        }}
      </Async>
      <ProspectModal p={open} onClose={() => setOpen(null)} />
    </>
  )
}
