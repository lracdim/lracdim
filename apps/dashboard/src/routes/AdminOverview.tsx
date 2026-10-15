import { For, Show } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { useClients } from '~/api/hooks/useClients';
import { useLeads } from '~/api/hooks/useLeads';
import { useProjects } from '~/api/hooks/useProjects';
import { StageBadge } from '~/components/Badge';
import { EmptyState } from '~/components/EmptyState';
import { ProjectStatusCard } from '~/components/ProjectStatusCard';
import { QueryView } from '~/components/QueryView';
import { SkeletonCards } from '~/components/Skeleton';
import { StatCard } from '~/components/StatCard';
import { formatDate, relativeDays } from '~/lib/format';
import { LEAD_STAGES } from '~/lib/workflow';

export function AdminOverview() {
  const leads = useLeads();
  const projects = useProjects();
  const clients = useClients();

  const openLeads = () =>
    (leads.data ?? []).filter(
      (lead) => LEAD_STAGES.includes(lead.stage) && lead.stage !== 'declined',
    );

  const activeProjects = () =>
    (projects.data ?? []).filter(
      (project) => project.stage !== 'archived' && project.stage !== 'declined',
    );

  const blockedMilestones = () =>
    (projects.data ?? []).flatMap((project) =>
      project.milestones
        .filter((milestone) => milestone.status === 'blocked')
        .map((milestone) => ({ project, milestone })),
    );

  const nextDue = () =>
    [...activeProjects()].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Studio</span>
          <h1>Pipeline at a glance</h1>
          <p>
            Where every lead and engagement stands today. Open the leads board to work
            the pipeline, or a project to review its milestones.
          </p>
        </div>
        <div class="page-actions">
          <Link to="/admin/leads" class="btn btn--primary">
            Work the leads
          </Link>
        </div>
      </div>

      <section class="section" aria-labelledby="overview-numbers">
        <div class="section__head">
          <h2 id="overview-numbers">Numbers</h2>
        </div>
        <QueryView
          query={leads}
          loading={<SkeletonCards count={4} label="Loading pipeline numbers" />}
          loadingLabel="Loading pipeline numbers"
        >
          {() => (
            <div class="grid grid--stats">
              <StatCard
                label="Open leads"
                value={openLeads().length}
                hint="Not yet declined or converted"
                accent
              />
              <StatCard
                label="Active projects"
                value={activeProjects().length}
                hint={
                  nextDue()
                    ? `Next target ${formatDate(nextDue()?.dueAt)}`
                    : 'Nothing scheduled'
                }
              />
              <StatCard label="Clients" value={(clients.data ?? []).length} />
              <StatCard
                label="Blocked milestones"
                value={blockedMilestones().length}
                hint={
                  blockedMilestones().length > 0
                    ? 'Waiting on somebody else'
                    : 'Nothing blocked'
                }
              />
            </div>
          )}
        </QueryView>
      </section>

      <section class="section" aria-labelledby="overview-attention">
        <div class="section__head">
          <h2 id="overview-attention">Needs attention</h2>
          <Link to="/admin/leads" class="label label--signal">
            All leads
          </Link>
        </div>
        <QueryView
          query={leads}
          loadingLabel="Loading leads that need attention"
          isEmpty={(rows) =>
            rows.filter((lead) => lead.stage === 'diagnostic_submitted' || lead.stage === 'lead_review')
              .length === 0
          }
          emptyTitle="No new submissions"
          emptyBody="Nothing has come in from the public site's diagnostic that has not been reviewed."
        >
          {(rows) => {
            const newLeads = () =>
              rows().filter(
                (lead) =>
                  lead.stage === 'diagnostic_submitted' || lead.stage === 'lead_review',
              );
            return (
              <ul class="stack">
                <For each={newLeads()}>
                  {(lead) => (
                    <li class="panel">
                      <div class="panel__body">
                        <div class="row row--between">
                          <div>
                            <span class="label">
                              {lead.company} &middot; {formatDate(lead.submittedAt)}
                            </span>
                            <p class="table__cell-strong">{lead.name}</p>
                          </div>
                          <StageBadge stage={lead.stage} />
                        </div>
                        <p class="text-small text-muted" style={{ 'margin-top': '12px' }}>
                          {lead.problem}
                        </p>
                        <div class="row" style={{ 'margin-top': '16px' }}>
                          <Link
                            to="/admin/leads"
                            search={{ lead: lead.id }}
                            class="btn btn--small"
                          >
                            Open lead
                          </Link>
                          <span class="label">{relativeDays(lead.submittedAt)}</span>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            );
          }}
        </QueryView>
      </section>

      <section class="section" aria-labelledby="overview-projects">
        <div class="section__head">
          <h2 id="overview-projects">Active engagements</h2>
          <Link to="/admin/projects" class="label label--signal">
            All projects
          </Link>
        </div>
        <QueryView
          query={projects}
          loadingLabel="Loading active projects"
          isEmpty={() => activeProjects().length === 0}
          emptyTitle="No active projects"
          emptyBody="Convert a qualified lead to open the first project."
        >
          {() => (
            <div class="grid grid--halves">
              <For each={activeProjects()}>
                {(project) => <ProjectStatusCard project={project} />}
              </For>
            </div>
          )}
        </QueryView>
      </section>

      <Show when={blockedMilestones().length > 0}>
        <section class="section" aria-labelledby="overview-blocked">
          <div class="section__head">
            <h2 id="overview-blocked">Blocked</h2>
          </div>
          <ul class="stack">
            <For each={blockedMilestones()}>
              {({ project, milestone }) => (
                <li class="panel">
                  <div class="panel__body">
                    <span class="label">{project.name}</span>
                    <p class="table__cell-strong">{milestone.name}</p>
                    <Show when={milestone.note}>
                      <p class="text-small text-muted" style={{ 'margin-top': '8px' }}>
                        {milestone.note}
                      </p>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={!leads.isPending && (leads.data ?? []).length === 0}>
        <EmptyState
          title="The pipeline is empty"
          body="Submissions from the public site's diagnostic will appear here."
        />
      </Show>
    </>
  );
}
