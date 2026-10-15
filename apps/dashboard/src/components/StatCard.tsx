import { Show } from 'solid-js';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  /** Draws the value in the accent colour. Use for at most one card per row. */
  accent?: boolean;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="stat">
      <span class="label">{props.label}</span>
      <strong class={props.accent ? 'stat__value stat__value--accent' : 'stat__value'}>
        {props.value}
      </strong>
      <Show when={props.hint}>
        <span class="stat__hint">{props.hint}</span>
      </Show>
    </div>
  );
}
