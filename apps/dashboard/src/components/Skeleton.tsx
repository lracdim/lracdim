import { For, Show } from 'solid-js';

export interface SkeletonProps {
  /** CSS height, e.g. "14px" or "120px". */
  height?: string;
  width?: string;
}

export function Skeleton(props: SkeletonProps) {
  return (
    <span
      class="skeleton"
      aria-hidden="true"
      style={{ height: props.height ?? '14px', width: props.width ?? '100%' }}
    />
  );
}

export interface SkeletonBlockProps {
  /** Number of placeholder lines. */
  lines?: number;
  height?: string;
  /** Announced to assistive technology while content loads. */
  label?: string;
}

/**
 * A labelled group of skeleton lines. Use this rather than a bare Skeleton for
 * a whole loading region so screen readers hear that something is loading.
 */
export function SkeletonBlock(props: SkeletonBlockProps) {
  const count = () => props.lines ?? 3;

  return (
    <div class="skeleton-stack" role="status" aria-live="polite">
      <span class="visually-hidden">{props.label ?? 'Loading'}</span>
      <For each={Array.from({ length: count() })}>
        {(_, index) => (
          <Skeleton
            height={props.height ?? '14px'}
            width={index() === count() - 1 ? '62%' : '100%'}
          />
        )}
      </For>
    </div>
  );
}

export interface SkeletonCardsProps {
  count?: number;
  label?: string;
}

export function SkeletonCards(props: SkeletonCardsProps) {
  return (
    <div class="grid grid--stats" role="status" aria-live="polite">
      <span class="visually-hidden">{props.label ?? 'Loading'}</span>
      <For each={Array.from({ length: props.count ?? 4 })}>
        {() => (
          <div class="stat">
            <Skeleton height="11px" width="45%" />
            <div style={{ height: '12px' }} />
            <Skeleton height="30px" width="60%" />
          </div>
        )}
      </For>
    </div>
  );
}

export interface ErrorStateProps {
  code?: string;
  message?: string;
  onRetry?: () => void;
}

/** The error half of every async view. */
export function ErrorState(props: ErrorStateProps) {
  return (
    <div class="error-state" role="alert">
      <span class="error-state__code">{props.code ?? 'request_failed'}</span>
      <p class="error-state__message">
        {props.message ?? 'Something went wrong loading this view.'}
      </p>
      <Show when={props.onRetry}>
        <button type="button" class="btn btn--small" onClick={() => props.onRetry?.()}>
          Try again
        </button>
      </Show>
    </div>
  );
}
