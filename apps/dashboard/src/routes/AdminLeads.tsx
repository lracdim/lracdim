import { For, Show, createMemo, createSignal } from 'solid-js';
import { useNavigate, useSearch } from '@tanstack/solid-router';
import { useAdvanceLead, useConvertLead, useLead, useLeads } from '~/api/hooks/useLeads';
import { HealthBadge, StageBadge } from '~/components/Badge';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { DataTable, type Column } from '~/components/DataTable';
import { EmptyState } from '~/components/EmptyState';
import { QueryView } from '~/components/QueryView';
import { SkeletonBlock } from '~/components/Skeleton';
import { TextField } from '~/components/fields';
import { formatDate, formatDateTime, labelFor, relativeDays } from '~/lib/format';
import type { Lead } from '~/lib/types';
import {
  WORKFLOW_STAGES,
  isTerminal,
  nextStage,
  stageLabel,
  type WorkflowStage,
} from '~/lib/workflow';

type StageFilter = WorkflowStage | 'all';

const STAGE_FILTER_OPTIONS: Array<{ value: StageFilter; label: string }> = [
  { value: 'all', label: 'All stages' },
  ...WORKFLOW_STAGES.map((stage) => ({ value: stage as StageFilter, label: stageLabel(stage) })),
];

export function AdminLeads() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [stageFilter, setStageFilter] = createSignal<StageFilter>('all');

  const leads = useLeads(() => ({ stage: stageFilter() }));

  const selectedId = () => (search() as { lead?: string }).lead;

  function selectLead(leadId: string | undefined) {
    void navigate({ to: '/admin/leads', search: { lead: leadId } });
  }

  const columns: Column<Lead>[] = [
    {
      key: 'company',
      header: 'Company',
      sortValue: (lead) => lead.company,
      render: (lead) => (
        <div>
          <span class="table__cell-strong">{lead.company}</span>
          <span class="table__cell-sub">{lead.name}</span>
        </div>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortValue: (lead) => lead.submittedAt,
      render: (lead) => (
        <div>
          <span class="num text-small">{formatDate(lead.submittedAt)}</span>
          <span class="table__cell-sub">{relativeDays(lead.submittedAt)}</span>
        </div>
      ),
    },
    {
      key: 'projectType',
      header: 'Type',
      sortValue: (lead) => lead.projectType,
      render: (lead) => <span class="text-small">{labelFor.projectType(lead.projectType)}</span>,
    },
    {
      key: 'budgetRange',
      header: 'Budget',
      sortValue: (lead) => lead.budgetRange,
      render: (lead) => <span class="num text-small">{labelFor.budget(lead.budgetRange)}</span>,
    },
    {
      key: 'healthScore',
      header: 'Diagnostic',
      sortValue: (lead) => lead.healthScore ?? -1,
      render: (lead) => <HealthBadge score={lead.healthScore} />,
    },
    {
      key: 'stage',
      header: 'Stage',
      sortValue: (lead) => lead.stage,
      render: (lead) => <StageBadge stage={lead.stage} />,
    },
  ];

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Pipeline</span>
          <h1>Leads</h1>
          <p>
            Submissions from the public site's diagnostic and contact form. Select a row
            to read the submission and move it along the pipeline.
          </p>
        </div>
      </div>

      <div class="grid grid--split">
        <section aria-labelledby="leads-table-heading">
          <h2 id="leads-table-heading" class="visually-hidden">
            Lead list
          </h2>

          <div class="filterbar">
            <label class="field field--inline">
              <span class="field__label">Filter by stage</span>
              <select
                class="field__control"
                value={stageFilter()}
                onChange={(event) => setStageFilter(event.currentTarget.value as StageFilter)}
              >
                <For each={STAGE_FILTER_OPTIONS}>
                  {(option) => <option value={option.value}>{option.label}</option>}
                </For>
              </select>
            </label>
            <span class="filterbar__count" role="status">
              <Show when={!leads.isPending} fallback="Loading">
                {(leads.data ?? []).length} shown
              </Show>
            </span>
          </div>

          <QueryView
            query={leads}
            loadingLabel="Loading leads"
            isEmpty={(rows) => rows.length === 0}
            emptyTitle="No leads at this stage"
            emptyBody="Change the stage filter, or wait for the next submission from the public site."
          >
            {(rows) => (
              <DataTable
                caption="Leads, newest first"
                columns={columns}
                rows={rows()}
                rowKey={(lead) => lead.id}
                selectedKey={selectedId()}
                onRowClick={(lead) => selectLead(lead.id)}
                initialSort={{ key: 'submittedAt', direction: 'desc' }}
              />
            )}
          </QueryView>
        </section>

        <aside aria-labelledby="lead-detail-heading">
          <h2 id="lead-detail-heading" class="visually-hidden">
            Lead detail
          </h2>
          <Show
            when={selectedId()}
            fallback={
              <EmptyState
                title="No lead selected"
                body="Select a row to see the full submission and the actions available at its stage."
              />
            }
          >
            <LeadDetail leadId={selectedId() as string} onClose={() => selectLead(undefined)} />
          </Show>
        </aside>
      </div>
    </>
  );
}

/* ====================================================================== */

type PendingAction =
  | { kind: 'advance'; stage: WorkflowStage }
  | { kind: 'decline' }
  | { kind: 'convert' };

function LeadDetail(props: { leadId: string; onClose: () => void }) {
  const lead = useLead(() => props.leadId);
  const advance = useAdvanceLead();
  const convert = useConvertLead();

  const [pending, setPending] = createSignal<PendingAction | null>(null);
  const [projectName, setProjectName] = createSignal('');
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [converted, setConverted] = createSignal<{ clientId: string; projectName: string } | null>(
    null,
  );

  const next = createMemo(() => {
    const current = lead.data;
    return current ? nextStage(current.stage) : null;
  });

  function describe(action: PendingAction): { title: string; body: string; confirm: string } {
    const current = lead.data;
    const company = current?.company ?? 'this lead';
    switch (action.kind) {
      case 'advance':
        return {
          title: `Advance to ${stageLabel(action.stage)}?`,
          body: `${company} moves from ${stageLabel(current?.stage ?? 'lead_review')} to ${stageLabel(action.stage)}. This is recorded against the lead.`,
          confirm: 'Advance',
        };
      case 'decline':
        return {
          title: 'Decline this lead?',
          body: `${company} is marked declined and drops out of the active pipeline. The record is kept.`,
          confirm: 'Decline',
        };
      case 'convert':
        return {
          title: 'Create client and project?',
          body: `A client record and an opening project are created for ${company}, and the lead moves to Onboarding.`,
          confirm: 'Create',
        };
    }
  }

  async function runPending() {
    const action = pending();
    const current = lead.data;
    if (!action || !current) return;
    setActionError(null);

    try {
      if (action.kind === 'advance') {
        await advance.mutateAsync({ leadId: current.id, stage: action.stage });
      } else if (action.kind === 'decline') {
        await advance.mutateAsync({
          leadId: current.id,
          stage: 'declined',
          note: 'Declined from the dashboard.',
        });
      } else {
        const name = projectName().trim() || `${current.company} engagement`;
        const result = await convert.mutateAsync({ leadId: current.id, projectName: name });
        setConverted({ clientId: result.client.id, projectName: result.project.name });
      }
      setPending(null);
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'The action could not be completed.';
      setActionError(message);
      setPending(null);
    }
  }

  return (
    <QueryView
      query={lead}
      loading={
        <div class="panel">
          <div class="panel__body">
            <SkeletonBlock lines={6} label="Loading lead" />
          </div>
        </div>
      }
    >
      {(current) => (
        <div class="panel">
          <div class="panel__head">
            <div>
              <span class="label">{formatDate(current().submittedAt)}</span>
              <h3>{current().company}</h3>
            </div>
            <button type="button" class="btn btn--small btn--quiet" onClick={props.onClose}>
              Close
            </button>
          </div>

          <div class="panel__body stack">
            <div class="row">
              <StageBadge stage={current().stage} />
              <HealthBadge score={current().healthScore} />
            </div>

            <dl class="dl-grid">
              <div>
                <dt>Contact</dt>
                <dd>
                  {current().name}
                  <br />
                  <a class="inline-link" href={`mailto:${current().email}`}>
                    {current().email}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  <a
                    class="inline-link"
                    href={current().website}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {current().website.replace(/^https?:\/\//, '')}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Project type</dt>
                <dd>{labelFor.projectType(current().projectType)}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd class="num">{labelFor.budget(current().budgetRange)}</dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>{labelFor.timeline(current().timeline)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd class="num">{formatDateTime(current().submittedAt)}</dd>
              </div>
            </dl>

            <div>
              <span class="label">The problem, in their words</span>
              <p class="text-muted" style={{ 'margin-top': '8px' }}>
                {current().problem}
              </p>
            </div>

            <Show when={current().notes}>
              <div>
                <span class="label">Studio notes</span>
                <p class="text-small text-muted" style={{ 'margin-top': '8px', 'white-space': 'pre-wrap' }}>
                  {current().notes}
                </p>
              </div>
            </Show>

            <Show when={actionError()}>
              <div class="error-state" role="alert">
                <span class="error-state__code">action_failed</span>
                <p class="error-state__message">{actionError()}</p>
              </div>
            </Show>

            <Show when={converted()}>
              {(result) => (
                <div class="notice">
                  <span class="notice__title">Client and project created</span>
                  <p class="notice__body">
                    {result().projectName} is now open against client{' '}
                    <span class="num">{result().clientId}</span>.
                  </p>
                </div>
              )}
            </Show>

            <Show
              when={!isTerminal(current().stage)}
              fallback={
                <p class="text-small text-faint">
                  {stageLabel(current().stage)} is a terminal stage. Nothing further to do.
                </p>
              }
            >
              <Show when={current().stage === 'qualified'}>
                <div class="panel" style={{ background: 'var(--surface-raised)' }}>
                  <div class="panel__body">
                    <span class="label label--signal">Qualified</span>
                    <p class="text-small text-muted" style={{ 'margin-top': '8px' }}>
                      Open a client record and a first project from this lead.
                    </p>
                    <div style={{ 'margin-top': '16px' }}>
                      <TextField
                        label="Project name"
                        placeholder={`${current().company} engagement`}
                        hint="Leave blank to use the company name."
                        value={projectName()}
                        onInput={(event) => setProjectName(event.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="btn btn--primary"
                        onClick={() => setPending({ kind: 'convert' })}
                        disabled={Boolean(converted())}
                      >
                        Create client and project
                      </button>
                    </div>
                  </div>
                </div>
              </Show>

              <div class="row">
                <Show when={next()}>
                  {(stage) => (
                    <button
                      type="button"
                      class="btn btn--primary"
                      onClick={() => setPending({ kind: 'advance', stage: stage() })}
                    >
                      Advance to {stageLabel(stage())}
                    </button>
                  )}
                </Show>
                <button
                  type="button"
                  class="btn btn--danger"
                  onClick={() => setPending({ kind: 'decline' })}
                >
                  Decline
                </button>
              </div>
            </Show>
          </div>

          <ConfirmDialog
            open={pending() !== null}
            title={pending() ? describe(pending() as PendingAction).title : ''}
            body={<p>{pending() ? describe(pending() as PendingAction).body : ''}</p>}
            confirmLabel={pending() ? describe(pending() as PendingAction).confirm : 'Confirm'}
            destructive={pending()?.kind === 'decline'}
            busy={advance.isPending || convert.isPending}
            onConfirm={() => void runPending()}
            onCancel={() => setPending(null)}
          />
        </div>
      )}
    </QueryView>
  );
}
