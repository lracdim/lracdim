import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { ApiError, get, post } from '../../lib/api'
import * as f from '../../lib/format'
import type { Ticket } from '../../lib/types'
import { SlaPill, Thread } from '../../components/shared'
import { Async, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, StatePill } from '../../components/ui'

function NewRequest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const m = useMutation({
    mutationFn: (body: Record<string, string>) => post<Ticket>('/v1/client/tickets', body),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['client'] })
      onClose()
      navigate({ to: '/portal/support/$ticketId', params: { ticketId: t.id } })
    },
  })
  const fields = m.error instanceof ApiError ? m.error.fields : undefined
  return (
    <Modal open={open} onClose={onClose} title="New support request">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>)
        }}
      >
        <Field label="What do you need?" error={fields?.subject}>
          <input name="subject" required minLength={3} placeholder="e.g. Update our opening hours" />
        </Field>
        <div className="form__row">
          <Field label="Type">
            <select name="category" defaultValue="content">
              <option value="content">Content change</option>
              <option value="bug">Something is broken</option>
              <option value="feature">New feature</option>
              <option value="question">Question</option>
              <option value="billing">Billing</option>
              <option value="incident">Site down / urgent</option>
            </select>
          </Field>
          <Field label="Priority" hint="Urgent = site down or losing sales">
            <select name="priority" defaultValue="normal">
              <option value="low">Low — reply within 3 days</option>
              <option value="normal">Normal — reply within 24 h</option>
              <option value="high">High — reply within 8 h</option>
              <option value="urgent">Urgent — reply within 2 h</option>
            </select>
          </Field>
        </div>
        <Field label="Details" error={fields?.body}>
          <textarea name="body" required rows={5} placeholder="Tell us what you need, which page, and any deadline." />
        </Field>
        {m.isError && !fields && <ErrorBox error={m.error} />}
        <div className="row end gap-s">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={m.isPending}>{m.isPending ? 'Sending…' : 'Send request'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function ClientSupportPage() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['client', 'tickets'], queryFn: () => get<Ticket[]>('/v1/client/tickets') })
  return (
    <>
      <PageHeader
        title="Support"
        sub="Ask for changes, report a problem or ask a question. Every request has a guaranteed response time."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>New request</Button>}
      />
      <NewRequest open={open} onClose={() => setOpen(false)} />
      <Async q={q}>
        {(list) =>
          list.length ? (
            <Card pad={false}>
              <table className="table">
                <thead><tr><th>#</th><th>Request</th><th>Status</th><th>Priority</th><th>Response</th><th>Updated</th></tr></thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id} className="is-link" tabIndex={0} onClick={() => navigate({ to: '/portal/support/$ticketId', params: { ticketId: t.id } })} onKeyDown={(e) => e.key === 'Enter' && navigate({ to: '/portal/support/$ticketId', params: { ticketId: t.id } })}>
                      <td className="muted">{t.number}</td>
                      <td><strong>{t.subject}</strong><div className="muted small clamp">{t.lastMessage}</div></td>
                      <td><StatePill value={t.status} /></td>
                      <td><StatePill value={t.priority} /></td>
                      <td><SlaPill t={t} /></td>
                      <td className="muted">{f.ago(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Empty title="No requests yet">Need something changed? Send a request and we will get on it.</Empty>
          )
        }
      </Async>
    </>
  )
}

export function ClientTicketPage() {
  const { ticketId } = useParams({ strict: false }) as { ticketId: string }
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['client', 'ticket', ticketId], queryFn: () => get<Ticket>(`/v1/client/tickets/${ticketId}`) })
  const reply = useMutation({
    mutationFn: (body: string) => post<Ticket>(`/v1/client/tickets/${ticketId}/messages`, { body }),
    onSuccess: (t) => {
      qc.setQueryData(['client', 'ticket', ticketId], t)
      qc.invalidateQueries({ queryKey: ['client', 'tickets'] })
    },
  })
  return (
    <>
      <Link to="/portal/support" className="back"><ArrowLeft /> All requests</Link>
      <Async q={q}>
        {(t) => (
          <>
            <PageHeader eyebrow={`Request #${t.number} · opened ${f.dateTime(t.createdAt)}`} title={t.subject} actions={<><StatePill value={t.status} /><StatePill value={t.priority} /><SlaPill t={t} /></>} />
            <Card>
              <Thread messages={t.messages ?? []} onSend={(b) => reply.mutate(b)} sending={reply.isPending} placeholder={t.status === 'resolved' ? 'Reply to reopen this request…' : 'Write a reply…'} />
              {reply.isError && <ErrorBox error={reply.error} />}
            </Card>
          </>
        )}
      </Async>
    </>
  )
}
