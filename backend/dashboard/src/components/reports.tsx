import { useState } from 'react'
import { CheckCircle2, Circle, Globe2, Link2Off, Loader2, Lock, Radar, ShieldCheck, XCircle, Zap } from 'lucide-react'
import type { Audit, AuditReport, CategoryScores, PrescriptionStep, Severity, SiteReport, TopIssue, VectorCategory, VectorIssue } from '../lib/types'
import * as f from '../lib/format'
import { LineChart, UptimeStrip } from './charts'
import { Card, cx, Empty, Grid, Pill, ScoreRing, Stat, StatePill, type Tone } from './ui'

/* Vector examines eight categories; the health score is their weighted mean (worker/src/scoring.js). */
export const CATEGORIES: VectorCategory[] = ['technical', 'seo', 'performance', 'accessibility', 'security', 'links', 'content', 'ai']
export const CATEGORY_LABEL: Record<VectorCategory, string> = {
  technical: 'Technical', seo: 'SEO', performance: 'Performance', accessibility: 'Accessibility',
  security: 'Security', links: 'Links', content: 'Content', ai: 'AI visibility',
}
export const SEVERITY_TONE: Record<Severity, Tone> = { critical: 'critical', high: 'serious', medium: 'warning', low: 'neutral' }

/** Search & AI visibility, as the API computes it: the mean of Vector's SEO and AI-visibility scores. */
export const VISIBILITY_HINT = 'Mean of the SEO and AI-visibility category scores'

/* ------------------------------------------------------------------ scores */
export function CategoryGrid({ scores }: { scores: CategoryScores }) {
  return (
    <div className="cats">
      {CATEGORIES.map((c) => (
        <ScoreRing key={c} score={scores[c] ?? null} label={CATEGORY_LABEL[c]} size={84} />
      ))}
    </div>
  )
}

export function SeverityCounts({ counts }: { counts?: Partial<Record<Severity, number>> }) {
  if (!counts) return null
  return (
    <div className="row gap-s wrap">
      {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
        <Pill key={s} tone={counts[s] ? SEVERITY_TONE[s] : 'neutral'}>{counts[s] ?? 0} {s}</Pill>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ issues */
export function IssueList({ issues, limit, showSite, compact }: { issues: (VectorIssue | TopIssue)[]; limit?: number; showSite?: boolean; compact?: boolean }) {
  const list = limit ? issues.slice(0, limit) : issues
  if (!list.length) return <Empty title="No open issues" icon={<CheckCircle2 className="tone-text--good" />}>Nothing Vector checks for was wrong at the last examination.</Empty>
  return (
    <ol className="issues">
      {list.map((i, n) => (
        <li key={`${'siteId' in i ? i.siteId ?? '' : ''}${i.code}${n}`} className="issue">
          <span className="issue__n">{n + 1}</span>
          <div className="issue__body">
            <div className="issue__top">
              <strong>{i.title}</strong>
              <Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill>
              <span className="tag">{CATEGORY_LABEL[i.category] ?? i.category}</span>
              {showSite && 'siteName' in i && <span className="tag">{i.siteName}</span>}
            </div>
            {!compact && i.evidence && <p className="muted small"><b>Found:</b> {i.evidence}</p>}
            {!compact && i.explanation && <p className="muted small">{i.explanation}</p>}
            {i.recommendation && <p className="issue__fix">{i.recommendation}</p>}
            {!compact && i.impact && <p className="muted small"><b>Result:</b> {i.impact}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Prescription({ steps }: { steps: PrescriptionStep[] }) {
  if (!steps.length) return <Empty title="Nothing to fix" icon={<CheckCircle2 className="tone-text--good" />} />
  return (
    <ol className="issues">
      {steps.map((s) => (
        <li key={s.issue_code} className="issue">
          <span className="issue__n">{s.position}</span>
          <div className="issue__body">
            <div className="issue__top">
              <strong>{s.title}</strong>
              <Pill tone={SEVERITY_TONE[s.severity]}>{s.severity}</Pill>
              {s.category && <span className="tag">{CATEGORY_LABEL[s.category] ?? s.category}</span>}
            </div>
            <p className="issue__fix">{s.action}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ progress */
export function AuditProgress({ audit }: { audit: Audit }) {
  return (
    <div className="stack">
      <p className="muted small">
        Examining <b>{audit.url}</b> with Vector. This usually takes 10–30 seconds; the page updates by itself.
      </p>
      <ol className="stages">
        {audit.stages.map((s) => (
          <li key={s.key} className={cx('stages__item', `is-${s.state}`)}>
            {s.state === 'done' ? <CheckCircle2 aria-hidden="true" /> : s.state === 'active' ? <Loader2 className="spin" aria-hidden="true" /> : s.state === 'failed' ? <XCircle aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export const isRunning = (a: Pick<Audit, 'status'> | null | undefined) => a?.status === 'queued' || a?.status === 'running'

/* ------------------------------------------------------------------ one examination */
export function VectorReportView({ report }: { report: Pick<AuditReport, 'audit' | 'issues' | 'prescription'> }) {
  const { audit, issues, prescription } = report
  const [cat, setCat] = useState<'all' | VectorCategory>('all')
  const visibility = visibilityOf(audit.scores)
  const shown = cat === 'all' ? issues : issues.filter((i) => i.category === cat)
  const present = CATEGORIES.filter((c) => issues.some((i) => i.category === c))
  return (
    <div className="stack">
      <Card>
        <div className="scan-head">
          <div>
            <div className="eyebrow">Examined {f.dateTime(audit.completed_at)}</div>
            <h2 className="scan-url">{audit.summary.final_url || audit.url}</h2>
            <p className="muted small">
              HTTP {audit.summary.status ?? '—'} · first response {audit.summary.response_ms ?? '—'} ms · {issues.length} issue{issues.length === 1 ? '' : 's'}
            </p>
            <SeverityCounts counts={audit.summary.counts} />
          </div>
          <div className="scan-rings">
            <ScoreRing score={audit.health_score} label="Health" size={104} />
            <ScoreRing score={visibility} label="Search & AI visibility" size={104} />
          </div>
        </div>
      </Card>
      <Card title="Category scores" sub="Each category starts at 100; every finding deducts by severity (critical 30, high 15, medium 8, low 3).">
        <CategoryGrid scores={audit.scores} />
      </Card>
      <Grid cols={2}>
        <Card
          title="Issues"
          sub="Ranked by severity, then by how much the category weighs"
          actions={present.length > 1 && (
            <label className="select-wrap">
              <span className="sr-only">Category</span>
              <select value={cat} onChange={(e) => setCat(e.target.value as 'all' | VectorCategory)}>
                <option value="all">All categories</option>
                {present.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
          )}
        >
          <IssueList issues={shown} />
        </Card>
        <Card title="Prescription" sub="The fixes in order, one per issue type">
          <Prescription steps={prescription} />
        </Card>
      </Grid>
    </div>
  )
}

export function visibilityOf(scores: CategoryScores | null | undefined): number | null {
  const v = [scores?.seo, scores?.ai].filter((x): x is number => typeof x === 'number')
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/* ------------------------------------------------------------------ monitoring */
const MONITOR_LABEL: Record<string, string> = {
  operational: 'Online', degraded: 'Degraded', unavailable: 'Down', protected: 'Online (bot check)', unknown: 'Awaiting first check', not_monitored: 'Not monitored',
}
const MONITOR_TONE: Record<string, Tone> = { operational: 'good', degraded: 'warning', unavailable: 'critical', protected: 'good', unknown: 'neutral', not_monitored: 'neutral' }

export function MonitorPill({ status }: { status: string }) {
  return <Pill tone={MONITOR_TONE[status] ?? 'neutral'}>{MONITOR_LABEL[status] ?? status}</Pill>
}

/* ------------------------------------------------------------------ one website */
export function SiteHealthView({ data, scanning }: { data: SiteReport; scanning?: boolean }) {
  const s = data.site
  const u = data.uptime
  const chartDays = u.days.filter((d) => d.checks > 0)
  return (
    <div className="stack">
      {(data.pendingAudit || scanning) && (
        <Card title="Examination in progress">
          {data.pendingAudit ? <AuditProgress audit={data.pendingAudit} /> : <p className="muted small">Starting…</p>}
        </Card>
      )}
      {data.lastFailedAudit && !data.pendingAudit && (
        <div className="error-box" role="alert"><XCircle aria-hidden="true" /><span>The last examination failed: {data.lastFailedAudit.error_message}</span></div>
      )}
      <div className="hero-row">
        <Card className="hero-score hero-score--pair">
          <ScoreRing score={data.audit?.health_score ?? null} label="Health" size={118} />
          <ScoreRing score={visibilityOf(data.audit?.scores)} label="Search & AI visibility" size={118} />
        </Card>
        <Grid cols={4} className="grow">
          <Stat label="Status now" value={<MonitorPill status={s.monitoring.status} />} hint={s.monitoring.lastCheckedAt ? `checked ${f.ago(s.monitoring.lastCheckedAt)}` : 'first check pending'} icon={<Globe2 />} />
          <Stat label="Uptime (30 days)" value={f.pct(u.pct30, 2)} hint={u.checks30 ? `${f.num(u.checks30)} checks · ${u.downtimeMinutes30} min down` : 'figures appear within the hour'} tone={u.pct30 == null ? undefined : u.pct30 >= 99.9 ? 'good' : 'warning'} />
          <Stat label="Avg response (7 days)" value={s.avgResponseMs == null ? '—' : `${s.avgResponseMs} ms`} hint={s.monitoring.lastResponseMs != null ? `last ${s.monitoring.lastResponseMs} ms` : undefined} icon={<Zap />} />
          <Stat label="SSL certificate" value={s.sslValid == null ? '—' : s.sslValid ? 'Valid' : 'Failing'} hint="expiry date not measured" tone={s.sslValid === false ? 'critical' : s.sslValid ? 'good' : undefined} icon={<Lock />} />
        </Grid>
      </div>

      <Card title="Uptime — last 90 days" sub="Signal checks the site every 5 minutes; a day is down for the share of checks that found it unavailable" actions={<div className="row gap-m small"><span>7d <b>{f.pct(u.pct7, 2)}</b></span><span>30d <b>{f.pct(u.pct30, 2)}</b></span><span>90d <b>{f.pct(u.pct90, 2)}</b></span></div>}>
        {u.days.length ? <UptimeStrip days={u.days} /> : <Empty title="No uptime data yet">Monitoring started recently. Daily uptime is rolled up every hour.</Empty>}
      </Card>

      <Grid cols={2}>
        <Card title="Response time" sub="Daily average of Signal's checks, milliseconds">
          {chartDays.length > 1 ? (
            <LineChart data={chartDays} x="date" series={[{ key: 'avgResponseMs', label: 'Response time' }]} yFormat={(v) => `${Math.round(v)}`} xFormat={f.day} label="Average response time per day" height={200} />
          ) : (
            <Empty title="Not enough data yet" />
          )}
        </Card>
        <Card title="Health score trend" sub="Each completed Vector examination">
          {data.history.length > 1 ? (
            <LineChart data={data.history} x="date" series={[{ key: 'health', label: 'Health' }, { key: 'visibility', label: 'Visibility' }]} area={false} yFormat={(v) => `${Math.round(v)}`} xFormat={f.day} label="Health and visibility scores over time" height={200} yMin={0} />
          ) : (
            <Empty title={data.history.length ? 'One examination so far' : 'Not examined yet'}>The trend appears after the second examination.</Empty>
          )}
        </Card>
      </Grid>

      {data.audit ? (
        <VectorReportView report={{ audit: data.audit, issues: data.audit.issues, prescription: data.audit.prescription }} />
      ) : (
        <Card>
          <Empty title="Not examined yet" icon={<Radar />}>Run an examination to see the health score, the eight category scores and what to fix.</Empty>
        </Card>
      )}

      <Grid cols={2}>
        <Card title="Incident history" sub="Outages detected by monitoring">
          {u.incidents.length ? (
            <table className="table">
              <thead><tr><th>Started</th><th>Duration</th><th>Cause</th></tr></thead>
              <tbody>
                {u.incidents.map((i) => (
                  <tr key={i.start}><td>{f.dateTime(i.start)}</td><td>{i.ongoing ? <StatePill value="critical" label="ongoing" /> : `${i.minutes} min`}</td><td>{i.cause}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="No incidents recorded" icon={<CheckCircle2 className="tone-text--good" />} />
          )}
        </Card>
        <Card title="Site details">
          <ul className="kv">
            <li><Lock /><span>SSL certificate</span><span className="muted">{data.ssl.valid == null ? 'Not checked yet' : data.ssl.valid ? 'Valid · expiry not measured' : 'Check failed'}</span></li>
            <li><Globe2 /><span>Domain renewal</span><span className="muted">Not measured</span></li>
            <li><Link2Off /><span>Broken links</span>{data.brokenLinks == null ? <span className="muted">—</span> : <Pill tone={data.brokenLinks ? 'warning' : 'good'}>{data.brokenLinks} in the checked sample</Pill>}</li>
            <li><ShieldCheck /><span>Platform</span><span className="muted">{s.platform} on {s.hosting}</span></li>
          </ul>
        </Card>
      </Grid>
    </div>
  )
}
