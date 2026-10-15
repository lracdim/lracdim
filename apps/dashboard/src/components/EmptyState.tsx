import { Show, type JSX } from 'solid-js';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Drops the dashed frame, for use inside an already-framed panel. */
  bare?: boolean;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class={props.bare ? 'empty empty--bare' : 'empty'}>
      <p class="empty__title">{props.title}</p>
      <Show when={props.body}>
        <p class="empty__body">{props.body}</p>
      </Show>
      <Show when={props.action}>{props.action}</Show>
    </div>
  );
}
