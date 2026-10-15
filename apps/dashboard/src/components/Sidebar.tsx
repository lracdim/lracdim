import { For, createEffect, onCleanup } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { createFocusTrap } from '~/lib/focusTrap';
import type { NavItem } from '~/lib/nav';

export interface SidebarProps {
  /** Heading for the navigation group, e.g. "Studio" or "Your account". */
  sectionLabel: string;
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Collapsible sidebar. On desktop the collapsed state is a narrow icon rail;
 * below 860px it becomes an overlay with a focus trap and Escape to close.
 */
export function Sidebar(props: SidebarProps) {
  let nav: HTMLElement | undefined;

  createEffect(() => {
    if (!props.mobileOpen || !nav) return;

    const release = createFocusTrap(nav, { onEscape: () => props.onCloseMobile() });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      release();
    });
  });

  return (
    <>
      {/* Scrim is hidden by CSS unless the mobile overlay is open. */}
      <button
        type="button"
        class="sidebar__scrim"
        tabindex={props.mobileOpen ? 0 : -1}
        aria-label="Close navigation"
        onClick={() => props.onCloseMobile()}
      />

      <nav
        class="sidebar"
        id="sidebar"
        aria-label="Dashboard sections"
        ref={nav}
      >
        <div class="sidebar__brand">
          <span class="sidebar__mark" aria-hidden="true">
            LD
          </span>
          <span class="sidebar__wordmark">
            Lracdimension
            <small>Studio dashboard</small>
          </span>
        </div>

        <p class="sidebar__section label" id="sidebar-section-label">
          {props.sectionLabel}
        </p>

        <ul class="sidebar__nav" aria-labelledby="sidebar-section-label">
          <For each={props.items}>
            {(item) => (
              <li>
                <Link
                  to={item.to}
                  class="sidebar__link"
                  activeOptions={{ exact: item.exact ?? false }}
                  activeProps={{ 'aria-current': 'page' }}
                  onClick={() => props.onCloseMobile()}
                >
                  <span class="sidebar__link-index" aria-hidden="true">
                    {item.index}
                  </span>
                  <span class="sidebar__link-text">{item.label}</span>
                </Link>
              </li>
            )}
          </For>
        </ul>

        <div class="sidebar__foot">
          <button
            type="button"
            class="sidebar__collapse"
            onClick={() => props.onToggleCollapsed()}
            aria-expanded={!props.collapsed}
            aria-controls="sidebar"
          >
            <span aria-hidden="true">{props.collapsed ? '»' : '«'}</span>
            <span class="sidebar__collapse-text">
              {props.collapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
