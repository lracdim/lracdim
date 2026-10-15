import { Show, type JSX } from 'solid-js';
import { formatDate, labelFor, relativeDays } from '~/lib/format';
import type { Project } from '~/lib/types';
import { stageLabel, stageProgress } from '~/lib/workflow';
import { StageBadge } from './Badge';

export interface ProjectStatusCardProps {
  project: Project;
  /**
   * Optional call to action rendered in the card footer, typically a router
   * Link. Kept as a slot rather than a href so the card does not become one
   * enormous link target.
   */
  action?: JSX.Element;
}

/** Current phase and progress for one project. */
export function ProjectStatusCard(props: ProjectStatusCardProps) {
  const percent = () => Math.round(stageProgress(props.project.stage) * 100);
  const completed = () =>
    props.project.milestones.filter((milestone) => milestone.status === 'complete').length;

  return (
    <article class="project-card">
      <div class="project-card__head">
        <div>
          <span class="label">{labelFor.projectType(props.project.projectType)}</span>
          <h3 class="project-card__name">{props.project.name}</h3>
        </div>
        <StageBadge stage={props.project.stage} />
      </div>

      <p class="project-card__summary">{props.project.summary}</p>

      <div class="project-card__phase">
        <span class="label label--signal">Phase: {stageLabel(props.project.stage)}</span>
        <span class="label num">{percent()}%</span>
      </div>
      <div
        class="meter"
        role="progressbar"
        aria-valuenow={percent()}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label={`${props.project.name} delivery progress`}
      >
        <span class="meter__fill" style={{ width: `${percent()}%` }} />
      </div>

      <div class="project-card__foot">
        <div>
          <span class="label">Milestones</span>
          <p class="num text-small">
            {completed()} of {props.project.milestones.length} complete
          </p>
        </div>
        <div>
          <span class="label">Target</span>
          <p class="num text-small">
            {formatDate(props.project.dueAt)}{' '}
            <span class="text-faint">{relativeDays(props.project.dueAt)}</span>
          </p>
        </div>
        <Show when={props.action}>
          <div style={{ 'margin-left': 'auto', 'align-self': 'center' }}>{props.action}</div>
        </Show>
      </div>
    </article>
  );
}
