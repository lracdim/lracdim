import { useSyncExternalStore } from 'react'
import type { User } from './types'

/**
 * The bearer session issued by the studio API (worker/src/studio/auth.js),
 * held in localStorage. The token is opaque: the Worker stores only its
 * SHA-256, it expires after 12 hours (1 hour for "view as client"), and
 * signing out deletes it server-side.
 */
export interface Session {
  token: string
  expiresAt: string
  user: User
}

const KEY = 'ld.session'
const ADMIN_KEY = 'ld.adminSession'
const listeners = new Set<() => void>()

function read(key: string): Session | null {
  try {
    const raw = localStorage.getItem(key)
    const s = raw ? (JSON.parse(raw) as Session) : null
    // An expired session is as good as none; the server would refuse it anyway.
    if (s && s.expiresAt && Date.parse(s.expiresAt) <= Date.now()) {
      localStorage.removeItem(key)
      return null
    }
    return s
  } catch {
    return null
  }
}

let current = read(KEY)

export const session = {
  get: () => current,
  set(s: Session | null) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s))
      else localStorage.removeItem(KEY)
    } catch {
      // Storage blocked (private mode): the session lasts for this page only.
    }
    current = s
    listeners.forEach((l) => l())
  },
  /** Admin "view as client": park the admin session and switch to the client one. */
  impersonate(client: Session) {
    if (current && current.user.role === 'admin') localStorage.setItem(ADMIN_KEY, JSON.stringify(current))
    session.set(client)
  },
  /** Leave "view as client" and return to the parked admin session (null when it expired meanwhile). */
  restoreAdmin(): boolean {
    const admin = read(ADMIN_KEY)
    localStorage.removeItem(ADMIN_KEY)
    session.set(admin)
    return Boolean(admin)
  },
  canRestoreAdmin: () => Boolean(read(ADMIN_KEY)),
  signOut() {
    localStorage.removeItem(ADMIN_KEY)
    session.set(null)
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, session.get, session.get)
}
