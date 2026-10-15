/**
 * Focus management for the two overlay surfaces: ConfirmDialog and the mobile
 * sidebar. Keeps Tab inside the container, restores focus on teardown.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

export interface TrapOptions {
  /** Called on Escape. */
  onEscape?: () => void;
  /** Element to focus first. Defaults to the first focusable child. */
  initialFocus?: () => HTMLElement | null | undefined;
}

/**
 * Traps focus inside `container` and returns a teardown function that also
 * returns focus to whatever was focused when the trap was created.
 */
export function createFocusTrap(container: HTMLElement, options: TrapOptions = {}): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      options.onEscape?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = focusableWithin(container);
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);

  const target = options.initialFocus?.() ?? focusableWithin(container)[0] ?? container;
  // Defer so the element exists and is laid out before we move focus.
  queueMicrotask(() => target?.focus());

  return () => {
    container.removeEventListener('keydown', onKeyDown);
    previouslyFocused?.focus?.();
  };
}
