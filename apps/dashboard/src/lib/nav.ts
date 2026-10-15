/**
 * Navigation definitions. Admin and client see different sidebars.
 *
 * Paths are a literal union so the router can type-check every Link target.
 */

export type NavPath =
  | '/login'
  | '/admin'
  | '/admin/leads'
  | '/admin/projects'
  | '/admin/clients'
  | '/admin/content'
  | '/client'
  | '/client/files'
  | '/client/messages';

export interface NavItem {
  to: NavPath;
  label: string;
  /** Two-character monospace index shown before the label. */
  index: string;
  /** Match the exact path only. Used for section index pages. */
  exact?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', index: '01', exact: true },
  { to: '/admin/leads', label: 'Leads', index: '02' },
  { to: '/admin/projects', label: 'Projects', index: '03' },
  { to: '/admin/clients', label: 'Clients', index: '04' },
  { to: '/admin/content', label: 'Content', index: '05' },
];

export const CLIENT_NAV: NavItem[] = [
  { to: '/client', label: 'Your project', index: '01', exact: true },
  { to: '/client/files', label: 'Files', index: '02' },
  { to: '/client/messages', label: 'Messages', index: '03' },
];

/** Chrome title for the top bar, derived from the current pathname. */
export function titleForPath(pathname: string): string {
  if (pathname.startsWith('/client/projects/')) return 'Project';

  const exact: Record<string, string> = {
    '/admin': 'Overview',
    '/admin/leads': 'Leads',
    '/admin/projects': 'Projects',
    '/admin/clients': 'Clients',
    '/admin/content': 'Content',
    '/client': 'Your project',
    '/client/files': 'Files',
    '/client/messages': 'Messages',
  };

  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return exact[trimmed] ?? 'Dashboard';
}
