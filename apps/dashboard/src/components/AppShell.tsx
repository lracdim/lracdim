import { createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { session, signOut } from '~/lib/auth';
import type { NavItem } from '~/lib/nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_KEY = 'lracdim.dashboard.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface AppShellProps {
  /** Shown in the top bar. */
  title: string;
  sectionLabel: string;
  nav: NavItem[];
  children: JSX.Element;
}

/** Sidebar plus top bar plus content region. */
export function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = createSignal(readCollapsed());
  const [mobileOpen, setMobileOpen] = createSignal(false);

  createEffect(() => {
    const value = collapsed();
    try {
      localStorage.setItem(COLLAPSE_KEY, String(value));
    } catch {
      /* private browsing: the preference lasts for this page only */
    }
  });

  // A viewport change back to desktop should not leave the overlay state set.
  createEffect(() => {
    const query = window.matchMedia('(min-width: 861px)');
    const onChange = () => {
      if (query.matches) setMobileOpen(false);
    };
    query.addEventListener('change', onChange);
    onCleanup(() => query.removeEventListener('change', onChange));
  });

  const currentSession = () => session();

  function handleSignOut() {
    signOut();
    void navigate({ to: '/login' });
  }

  return (
    <div
      class="shell"
      data-collapsed={String(collapsed())}
      data-mobile-open={String(mobileOpen())}
    >
      <a class="skip-link" href="#main">
        Skip to content
      </a>

      <Sidebar
        sectionLabel={props.sectionLabel}
        items={props.nav}
        collapsed={collapsed()}
        onToggleCollapsed={() => setCollapsed(!collapsed())}
        mobileOpen={mobileOpen()}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div class="shell__main">
        <TopBar
          title={props.title}
          session={
            currentSession() ?? { userId: '', name: 'Signed out', role: 'client' }
          }
          mobileNavOpen={mobileOpen()}
          onToggleMobileNav={() => setMobileOpen(!mobileOpen())}
          onSignOut={handleSignOut}
        />
        <main class="shell__content" id="main" tabindex="-1">
          {props.children}
        </main>
      </div>
    </div>
  );
}
