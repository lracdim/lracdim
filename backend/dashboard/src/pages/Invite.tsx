import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { ApiError, post } from '../lib/api'
import { session } from '../lib/session'
import type { SessionResponse } from '../lib/types'
import { BrandMark, Logotype } from '../components/Shell'
import { Button, ErrorBox, Field, Skeleton } from '../components/ui'

const MIN = 10 // MIN_PASSWORD in worker/src/studio/auth.js

/**
 * /invite#t=<token>: a client sets their password and is signed in. The token
 * travels in the fragment, so it never reaches a server log or a Referer; it
 * is read once and removed from the address bar.
 */
export default function InvitePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('t') || '')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }, [])
  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: () => post<{ email: string; name: string; company: string | null; expiresAt: string; reset: boolean }>('/v1/auth/invite-info', { token }),
    enabled: Boolean(token),
    retry: false,
  })
  const accept = useMutation({
    mutationFn: () => post<SessionResponse>('/v1/auth/accept-invite', { token, password }),
    onSuccess: (s) => {
      qc.clear()
      session.set(s) // replaces whoever was signed in on this browser before
      navigate({ to: '/portal' })
    },
  })
  const mismatch = again.length > 0 && again !== password
  const fieldError = accept.error instanceof ApiError ? accept.error.fields?.password : undefined
  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <BrandMark size={40} />
          <div>
            <strong><Logotype /></strong>
            <span>Client portal</span>
          </div>
        </div>
        {!token ? (
          <>
            <h1>Invite link incomplete</h1>
            <p className="muted">Open the full link from the studio's message, or ask for a new one.</p>
            <Link className="btn btn--ghost" to="/login">Go to sign in</Link>
          </>
        ) : info.isPending ? (
          <Skeleton />
        ) : info.isError ? (
          <>
            <h1>This link does not work</h1>
            <ErrorBox error={info.error} />
            <Link className="btn btn--ghost" to="/login">Go to sign in</Link>
          </>
        ) : (
          <>
            <h1>{info.data.reset ? 'Choose a new password' : `Welcome${info.data.company ? `, ${info.data.company}` : ''}`}</h1>
            <p className="muted small">
              Signing in as <b>{info.data.email}</b>. Choose a password of at least {MIN} characters.
            </p>
            <form className="form" onSubmit={(e) => { e.preventDefault(); if (!mismatch) accept.mutate() }}>
              <input type="email" autoComplete="username" value={info.data.email} readOnly hidden />
              <Field label="Password" error={fieldError}>
                <input type="password" autoComplete="new-password" minLength={MIN} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Field label="Password again" error={mismatch ? 'The passwords do not match.' : undefined}>
                <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
              </Field>
              {accept.isError && !fieldError && <ErrorBox error={accept.error} />}
              <Button variant="primary" type="submit" className="btn--block" disabled={accept.isPending || mismatch || password.length < MIN}>
                {accept.isPending ? 'Saving…' : 'Set password and sign in'} <ArrowRight />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
