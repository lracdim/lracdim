import { Outlet, useRouterState } from '@tanstack/solid-router';
import { AppShell } from '~/components/AppShell';
import { ADMIN_NAV, CLIENT_NAV, titleForPath } from '~/lib/nav';

function usePageTitle() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return () => titleForPath(pathname());
}

/** Shell for every /admin route. */
export function AdminLayout() {
  const title = usePageTitle();
  return (
    <AppShell title={title()} sectionLabel="Studio" nav={ADMIN_NAV}>
      <Outlet />
    </AppShell>
  );
}

/** Shell for every /client route. */
export function ClientLayout() {
  const title = usePageTitle();
  return (
    <AppShell title={title()} sectionLabel="Your account" nav={CLIENT_NAV}>
      <Outlet />
    </AppShell>
  );
}
