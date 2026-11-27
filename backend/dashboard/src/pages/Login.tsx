import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { post } from '../lib/api'
import { session } from '../lib/session'
import type { SessionResponse } from '../lib/types'
import { BrandMark, Logotype } from '../components/Shell'
import { Button, ErrorBox, Field } from '../components/ui'

export default function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: (b: { email: string; password: string }) => post<SessionResponse>('/v1/auth/login', b),
    onSuccess: (s) => {
      qc.clear()
      session.set(s)
      navigate({ to: s.user.role === 'admin' ? '/admin' : '/portal' })
    },
  })
  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <BrandMark size={40} />
          <div>
            <strong><Logotype /></strong>
            <span>Client portal & studio admin</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <form className="form" onSubmit={(e) => { e.preventDefault(); login.mutate({ email, password }) }}>
          <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {login.isError && <ErrorBox error={login.error} />}
          <Button variant="primary" type="submit" disabled={login.isPending} className="btn--block">
            {login.isPending ? 'Signing in…' : 'Sign in'} <ArrowRight />
          </Button>
        </form>
        <p className="muted small">Clients: use the invite link the studio sent you to set your password. Forgotten it? Ask the studio for a new link.</p>
      </div>
    </div>
  )
}
