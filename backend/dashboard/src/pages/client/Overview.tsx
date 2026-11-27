import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BellRing, CalendarClock, Globe2, HeartPulse, LifeBuoy, Wrench } from 'lucide-react'
import { get } from '../../lib/api'
import * as f from '../../lib/format'
import type { ClientOverview } from '../../lib/types'
import { IssueList, MonitorPill } from '../../components/reports'
import { Async, Card, Empty, Grid, Meter, PageHeader, Pill, ScoreRing, Stat, scoreTone } from '../../components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function ClientOverviewPage() {
  const q = useQuery({ queryKey: ['client', 'overview'], queryFn: () => get<ClientOverview>('/v1/client/overview') })
  return (
    <Async q={q}>
      {(d) => {
        const examined = d.sites.some((s) => s.lastAuditAt)
        return (
          <>
            <PageHeader
              eyebrow={`${d.client.company} · ${d.plan.name} plan`}
              title={`${greeting()}, ${d.client.contactName.replace(/^(Dr|Mr|Ms|Mrs)\.\s*/, '').split(' ')[0]}`}
              sub="Here is how your website is doing and what we are working on."
            />

            {d.approvals.length > 0 && (
              <Link to="/portal/projects" className="banner banner--signal">
                <BellRing aria-hidden="true" />
                <span>
                  <b>{d.approvals.length} item{d.approvals.length > 1 ? 's' : ''} waiting for your approval</b> — {d.approvals.map((a) => a.title).join(', ')}
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            )}

            <div className="hero-row">
              <Card className="hero-score hero-score--pair">
                <ScoreRing score={d.scores.health} label="Website health" size={118} />
                <ScoreRing score={d.scores.visibility} label="Search & AI visibility" size={118} />
              </Card>
              <Grid cols={4} className="grow">
                <Stat label="Uptime (30 days)" value={f.pct(d.uptime30, 2)} tone={d.uptime30 == null ? undefined : d.uptime30 >= 99.9 ? 'good' : 'warning'} hint="checked every 5 minutes" icon={<Globe2 />} />
                <Stat label="Issues to fix" value={d.sites.reduce((a, s) => a + s.openIssues, 0)} hint={examined ? <Link to="/portal/health">Website health</Link> : 'after the first examination'} icon={<HeartPulse />} />
                <Stat label="Care this month" value={`${f.hours(d.hours.used)}`} hint={`of ${d.hours.included} h in your plan`} icon={<Wrench />} />
                <Stat label="Open requests" value={d.openTickets} hint={<Link to="/portal/support">View support</Link>} icon={<LifeBuoy />} />
              </Grid>
            </div>

            <Grid cols={3}>
              <Card title="What we are fixing next" sub="Top issues across your websites from the latest examination" className="span-2">
                {examined ? (
                  <IssueList issues={d.topIssues} showSite={d.sites.length > 1} compact />
                ) : (
                  <Empty title="No examination yet">Once we examine your website, the most important fixes appear here.</Empty>
                )}
              </Card>
              <Card title="This month's care" sub={`${d.plan.name} plan includes ${d.hours.included} h / month`}>
                <Meter value={d.hours.used} max={d.hours.included} label={<><b>{f.hours(d.hours.used)}</b> of {d.hours.included} h used</>} />
                {d.recentWork.length ? (
                  <ul className="feed">
                    {d.recentWork.slice(0, 5).map((w) => (
                      <li key={w.id}>
                        <span className="tag">{w.category}</span>
                        <span>{w.title}</span>
                        <span className="muted small">{f.day(w.date)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No work logged yet.</p>
                )}
                <Link className="link" to="/portal/work">Everything we did <ArrowRight /></Link>
              </Card>
            </Grid>

            <Grid cols={3}>
              <Card title="Your websites" className="span-2" pad={false}>
                {d.sites.length ? (
                  <table className="table">
                    <thead>
                      <tr><th>Website</th><th>Status</th><th className="num">Health</th><th className="num">Visibility</th><th className="num">Uptime 30d</th><th>Examined</th></tr>
                    </thead>
                    <tbody>
                      {d.sites.map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.name}</strong><div className="muted small">{s.host} · {s.platform}</div></td>
                          <td><MonitorPill status={s.monitoring.status} /></td>
                          <td className="num"><Pill tone={scoreTone(s.health)}>{s.health ?? '—'}</Pill></td>
                          <td className="num"><Pill tone={scoreTone(s.visibility)}>{s.visibility ?? '—'}</Pill></td>
                          <td className="num">{f.pct(s.uptime30, 2)}</td>
                          <td className="muted">{f.ago(s.lastAuditAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty title="No websites yet">We add your website here when monitoring starts.</Empty>
                )}
              </Card>
              <div className="stack">
                <Card title="Next milestone">
                  {d.nextMilestone ? (
                    <div className="milestone-next">
                      <CalendarClock aria-hidden="true" />
                      <div>
                        <strong>{d.nextMilestone.title}</strong>
                        <p className="muted small">{d.nextMilestone.project} · due {f.date(d.nextMilestone.dueDate)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">No active projects. Your site is in ongoing care.</p>
                  )}
                </Card>
                <Card title="Account balance">
                  <div className="big-num">{f.money(d.balance.amount)}</div>
                  <p className="muted small">
                    {d.balance.overdue ? <Pill tone="critical">{f.money(d.balance.overdue)} overdue</Pill> : d.balance.nextDue ? `Next payment due ${f.date(d.balance.nextDue)}` : 'Nothing due — thank you!'}
                  </p>
                  <Link className="link" to="/portal/billing">Invoices <ArrowRight /></Link>
                </Card>
              </div>
            </Grid>
          </>
        )
      }}
    </Async>
  )
}
