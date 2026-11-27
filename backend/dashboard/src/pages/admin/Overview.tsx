import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertOctagon, AlertTriangle, ArrowRight, Briefcase, CheckCircle2, Clock, DollarSign, Globe2, Info, LifeBuoy, Radar, TrendingUp, UserPlus, Users } from 'lucide-react'
import { get } from '../../lib/api'
import * as f from '../../lib/format'
import type { AdminOverview } from '../../lib/types'
import { BarChart, HBars } from '../../components/charts'
import { Async, Card, cx, Empty, Grid, Meter, PageHeader, Pill, Stat } from '../../components/ui'

const SEV_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info }
export const STAGE_LABEL: Record<string, string> = { new: 'New', reviewing: 'Reviewing', call_booked: 'Call booked', proposal: 'Proposal sent', won: 'Won', lost: 'Lost' }

/** Shown while the studio has no clients yet: the three steps that fill this page with real numbers. */
function GettingStarted({ leads }: { leads: number }) {
  return (
    <Card title="Getting started" sub="Every number here comes from your own records, Signal monitoring and Vector examinations. Nothing is filled in for you.">
      <ol className="steps">
        <li>
          <Briefcase aria-hidden="true" />
          <div>
            <strong>Work the pipeline</strong>
            <p className="muted small">{leads ? `${leads} lead${leads === 1 ? '' : 's'} from the site's project form and Vector report requests are waiting.` : 'Project inquiries and Vector report requests from the site land here.'}</p>
          </div>
          <Link className="link" to="/admin/pipeline">Pipeline <ArrowRight /></Link>
        </li>
        <li>
          <UserPlus aria-hidden="true" />
          <div>
            <strong>Add your first client</strong>
            <p className="muted small">Convert a lead or create a client; add their website to start uptime monitoring.</p>
          </div>
          <Link className="link" to="/admin/clients">Clients <ArrowRight /></Link>
        </li>
        <li>
          <Radar aria-hidden="true" />
          <div>
            <strong>Examine a website</strong>
            <p className="muted small">Run a Vector audit on any public site before a sales call.</p>
          </div>
          <Link className="link" to="/admin/audit">Website audit <ArrowRight /></Link>
        </li>
      </ol>
    </Card>
  )
}

export default function AdminOverviewPage() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<AdminOverview>('/v1/admin/overview'), refetchInterval: 60_000 })
  return (
    <Async q={q}>
      {(d) => {
        const revDelta = d.revenue.lastMonth ? ((d.revenue.thisMonth - d.revenue.lastMonth) / d.revenue.lastMonth) * 100 : null
        const crit = d.attention.filter((a) => a.severity === 'critical').length
        const clientCount = d.clients.active + d.clients.onboarding + d.clients.paused + d.clients.churned
        const leads = d.pipeline.byStage.reduce((a, s) => a + s.count, 0)
        const hasRevenue = d.revenue.series.some((r) => r.revenue > 0)
        return (
          <>
            <PageHeader
              eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              title="Command centre"
              sub={crit ? `${crit} thing${crit > 1 ? 's' : ''} need you today.` : clientCount ? 'Nothing critical — the studio is running smoothly.' : 'No clients yet. Start with the pipeline below.'}
            />

            {!clientCount && <GettingStarted leads={d.pipeline.openCount} />}

            <Grid cols={4}>
              <Stat label="Monthly recurring revenue" value={f.money(d.mrr)} hint={`${f.money(d.arr)} ARR`} icon={<DollarSign />} />
              <Stat label="Collected this month" value={f.money(d.revenue.thisMonth)} delta={revDelta} hint="vs last month" icon={<TrendingUp />} />
              <Stat label="Overdue receivables" value={f.money(d.receivables.overdue)} hint={`${d.receivables.overdueCount} invoices · ${f.money(d.receivables.outstanding)} not yet due`} tone={d.receivables.overdue ? 'critical' : undefined} />
              <Stat label="Open pipeline" value={f.money(d.pipeline.openValue)} hint={`${d.pipeline.openCount} open lead${d.pipeline.openCount === 1 ? '' : 's'} · ${d.pipeline.winRate == null ? '—' : `${d.pipeline.winRate}%`} win rate`} icon={<Briefcase />} />
            </Grid>
            <Grid cols={4}>
              <Stat label="Active clients" value={d.clients.active + d.clients.onboarding} hint={`${d.clients.onboarding} onboarding · ${d.clients.paused} paused`} icon={<Users />} />
              <Stat
                label="Websites at risk"
                value={`${d.sites.atRisk} / ${d.sites.total}`}
                hint={d.sites.total ? `avg health ${d.sites.avgHealth ?? '—'} · uptime ${f.pct(d.sites.avgUptime, 2)}` : 'no client websites yet'}
                tone={d.sites.down ? 'critical' : d.sites.atRisk ? 'warning' : undefined}
                icon={<Globe2 />}
              />
              <Stat
                label="Open support tickets"
                value={d.support.open}
                hint={`${d.support.breached} SLA breached · avg first reply ${d.support.avgFirstResponseHours == null ? '—' : `${d.support.avgFirstResponseHours} h`}`}
                tone={d.support.breached ? 'critical' : undefined}
                icon={<LifeBuoy />}
              />
              <Stat label="Capacity used this month" value={`${d.capacity.utilisation}%`} hint={`${d.capacity.hoursUsed} of ${d.capacity.hoursIncluded} retainer hours`} icon={<Clock />} />
            </Grid>

            <Grid cols={3}>
              <Card title="Needs your attention" sub="Ranked by severity" className="span-2" pad={false}>
                {d.attention.length ? (
                  <ul className="attention">
                    {d.attention.map((a, i) => {
                      const Icon = SEV_ICON[a.severity]
                      return (
                        <li key={i}>
                          <Link to={a.link} className={cx('attention__row', `sev--${a.severity}`)}>
                            <Icon aria-hidden="true" />
                            <div>
                              <strong>{a.title}</strong>
                              <span className="muted small">{a.detail}</span>
                            </div>
                            <Pill tone={a.severity === 'info' ? 'info' : a.severity}>{a.severity}</Pill>
                            <ArrowRight className="faint" aria-hidden="true" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <Empty title="Nothing needs you right now" icon={<CheckCircle2 className="tone-text--good" />}>Downtime, failing SSL, overdue invoices, SLA deadlines, approvals and new leads show up here.</Empty>
                )}
              </Card>
              <div className="stack">
                <Card title="MRR by plan">
                  {d.mrr ? (
                    <HBars rows={d.mrrByPlan.map((p) => ({ label: p.plan, value: p.mrr, sub: `${p.clients} client${p.clients === 1 ? '' : 's'}` }))} format={f.money} />
                  ) : (
                    <p className="muted small">No active or onboarding clients yet.</p>
                  )}
                </Card>
                <Card title="Upcoming renewals" sub="Next 90 days">
                  {d.renewals.length ? (
                    <ul className="feed">
                      {d.renewals.map((r) => (
                        <li key={r.clientId}>
                          <Link to="/admin/clients/$clientId" params={{ clientId: r.clientId }}><strong>{r.company}</strong></Link>
                          <span className="muted small">{f.date(r.renewalDate)} · {f.money(r.mrr)}/mo</span>
                          <Pill tone={r.days <= 30 ? 'warning' : 'neutral'}>{r.days} days</Pill>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">No renewals in the next 90 days.</p>
                  )}
                </Card>
              </div>
            </Grid>

            <Grid cols={3}>
              <Card title="Revenue collected" sub={`Last 12 months · ${f.money(d.revenue.trailing12)} total`} className="span-2" actions={<Link className="link" to="/admin/billing">Billing <ArrowRight /></Link>}>
                {hasRevenue ? (
                  <BarChart data={d.revenue.series} x="month" y="revenue" xFormat={f.monthShort} yFormat={(v) => f.moneyShort(v)} label="Revenue collected per month" highlightLast />
                ) : (
                  <Empty title="No paid invoices yet">Revenue is the sum of invoices marked paid, by the month they were paid.</Empty>
                )}
              </Card>
              <Card title="Pipeline by stage" actions={<Link className="link" to="/admin/pipeline">Pipeline <ArrowRight /></Link>}>
                {leads ? (
                  <HBars rows={d.pipeline.byStage.filter((s) => s.stage !== 'lost').map((s) => ({ label: STAGE_LABEL[s.stage], value: s.count, sub: s.value ? f.moneyShort(s.value) : undefined }))} format={(v) => `${v}`} />
                ) : (
                  <p className="muted small">No leads yet.</p>
                )}
              </Card>
            </Grid>

            <Grid cols={3}>
              <Card title="Client websites" sub="Signal monitoring and Vector examinations">
                <div className="big-num">{d.sites.total}</div>
                <p className="muted small">website{d.sites.total === 1 ? '' : 's'} · {d.sites.monitored} monitored · {d.sites.down} down now</p>
                <Meter value={d.sites.avgHealth ?? 0} max={100} label={<>Avg health score <b>{d.sites.avgHealth ?? '—'}</b></>} />
                <Meter value={d.sites.avgVisibility ?? 0} max={100} label={<>Avg search & AI visibility <b>{d.sites.avgVisibility ?? '—'}</b></>} />
                <Link className="link" to="/admin/sites">Websites & monitoring <ArrowRight /></Link>
              </Card>
              <Card title="Recent activity" className="span-2" actions={<Link className="link" to="/admin/activity">Full log <ArrowRight /></Link>}>
                {d.activity.length ? (
                  <ul className="feed">
                    {d.activity.map((a) => (
                      <li key={a.id}>
                        <span className="tag">{a.action}</span>
                        <span><b>{a.actor}</b> · {a.target}</span>
                        <span className="muted small">{f.ago(a.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No activity yet.</p>
                )}
              </Card>
            </Grid>
          </>
        )
      }}
    </Async>
  )
}
