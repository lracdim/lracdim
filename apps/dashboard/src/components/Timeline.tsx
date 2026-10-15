import { For, Show } from 'solid-js';
import { formatDate, relativeDays } from '~/lib/format';
import type { Milestone } from '~/lib/types';
import { stageLabel } from '~/lib/workflow';
import { MilestoneBadge } from './Badge';
import { EmptyState } from './EmptyState';

export interface TimelineProps {
  milestones: Milestone[];
  emptyTitle?: string;
  emptyBody?: string;
}

/** Workflow stage history: what is done, what is next. */
export function Timeline(props: TimelineProps) {
  return (
    <Show
      when={props.milestones.length > 0}
      fallback={
        <EmptyState
          bare
          title={props.emptyTitle ?? 'No milestones yet'}
          body={props.emptyBody ?? 'Milestones appear once the project schedule is agreed.'}
        />
      }
    >
      <ol class="timeline">
        <For each={props.milestones}>
          {(milestone) => (
            <li class="timeline__item" data-status={milestone.status}>
              <span class="timeline__dot" aria-hidden="true" />
              <div>
                <p class="timeline__name">{milestone.name}</p>
                <div class="timeline__meta">
                  <MilestoneBadge status={milestone.status} />
                  <span class="label">{stageLabel(milestone.stage)}</span>
                  <span class="label">
                    {milestone.completedAt
                      ? `Completed ${formatDate(milestone.completedAt)}`
                      : `Due ${formatDate(milestone.dueAt)} · ${relativeDays(milestone.dueAt)}`}
                  </span>
                </div>
                <Show when={milestone.note}>
                  <p class="timeline__note">{milestone.note}</p>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}
