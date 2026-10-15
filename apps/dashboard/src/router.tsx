/**
 * Code-based route tree. Nine routes, two guarded sections.
 *
 * Route guards here are a UX convenience: they keep a signed-out or wrong-role
 * visitor out of a section that would only show them errors.
 *
 * SECURITY: they are not authorisation. The Litestar API must authorise every
 * request from the session on the server. Anyone can edit localStorage and
 * reach an admin route; only the API can stop them seeing admin data.
 */

import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/solid-router';
import { session } from '~/lib/auth';
import { AdminClients } from '~/routes/AdminClients';
import { AdminContent } from '~/routes/AdminContent';
import { AdminLeads } from '~/routes/AdminLeads';
import { AdminOverview } from '~/routes/AdminOverview';
import { AdminProjects } from '~/routes/AdminProjects';
import { ClientFiles } from '~/routes/ClientFiles';
import { ClientMessages } from '~/routes/ClientMessages';
import { ClientOverview } from '~/routes/ClientOverview';
import { ClientProject } from '~/routes/ClientProject';
import { Login } from '~/routes/Login';
import { NotFound } from '~/routes/NotFound';
import { AdminLayout, ClientLayout } from '~/routes/layouts';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

/** '/' sends you wherever your role belongs. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const current = session();
    if (!current) throw redirect({ to: '/login' });
    throw redirect({ to: current.role === 'admin' ? '/admin' : '/client' });
  },
  component: () => null,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
});

/* -- admin -------------------------------------------------------------- */

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: () => {
    const current = session();
    // Signed out, or signed in as a client: back to the sign-in screen.
    if (!current || current.role !== 'admin') throw redirect({ to: '/login' });
  },
  component: AdminLayout,
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: AdminOverview,
});

const adminLeadsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'leads',
  // Optional property, so a Link to /admin/leads need not pass search.
  validateSearch: (search: Record<string, unknown>): { lead?: string } =>
    typeof search.lead === 'string' ? { lead: search.lead } : {},
  component: AdminLeads,
});

const adminProjectsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'projects',
  component: AdminProjects,
});

const adminClientsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'clients',
  component: AdminClients,
});

const adminContentRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'content',
  component: AdminContent,
});

/* -- client ------------------------------------------------------------- */

const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/client',
  beforeLoad: () => {
    const current = session();
    if (!current || current.role !== 'client') throw redirect({ to: '/login' });
  },
  component: ClientLayout,
});

const clientIndexRoute = createRoute({
  getParentRoute: () => clientRoute,
  path: '/',
  component: ClientOverview,
});

const clientProjectRoute = createRoute({
  getParentRoute: () => clientRoute,
  path: 'projects/$projectId',
  component: ClientProject,
});

const clientFilesRoute = createRoute({
  getParentRoute: () => clientRoute,
  path: 'files',
  component: ClientFiles,
});

const clientMessagesRoute = createRoute({
  getParentRoute: () => clientRoute,
  path: 'messages',
  component: ClientMessages,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  adminRoute.addChildren([
    adminIndexRoute,
    adminLeadsRoute,
    adminProjectsRoute,
    adminClientsRoute,
    adminContentRoute,
  ]),
  clientRoute.addChildren([
    clientIndexRoute,
    clientProjectRoute,
    clientFilesRoute,
    clientMessagesRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router;
  }
}
