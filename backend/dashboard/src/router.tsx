import type { ReactNode } from 'react'
import { createRootRoute, createRoute, createRouter, Link, Outlet, redirect } from '@tanstack/react-router'
import { session } from './lib/session'
import { Shell } from './components/Shell'
import LoginPage from './pages/Login'
import InvitePage from './pages/Invite'
import ClientOverviewPage from './pages/client/Overview'
import { ClientHealthPage } from './pages/client/SiteReports'
import { ClientProjectsPage, ClientReportsPage, ClientWorkPage } from './pages/client/Delivery'
import { ClientSupportPage, ClientTicketPage } from './pages/client/Support'
import ClientBillingPage from './pages/client/Billing'
import AdminOverviewPage from './pages/admin/Overview'
import AdminPipelinePage from './pages/admin/Pipeline'
import { AdminClientPage, AdminClientsPage } from './pages/admin/Clients'
import { AdminAuditPage, AdminSitePage, AdminSitesPage } from './pages/admin/Sites'
import { AdminProjectsPage, AdminSupportPage, AdminTicketPage, AdminWorkPage } from './pages/admin/Delivery'
import { AdminActivityPage, AdminBillingPage, AdminSettingsPage } from './pages/admin/Finance'

const home = () => (session.get()?.user.role === 'admin' ? '/admin' : '/portal')

const root = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <div className="login">
      <div className="login__card">
        <h1>Page not found</h1>
        <p className="muted">That page does not exist.</p>
        <Link className="btn btn--primary" to={home()}>Go to dashboard</Link>
      </div>
    </div>
  ),
})

const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: session.get() ? home() : '/login' })
  },
})

const login = createRoute({
  getParentRoute: () => root,
  path: '/login',
  beforeLoad: () => {
    if (session.get()) throw redirect({ to: home() })
  },
  component: LoginPage,
})

/* The invite link (/invite#t=<token>) works whether or not someone is signed in on this browser. */
const invite = createRoute({ getParentRoute: () => root, path: '/invite', component: InvitePage })

/* ---- client portal: only client accounts (or an admin viewing as a client) */
const portal = createRoute({
  getParentRoute: () => root,
  path: '/portal',
  beforeLoad: () => {
    const s = session.get()
    if (!s) throw redirect({ to: '/login' })
    if (s.user.role !== 'client') throw redirect({ to: '/admin' })
  },
  component: () => <Shell area="client" />,
})
const p = (path: string, component: () => ReactNode) => createRoute({ getParentRoute: () => portal, path, component })

/* ---- studio admin */
const admin = createRoute({
  getParentRoute: () => root,
  path: '/admin',
  beforeLoad: () => {
    const s = session.get()
    if (!s) throw redirect({ to: '/login' })
    if (s.user.role !== 'admin') throw redirect({ to: '/portal' })
  },
  component: () => <Shell area="admin" />,
})
const a = (path: string, component: () => ReactNode) => createRoute({ getParentRoute: () => admin, path, component })

const auditRoute = createRoute({
  getParentRoute: () => admin,
  path: '/audit',
  validateSearch: (s: Record<string, unknown>) => ({
    url: typeof s.url === 'string' ? s.url : undefined,
    id: typeof s.id === 'string' ? s.id : undefined,
  }),
  component: AdminAuditPage,
})

const tree = root.addChildren([
  index,
  login,
  invite,
  portal.addChildren([
    p('/', ClientOverviewPage),
    p('/health', ClientHealthPage),
    p('/projects', ClientProjectsPage),
    p('/work', ClientWorkPage),
    p('/reports', ClientReportsPage),
    p('/support', ClientSupportPage),
    p('/support/$ticketId', ClientTicketPage),
    p('/billing', ClientBillingPage),
  ]),
  admin.addChildren([
    a('/', AdminOverviewPage),
    a('/pipeline', AdminPipelinePage),
    auditRoute,
    a('/clients', AdminClientsPage),
    a('/clients/$clientId', AdminClientPage),
    a('/sites', AdminSitesPage),
    a('/sites/$siteId', AdminSitePage),
    a('/projects', AdminProjectsPage),
    a('/work', AdminWorkPage),
    a('/support', AdminSupportPage),
    a('/support/$ticketId', AdminTicketPage),
    a('/billing', AdminBillingPage),
    a('/activity', AdminActivityPage),
    a('/settings', AdminSettingsPage),
  ]),
])

export const router = createRouter({ routeTree: tree, defaultPreload: 'intent', scrollRestoration: true })
