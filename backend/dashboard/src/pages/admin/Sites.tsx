import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Radar, RefreshCw, Trash2 } from 'lucide-react'
import { ApiError, del, get, patch, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { Audit, AuditListItem, AuditReport, Site, SiteReport } from '../../lib/types'
import { AuditProgress, isRunning, SiteHealthView, VectorReportView } from '../../components/reports'
import { Async, Button, Card, Empty, ErrorBox, Field, Grid, Modal, PageHeader, Pill, scoreTone, Stat, StatePill } from '../../components/ui'
import { SitesTable } from './Clients'

const POLL_MS = 2000

export function AdminSitesPage() {
  const q = useQuery({ queryKey: ['admin', 'sites'], queryFn: () => get<Site[]>('/v1/admin/sites') })
  return (
    <>
      <PageHeader title="Websites & monitoring" sub="Every client website: uptime and response time from Signal (checked every 5 minutes), health and visibility from Vector." />
      <Async q={q}>
        {(sites) => (
          <div className="stack">
            <Grid cols={4}>
              <Stat label="Websites" value={sites.length} hint={`${sites.filter((s) => s.monitoring.status !== 'not_monitored').length} monitored`} />
              <Stat label="Down now" value={sites.filter((s) => s.monitoring.status === 'unavailable').length} tone={sites.some((s) => s.monitoring.status === 'unavailable') ? 'critical' : undefined} />
              <Stat label="Incidents (7 days)" value={sites.reduce((a, s) => a + s.incidents7d, 0)} tone={sites.some((s) => s.incidents7d) ? 'warning' : undefined} />
              <Stat label="Not examined yet" value={sites.filter((s) => !s.lastAuditAt).length} hint="open a site and re-scan it" />
            </Grid>
            <SitesTable sites={sites} />
          </div>
        )}
      </Async>
    </>
  )
}

function EditSite({ site, open, onClose }: { site: Site; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const save = useMutation({ mutationFn: (b: Record<string, string>) => patch<Site>(`/v1/admin/sites/${site.id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); onClose() } })
  const remove = useMutation({
    mutationFn: () => del(`/v1/admin/sites/${site.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
      navigate({ to: '/admin/clients/$clientId', params: { clientId: site.clientId } })
    },
  })
  return (
    <Modal open={open} onClose={() => { setConfirm(false); onClose() }} title={`Edit ${site.name}`}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>) }}>
        <Field label="Name"><input name="name" defaultValue={site.name} required /></Field>
        <div className="form__row">
          <Field label="Platform"><input name="platform" defaultValue={site.platform} /></Field>
          <Field label="Hosting"><input name="hosting" defaultValue={site.hosting} /></Field>
        </div>
        <Field label="Notes" hint="Only visible to the studio"><textarea name="notes" rows={3} defaultValue={site.notes} /></Field>
        {(save.isError || remove.isError) && <ErrorBox error={save.error ?? remove.error} />}
        <div className="row between gap-s wrap">
          {confirm ? (
            <span className="row gap-s">
              <span className="small">Stop monitoring and remove this site? Past examinations are kept.</span>
              <Button variant="danger" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>Remove</Button>
              <Button size="sm" onClick={() => setConfirm(false)}>Keep</Button>
            </span>
          ) : (
            <Button variant="quiet" icon={<Trash2 />} onClick={() => setConfirm(true)}>Remove website</Button>
          )}
          <Button variant="primary" type="submit" disabled={save.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

export function AdminSitePage() {
  const { siteId } = useParams({ strict: false }) as { siteId: string }
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const key = ['admin', 'site', siteId, 'health']
  const health = useQuery({
    queryKey: key,
    queryFn: () => get<SiteReport>(`/v1/admin/sites/${siteId}/health`),
    // While an examination runs, poll until it completes or fails.
    refetchInterval: (q) => (q.state.data?.pendingAudit ? POLL_MS : false),
  })
  const scan = useMutation({
    mutationFn: () => post<Audit>(`/v1/admin/sites/${siteId}/scan`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
  const s = health.data?.site
  const running = Boolean(health.data?.pendingAudit)
  // An examination just finished: the lists elsewhere show the new scores.
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ['admin', 'sites'] })
      qc.invalidateQueries({ queryKey: ['admin', 'clients'] })
    }
    wasRunning.current = running
  }, [running, qc])
  return (
    <>
      <Link to="/admin/sites" className="back"><ArrowLeft /> All websites</Link>
      <PageHeader
        eyebrow={s ? `${s.company} · ${s.platform} · ${s.hosting}` : undefined}
        title={s?.name ?? 'Website'}
        sub={s && <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
        actions={
          <>
            {s && <Link className="btn btn--ghost" to="/admin/clients/$clientId" params={{ clientId: s.clientId }}>Open client</Link>}
            {s && <Button icon={<Pencil />} onClick={() => setEdit(true)}>Edit</Button>}
            <Button variant="primary" icon={<RefreshCw className={running || scan.isPending ? 'spin' : ''} />} onClick={() => scan.mutate()} disabled={scan.isPending || running}>
              {running ? 'Examining…' : 'Re-scan with Vector'}
            </Button>
          </>
        }
      />
      {scan.isError && <ErrorBox error={scan.error} />}
      <Async q={health}>{(d) => <SiteHealthView data={d} scanning={scan.isPending} />}</Async>
      {s && <EditSite site={s} open={edit} onClose={() => setEdit(false)} />}
    </>
  )
}

/* ------------------------------------------------------------------ audit */
export function AdminAuditPage() {
  const search = useSearch({ strict: false }) as { url?: string; id?: string }
  const navigate = useNavigate()
  const [url, setUrl] = useState(search.url ?? '')
  const openId = search.id ?? null
  const qc = useQueryClient()
  const recent = useQuery({ queryKey: ['admin', 'audits'], queryFn: () => get<AuditListItem[]>('/v1/admin/audits') })
  const detail = useQuery({
    queryKey: ['admin', 'audit', openId],
    queryFn: () => get<AuditReport>(`/v1/admin/audits/${openId}`),
    enabled: Boolean(openId),
    refetchInterval: (q) => (isRunning(q.state.data?.audit) ? POLL_MS : false),
  })
  const open = (id: string) => navigate({ to: '/admin/audit', search: { id, url: undefined } })
  const run = useMutation({
    mutationFn: (u: string) => post<Audit>('/v1/admin/audits', { url: u }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['admin', 'audits'] })
      qc.setQueryData(['admin', 'audit', a.id], { audit: a, results: [], issues: [], prescription: [] } satisfies AuditReport)
      open(a.id)
    },
  })
  const urlError = run.error instanceof ApiError ? run.error.fields?.url : undefined
  // When the open examination finishes, refresh the list so its row shows the scores.
  const status = detail.data?.audit.status
  useEffect(() => {
    if (status === 'completed' || status === 'failed') qc.invalidateQueries({ queryKey: ['admin', 'audits'] })
  }, [status, qc])
  return (
    <>
      <PageHeader title="Website audit" sub="Examine any public website with Vector — before a sales call, or to show a prospect exactly where they stand. Studio examinations stay off the public site's recent list." />
      <Card>
        <form className="audit-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) run.mutate(url.trim()) }}>
          <Radar aria-hidden="true" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://prospect-website.com" aria-label="Website to examine" inputMode="url" autoCapitalize="none" spellCheck={false} />
          <Button variant="primary" type="submit" disabled={run.isPending || !url.trim()}>{run.isPending ? 'Starting…' : 'Examine'}</Button>
        </form>
        <p className="muted small">
          Vector checks technical structure, SEO, performance, accessibility, security headers, links, content and AI visibility, then scores each category and writes the fix list. Takes 10–30 seconds.
        </p>
        {urlError && <p className="field__hint tone-text--critical">{urlError}</p>}
      </Card>
      {run.isError && !urlError && <ErrorBox error={run.error} />}
      {openId && (
        <Async q={detail}>
          {(r) =>
            isRunning(r.audit) ? (
              <Card title="Examination in progress"><AuditProgress audit={r.audit} /></Card>
            ) : r.audit.status === 'failed' ? (
              <ErrorBox error={new Error(`The examination of ${r.audit.url} failed: ${r.audit.error_message ?? 'unknown error'}`)} />
            ) : (
              <VectorReportView report={r} />
            )
          }
        </Async>
      )}
      <Card title="Recent examinations" sub="Studio and public-site examinations, newest first" pad={false}>
        <Async q={recent}>
          {(rows) =>
            rows.length ? (
              <div className="dt__scroll">
                <table className="table">
                  <thead><tr><th>Website</th><th>Source</th><th>Status</th><th className="num">Health</th><th className="num">Visibility</th><th>When</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="is-link" tabIndex={0} onClick={() => open(r.id)} onKeyDown={(e) => e.key === 'Enter' && open(r.id)}>
                        <td><strong>{r.host}</strong><div className="muted small">{r.url.replace(/^https?:\/\//, '')}</div></td>
                        <td><span className="tag">{r.source === 'studio' ? (r.siteId ? 'Client site' : 'Studio') : 'Public site'}</span></td>
                        <td><StatePill value={r.status === 'completed' ? 'done' : r.status === 'failed' ? 'critical' : 'pending'} label={r.status} /></td>
                        <td className="num"><Pill tone={scoreTone(r.healthScore)}>{r.healthScore ?? '—'}</Pill></td>
                        <td className="num"><Pill tone={scoreTone(r.visibility)}>{r.visibility ?? '—'}</Pill></td>
                        <td className="muted">{f.ago(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No examinations yet">Run your first one above.</Empty>
            )
          }
        </Async>
      </Card>
    </>
  )
}
