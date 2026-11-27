import { useEffect, useState, type ComponentType } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity, Briefcase, Eye, FileText, FolderKanban, Globe, HeartPulse, LayoutDashboard,
  LifeBuoy, LogOut, Menu, Radar, Receipt, Settings, Users, Wrench, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { session, useSession } from '../lib/session'
import { cx } from './ui'

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean }
type NavGroup = { title?: string; items: NavItem[] }

const CLIENT_NAV: NavGroup[] = [
  { items: [{ to: '/portal', label: 'Overview', icon: LayoutDashboard, exact: true }] },
  {
    title: 'Your website',
    items: [{ to: '/portal/health', label: 'Website health', icon: HeartPulse }],
  },
  {
    title: 'Working together',
    items: [
      { to: '/portal/projects', label: 'Projects & approvals', icon: FolderKanban },
      { to: '/portal/work', label: 'Work log', icon: Wrench },
      { to: '/portal/reports', label: 'Monthly reports', icon: FileText },
      { to: '/portal/support', label: 'Support', icon: LifeBuoy },
      { to: '/portal/billing', label: 'Plan & billing', icon: Receipt },
    ],
  },
]

const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { to: '/admin', label: 'Command centre', icon: LayoutDashboard, exact: true },
      { to: '/admin/activity', label: 'Activity log', icon: Activity },
    ],
  },
  {
    title: 'Growth',
    items: [
      { to: '/admin/pipeline', label: 'Sales pipeline', icon: Briefcase },
      { to: '/admin/audit', label: 'Website audit', icon: Radar },
    ],
  },
  {
    title: 'Clients',
    items: [
      { to: '/admin/clients', label: 'Clients', icon: Users },
      { to: '/admin/sites', label: 'Websites & monitoring', icon: Globe },
    ],
  },
  {
    title: 'Delivery',
    items: [
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
      { to: '/admin/work', label: 'Time & work log', icon: Wrench },
      { to: '/admin/support', label: 'Support desk', icon: LifeBuoy },
    ],
  },
  { title: 'Finance', items: [{ to: '/admin/billing', label: 'Billing & revenue', icon: Receipt }] },
  { title: 'System', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings }] },
]

/** The LRACDIMENSION mark, the same file the marketing site uses (public/brand/mark.png). */
export function BrandMark({ size = 30 }: { size?: number }) {
  return <img src="/brand/mark.png" width={size} height={size} alt="" aria-hidden="true" className="brand__mark" />
}

/** The wordmark as the site sets it: "//lracdim" in signal gold, "ension" in the text colour. */
export function Logotype() {
  return (
    <span className="logotype" aria-label="lracdimension">
      <span className="logotype__signal">//lracdim</span>
      <span className="logotype__rest">ension</span>
    </span>
  )
}

export function Shell({ area }: { area: 'admin' | 'client' }) {
  const s = useSession()
  const nav = area === 'admin' ? ADMIN_NAV : CLIENT_NAV
  const navigate = useNavigate()
  const qc = useQueryClient()
  const path = useRouterState({ select: (r) => r.location.pathname })
  const [open, setOpen] = useState(false)
  const viewingAs = area === 'client' && session.canRestoreAdmin()

  useEffect(() => setOpen(false), [path])

  // Signing out deletes the session server-side too; the local sign-out happens even if that call fails.
  const endSession = (token: string | undefined) => (token ? api('/v1/auth/logout', { method: 'POST', token }).catch(() => undefined) : Promise.resolve())
  const signOut = () => {
    const parked = session.canRestoreAdmin()
    void endSession(s?.token)
    if (parked) {
      // Viewing as a client: end the admin's parked session as well.
      session.restoreAdmin()
      void endSession(session.get()?.token)
    }
    session.signOut()
    qc.clear()
    navigate({ to: '/login' })
  }
  const backToAdmin = () => {
    void endSession(s?.token) // the one-hour "view as client" session
    const restored = session.restoreAdmin()
    qc.clear()
    navigate({ to: restored ? '/admin/clients' : '/login' })
  }

  return (
    <div className={cx('shell', open && 'nav-open')}>
      <aside className="side" aria-label="Main navigation">
        <div className="side__brand">
          <BrandMark />
          <div>
            <strong><Logotype /></strong>
            <span>{area === 'admin' ? 'Studio admin' : 'Client portal'}</span>
          </div>
          <button type="button" className="icon-btn side__close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <nav className="side__nav">
          {nav.map((g, gi) => (
            <div className="side__group" key={gi}>
              {g.title && <div className="side__title">{g.title}</div>}
              {g.items.map(({ to, label, icon: Icon, exact }) => (
                <Link key={to} to={to} className="side__link" activeProps={{ className: 'is-active' }} activeOptions={{ exact: Boolean(exact) }}>
                  <Icon className="side__icon" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side__user">
          <div className="avatar" aria-hidden="true">
            {s?.user.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="side__who">
            <strong>{s?.user.name}</strong>
            <span>{s?.user.email}</span>
          </div>
          <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <BrandMark size={26} />
          <strong><Logotype /></strong>
        </div>
        {viewingAs && (
          <div className="viewas" role="status">
            <Eye aria-hidden="true" />
            <span>
              You are viewing the portal as <b>{s?.user.name}</b>. Actions you take here are made in their name; the activity log notes they were made by you. This view ends after an hour.
            </span>
            <button type="button" className="btn btn--primary btn--sm" onClick={backToAdmin}>
              Return to admin
            </button>
          </div>
        )}
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
    </div>
  )
}
