/**
 * The studio pipeline. Every lead and project sits at exactly one stage.
 * Order matters: nextStage walks this array.
 */

export const WORKFLOW_STAGES = [
  'diagnostic_submitted',
  'lead_review',
  'discovery_call',
  'qualified',
  'declined',
  'proposal',
  'contract_deposit',
  'onboarding',
  'strategy',
  'design',
  'development',
  'qa_approval',
  'launch',
  'maintenance',
  'archived',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  diagnostic_submitted: 'Diagnostic submitted',
  lead_review: 'Lead review',
  discovery_call: 'Discovery call',
  qualified: 'Qualified',
  declined: 'Declined',
  proposal: 'Proposal',
  contract_deposit: 'Contract and deposit',
  onboarding: 'Onboarding',
  strategy: 'Strategy',
  design: 'Design',
  development: 'Development',
  qa_approval: 'QA and approval',
  launch: 'Launch',
  maintenance: 'Maintenance',
  archived: 'Archived',
};

/** Stages nothing advances out of. */
const TERMINAL_STAGES: readonly WorkflowStage[] = ['declined', 'archived'];

/** Stages that belong to the sales pipeline rather than delivery. */
export const LEAD_STAGES: readonly WorkflowStage[] = [
  'diagnostic_submitted',
  'lead_review',
  'discovery_call',
  'qualified',
  'declined',
  'proposal',
  'contract_deposit',
];

export function stageLabel(stage: WorkflowStage): string {
  return STAGE_LABELS[stage];
}

export function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGES.indexOf(stage);
}

export function isTerminal(stage: WorkflowStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/**
 * The stage that follows `stage`, or null at a terminal stage or the end of
 * the pipeline. 'declined' is skipped: it is only ever reached deliberately.
 */
export function nextStage(stage: WorkflowStage): WorkflowStage | null {
  if (isTerminal(stage)) return null;
  const index = stageIndex(stage);
  if (index < 0) return null;
  for (let i = index + 1; i < WORKFLOW_STAGES.length; i += 1) {
    const candidate = WORKFLOW_STAGES[i];
    if (candidate === 'declined') continue;
    return candidate;
  }
  return null;
}

/** Share of the pipeline completed, 0-1, used by progress meters. */
export function stageProgress(stage: WorkflowStage): number {
  if (stage === 'declined') return 0;
  const deliveryStart = stageIndex('onboarding');
  const deliveryEnd = stageIndex('launch');
  const index = stageIndex(stage);
  if (index < deliveryStart) return 0;
  if (index >= deliveryEnd) return 1;
  return (index - deliveryStart) / (deliveryEnd - deliveryStart);
}
