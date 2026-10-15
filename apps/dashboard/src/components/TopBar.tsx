import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import type { Session } from '~/lib/types';

export interface TopBarProps {
  title: string;
  session: Session;
  onToggleMobileNav: () => void;
  mobileNavOpen: boolean;
  onSignOut: () => void;
}

export function TopBar(props: TopBarProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuWrap: HTMLDivElement | undefined;

  createEffect(() => {
    if (!menuOpen()) return;

    const onPointerDown = (event: PointerEvent) => {
      if (menuWrap && !menuWrap.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  return (
    <header class="topbar">
      <button
        type="button"
        class="topbar__toggle"
        onClick={() => props.onToggleMobileNav()}
        aria-expanded={props.mobileNavOpen}
        aria-controls="sidebar"
        aria-label={props.mobileNavOpen ? 'Close navigation' : 'Open navigation'}
      >
        <span aria-hidden="true">{props.mobileNavOpen ? '✕' : '≡'}</span>
      </button>

      {/* Chrome, not the document heading: each page renders its own h1. */}
      <div class="topbar__titles">
        <p class="topbar__title">{props.title}</p>
      </div>

      <div class="topbar__spacer" />

      <div class="topbar__user" ref={menuWrap}>
        <button
          type="button"
          class="topbar__user-button"
          onClick={() => setMenuOpen(!menuOpen())}
          aria-expanded={menuOpen()}
          aria-haspopup="true"
        >
          <span class="topbar__user-role">{props.session.role}</span>
          <span class="topbar__user-name">{props.session.name}</span>
          <span aria-hidden="true" class="text-faint">
            {menuOpen() ? '▴' : '▾'}
          </span>
        </button>

        <Show when={menuOpen()}>
          <div class="topbar__menu" role="group" aria-label="Account">
            <dl>
              <dt>Signed in as</dt>
              <dd>{props.session.name}</dd>
              <dt>Role</dt>
              <dd>{props.session.role}</dd>
              <Show when={props.session.clientId}>
                <dt>Client</dt>
                <dd class="num">{props.session.clientId}</dd>
              </Show>
            </dl>
            <button
              type="button"
              class="btn btn--small btn--block"
              onClick={() => {
                setMenuOpen(false);
                props.onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </Show>
      </div>
    </header>
  );
}
