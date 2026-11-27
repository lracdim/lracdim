import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { get } from '../../lib/api'
import * as f from '../../lib/format'
import type { BillingReport, Invoice } from '../../lib/types'
import { InvoiceModal } from '../../components/shared'
import { Async, Card, Empty, Grid, PageHeader, Stat, StatePill } from '../../components/ui'

export default function ClientBillingPage() {
  const [open, setOpen] = useState<Invoice | null>(null)
  const q = useQuery({ queryKey: ['client', 'billing'], queryFn: () => get<BillingReport>('/v1/client/billing') })
  return (
    <>
      <PageHeader title="Plan & billing" sub="Your care plan, invoices and payment history." />
      <Async q={q}>
        {(d) => (
          <div className="stack">
            <Grid cols={3}>
              <Card title={`${d.plan.name ?? ''} care plan`} sub={d.renewalDate ? `Renews ${f.date(d.renewalDate)}` : undefined}>
                <div className="big-num">{f.money(d.plan.price)}<span className="muted small"> / month</span></div>
                <ul className="ticks">
                  <li><Check /> {d.plan.includedHours} hours of work included each month</li>
                  {d.plan.features.map((x) => <li key={x}><Check /> {x}</li>)}
                </ul>
              </Card>
              <Stat label="Outstanding balance" value={f.money(d.outstanding)} hint={d.overdue ? `${f.money(d.overdue)} overdue` : 'Nothing overdue'} tone={d.overdue ? 'critical' : 'good'} />
              <Stat label="Paid this year" value={f.money(d.paidThisYear)} hint={`${d.invoices.filter((i) => i.status === 'paid').length} invoices paid`} />
            </Grid>
            <Card title="Invoices" pad={false}>
              {!d.invoices.length ? <Empty title="No invoices yet" /> : (
              <table className="table">
                <thead><tr><th>Invoice</th><th>Description</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {d.invoices.map((i) => (
                    <tr key={i.id} className="is-link" tabIndex={0} onClick={() => setOpen(i)} onKeyDown={(e) => e.key === 'Enter' && setOpen(i)}>
                      <td><strong>{i.number}</strong></td>
                      <td className="muted">{i.items[0]?.description}</td>
                      <td>{f.date(i.issuedAt)}</td>
                      <td>{f.date(i.dueAt)}</td>
                      <td><StatePill value={i.status} /></td>
                      <td className="num">{f.money(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </Card>
          </div>
        )}
      </Async>
      <InvoiceModal inv={open} onClose={() => setOpen(null)} />
    </>
  )
}
