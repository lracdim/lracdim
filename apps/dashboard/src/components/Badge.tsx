import type { JSX } from 'solid-js';
import type { ContentStatus, DeliverableStatus, MilestoneStatus } from '~/lib/types';
import type { WorkflowStage } from '~/lib/workflow';
import { stageLabel } from '~/lib/workflow';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Hides the leading square, for badges that are plain labels. */
  plain?: boolean;
  children: JSX.Element;
}

export function Badge(props: BadgeProps) {
  const classes = () =>
    ['badge', props.tone && props.tone !== 'neutral' ? `badge--${props.tone}` : '', props.plain ? 'badge--plain' : '']
      .filter(Boolean)
      .join(' ');

  return <span class={classes()}>{props.children}</span>;
}

/* -- domain-specific tone maps ----------------------------------------- */

const STAGE_TONES: Partial<Record<WorkflowStage, BadgeTone>> = {
  diagnostic_submitted: 'info',
  lead_review: 'info',
  discovery_call: 'info',
  qualified: 'ok',
  declined: 'crit',
  proposal: 'warn',
  contract_deposit: 'warn',
  onboarding: 'accent',
  strategy: 'accent',
  design: 'accent',
  development: 'accent',
  qa_approval: 'warn',
  launch: 'ok',
  maintenance: 'ok',
  archived: 'neutral',
};

export function StageBadge(props: { stage: WorkflowStage }) {
  return <Badge tone={STAGE_TONES[props.stage] ?? 'neutral'}>{stageLabel(props.stage)}</Badge>;
}

const MILESTONE_TONES: Record<MilestoneStatus, BadgeTone> = {
  complete: 'ok',
  in_progress: 'accent',
  upcoming: 'neutral',
  blocked: 'crit',
};

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  upcoming: 'Upcoming',
  blocked: 'Blocked',
};

export function MilestoneBadge(props: { status: MilestoneStatus }) {
  return <Badge tone={MILESTONE_TONES[props.status]}>{MILESTONE_LABELS[props.status]}</Badge>;
}

const DELIVERABLE_TONES: Record<DeliverableStatus, BadgeTone> = {
  draft: 'neutral',
  in_review: 'warn',
  approved: 'ok',
  delivered: 'ok',
};

const DELIVERABLE_LABELS: Record<DeliverableStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  delivered: 'Delivered',
};

export function DeliverableBadge(props: { status: DeliverableStatus }) {
  return (
    <Badge tone={DELIVERABLE_TONES[props.status]}>{DELIVERABLE_LABELS[props.status]}</Badge>
  );
}

const CONTENT_TONES: Record<ContentStatus, BadgeTone> = {
  draft: 'neutral',
  review: 'warn',
  published: 'ok',
  archived: 'info',
};

export function ContentStatusBadge(props: { status: ContentStatus }) {
  const label = () => props.status.charAt(0).toUpperCase() + props.status.slice(1);
  return <Badge tone={CONTENT_TONES[props.status]}>{label()}</Badge>;
}

/** Website diagnostic score, 0-100. Lower is worse. */
export function HealthBadge(props: { score?: number }) {
  const tone = (): BadgeTone => {
    const score = props.score;
    if (score === undefined) return 'neutral';
    if (score >= 70) return 'ok';
    if (score >= 45) return 'warn';
    return 'crit';
  };

  return (
    <Badge tone={tone()}>
      {props.score === undefined ? 'No score' : `Health ${props.score}`}
    </Badge>
  );
}
