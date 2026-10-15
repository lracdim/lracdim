import { Match, Switch, type Accessor, type JSX } from 'solid-js';
import { isApiError } from '~/api/client';
import { EmptyState } from './EmptyState';
import { ErrorState, SkeletonBlock } from './Skeleton';

/** The subset of a TanStack query result this component needs. */
export interface QueryLike<T> {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: T | undefined;
  refetch: () => unknown;
}

export interface QueryViewProps<T> {
  query: QueryLike<T>;
  /** Replaces the default skeleton. */
  loading?: JSX.Element;
  /** Describes the region for screen readers while loading. */
  loadingLabel?: string;
  /** Returns true when the loaded data should show the empty state. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: JSX.Element;
  /** Receives an accessor so the loaded view stays reactive on refetch. */
  children: (data: Accessor<T>) => JSX.Element;
}

/**
 * Loading, error and empty states for one async region, so no view can quietly
 * render nothing. Components pass a hook result straight through.
 */
export function QueryView<T>(props: QueryViewProps<T>) {
  const errorParts = () => {
    const error = props.query.error;
    if (isApiError(error)) return error;
    if (error instanceof Error) return { code: 'unexpected_error', message: error.message };
    return { code: 'unexpected_error', message: 'The request failed.' };
  };

  const data = () => props.query.data as T;
  const loaded = () => props.query.data !== undefined;

  return (
    <Switch>
      <Match when={props.query.isPending}>
        {props.loading ?? <SkeletonBlock lines={4} label={props.loadingLabel} />}
      </Match>
      <Match when={props.query.isError}>
        <ErrorState
          code={errorParts().code}
          message={errorParts().message}
          onRetry={() => void props.query.refetch()}
        />
      </Match>
      <Match when={loaded() && props.isEmpty?.(data())}>
        <EmptyState
          title={props.emptyTitle ?? 'Nothing here yet'}
          body={props.emptyBody}
          action={props.emptyAction}
        />
      </Match>
      <Match when={loaded()}>{props.children(data)}</Match>
    </Switch>
  );
}
