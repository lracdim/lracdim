import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Printer } from 'lucide-react'
import { get, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { MonthlyReport, Project, WorkReport } from '../../lib/types'
import { HBars } from '../../components/charts'
import { BrandMark } from '../../components/Shell'
import { CATEGORIES, CATEGORY_LABEL } from '../../components/reports'
import { lastMonths, MonthSelect, ProjectCard } from '../../components/shared'
import { Async, Button, Card, Empty, ErrorBox, Grid, Meter, PageHeader, ScoreRing, Stat } from '../../components/ui'

/* ------------------------------------------------------------------ projects */
export function ClientProjectsPage() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['client', 'projects'], queryFn: () => get<Project[]>('/v1/client/projects') })
  const approve = useMutation({
    mutationFn: ({ p, m }: { p: string; m: string }) => post(`/v1/client/projects/${p}/milestones/${m}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client'] }),
  })
  return (
    <>
      <PageHeader title="Projects & approvals" sub="Follow every stage of your project. Approve work when it is ready for you." />
      {approve.isError && <ErrorBox error={approve.error} />}
      <Async q={q}>
        {(list) =>
          list.length ? (
            <div className="stack">
              {list.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  milestoneAction={(m) =>
                    m.status === 'awaiting_approval' ? (
                      <Button variant="primary" size="sm" icon={<CheckCheck />} disabled={approve.isPending} onClick={() => approve.mutate({ p: p.id, m: m.id })}>
                        Approve
                      </Button>
                    ) : null
                  }
                />
              ))}
            </div>
          ) : (
            <Empty title="No projects yet">When we start new work for you, it shows up here with every milestone.</Empty>
          )
        }
      </Async>
    </>
  )
}

/* ------------------------------------------------------------------ work log */
export function ClientWorkPage() {
  const [month, setMonth] = useState(f.thisMonth())
  const q = useQuery({ queryKey: ['client', 'work', month], queryFn: () => get<WorkReport>(`/v1/client/worklog?month=${month}`), placeholderData: (p) => p })
  return (
    <>
      <PageHeader
        title="Work log"
        sub="Everything we did on your website, task by task — your care plan, made visible."
        actions={q.data && <MonthSelect value={month} months={q.data.months} onChange={setMonth} />}
      />
      <Async q={q}>
        {(d) => (
          <div className="stack">
            <Grid cols={3}>
              <Card title="Hours this month">
                <div className="big-num">{f.hours(d.hoursUsed)}</div>
                <Meter value={d.hoursUsed} max={d.hoursIncluded} label={`${d.hoursIncluded} h included in your plan`} />
                {d.hoursUsed > d.hoursIncluded && <p className="muted small">{f.hours(d.hoursUsed - d.hoursIncluded)} over the hours included in your plan this month.</p>}
              </Card>
              <Card title="Where the time went" className="span-2">
                {d.byCategory.length ? <HBars rows={d.byCategory.map((c) => ({ label: f.titleCase(c.category), value: c.hours }))} format={(v) => `${v} h`} /> : <Empty title="No work logged yet this month" />}
              </Card>
            </Grid>
            <Card title={`Tasks — ${f.monthLabel(d.month)}`} pad={false}>
              {d.items.length ? (
                <table className="table">
                  <thead><tr><th>Date</th><th>Task</th><th>Type</th><th>By</th><th className="num">Time</th></tr></thead>
                  <tbody>
                    {d.items.map((w) => (
                      <tr key={w.id}><td>{f.date(w.date)}</td><td><strong>{w.title}</strong></td><td><span className="tag">{w.category}</span></td><td className="muted">{w.by}</td><td className="num">{f.minutes(w.minutes)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty title="Nothing logged for this month" />
              )}
            </Card>
          </div>
        )}
      </Async>
    </>
  )
}

/* ------------------------------------------------------------------ monthly report */
export function ClientReportsPage() {
  const months = lastMonths(6)
  const [month, setMonth] = useState(months[0])
  const q = useQuery({ queryKey: ['client', 'report', month], queryFn: () => get<MonthlyReport>(`/v1/client/reports/${month}`), placeholderData: (p) => p })
  return (
    <>
      <PageHeader
        title="Monthly reports"
        sub="A one-page month in review you can forward to your team or partners."
        actions={
          <>
            <MonthSelect value={month} months={months} onChange={setMonth} />
            <Button icon={<Printer />} onClick={() => window.print()}>Print / save PDF</Button>
          </>
        }
      />
      <Async q={q}>
        {(r) => (
          <article className="card report printable">
            <header className="report__head">
              <div className="row gap-s">
                <BrandMark />
                <div>
                  <div className="eyebrow">Website report · {f.monthLabel(r.month)}</div>
                  <h2>{r.client?.company}</h2>
                </div>
              </div>
              <span className="muted small">{r.client?.plan} care plan</span>
            </header>
            <section>
              <h3>Highlights</h3>
              <ul className="report__highlights">{r.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
            </section>
            <Grid cols={4}>
              <Stat label="Uptime" value={f.pct(r.uptime, 2)} hint={r.uptime == null ? 'no monitoring data this month' : `${r.incidents} outage${r.incidents === 1 ? '' : 's'} detected`} />
              <Stat label="Care delivered" value={f.hours(r.work.hours)} hint={`${r.work.tasks} task${r.work.tasks === 1 ? '' : 's'}`} />
              <Stat label="Support requests" value={r.tickets.opened} hint={`${r.tickets.resolved} resolved`} />
              <Stat label="Websites" value={r.sites.length} />
            </Grid>
            <section>
              <h3>Scores at month end</h3>
              {r.scores.health == null ? (
                <p className="muted small">No examination had finished by the end of this month.</p>
              ) : (
                <div className="row gap-l wrap">
                  <ScoreRing score={r.scores.health} label="Health" size={84} />
                  <ScoreRing score={r.scores.visibility ?? null} label="Search & AI visibility" size={84} />
                  {CATEGORIES.map((c) => <ScoreRing key={c} score={r.scores[c] ?? null} label={CATEGORY_LABEL[c]} size={68} />)}
                </div>
              )}
            </section>
            <Grid cols={2}>
              <section>
                <h3>Work delivered — {r.work.hours} h across {r.work.tasks} tasks</h3>
                {r.work.items.length ? (
                  <ul className="feed">
                    {r.work.items.map((w) => <li key={w.id}><span className="tag">{w.category}</span><span>{w.title}</span><span className="muted small">{f.day(w.date)}</span></li>)}
                  </ul>
                ) : (
                  <p className="muted small">No work logged this month.</p>
                )}
              </section>
              <section>
                <h3>Where the time went</h3>
                {r.work.byCategory.length ? <HBars rows={r.work.byCategory.map((c) => ({ label: f.titleCase(c.category), value: c.hours }))} format={(v) => `${v} h`} /> : <p className="muted small">—</p>}
              </section>
            </Grid>
          </article>
        )}
      </Async>
    </>
  )
}
