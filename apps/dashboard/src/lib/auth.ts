/**
 * TEMPORARY MOCK AUTH.
 *
 * A signal mirrored into localStorage so a page reload keeps you signed in.
 * There is no verification of any kind here; /login simply lets you pick a
 * role.
 *
 * TODO(api): replace with a real session.
 *   - POST {VITE_API_BASE}/api/auth/login  -> sets an httpOnly session cookie
 *   - GET  {VITE_API_BASE}/api/auth/session -> returns the current Session
 *   - POST {VITE_API_BASE}/api/auth/logout
 *   The role and clientId must come from the server, never from the client,
 *   and route guards below become a UX convenience only. Authorisation has to
 *   be enforced per request by the Litestar API.
 */

import { createSignal } from 'solid-js';
import type { Role, Session } from './types';

const STORAGE_KEY = 'lracdim.dashboard.session';

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed || (parsed.role !== 'admin' && parsed.role !== 'client')) return null;
    return parsed;
  } catch {
    return null;
  }
}

const [session, setSessionSignal] = createSignal<Session | null>(read());

export { session };

export function signIn(next: Session): void {
  setSessionSignal(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private browsing: the session stays in memory only */
  }
}

export function signOut(): void {
  setSessionSignal(null);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasRole(role: Role): boolean {
  return session()?.role === role;
}

/** The signed-in client's id, or null. Used to scope every client query. */
export function currentClientId(): string | null {
  const current = session();
  return current?.role === 'client' ? (current.clientId ?? null) : null;
}

/** The two accounts /login can assume while auth is mocked. */
export const MOCK_ACCOUNTS: Session[] = [
  { userId: 'usr_admin', name: 'John Carl Dimatulac', role: 'admin' },
  {
    userId: 'usr_client_northfield',
    name: 'Marguerite Okonkwo',
    role: 'client',
    clientId: 'cli_northfield',
  },
];
