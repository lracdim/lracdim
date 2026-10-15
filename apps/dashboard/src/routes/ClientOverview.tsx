import { For, Show } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { useMessages } from '~/api/hooks/useMessages';
import { useProjects } from '~/api/hooks/useProjects';
import { DeliverableBadge } from '~/components/Badge';
import { EmptyState } from '~/components/EmptyState';
import { ProjectStatusCard } from '~/components/ProjectStatusCard';
import { QueryView } from '~/components/QueryView';
import { StatCard } from '~/components/StatCard';
import { Timeline } from '~/components/Timeline';
import { formatDate, formatDateTime } from '~/lib/format';
import type { Milestone, Project } from '~/lib/types';
import { stageLabel } from '~/lib/workflow';

function sortMilestones(milestones: Milestone[]): Milestone[] {
  const rank: Record<Milestone['status'], number> = {
    complete: 0,
    in_progress: 1,
    blocked: 2,
    upcoming: 3,
  };
  return [...milestones].sort(
    (a, b) => rank[a.status] - rank[b.status] || a.dueAt.localeCompare(b.dueAt),
  );
}

export function ClientOverview() {
  const projects = useProjects();
  const messages = useMessages();

  const primary = (): Project | undefined => {
    const rows = projects.data ?? [];
    return (
      rows.find((project) => project.stage !== 'maintenance' && project.stage !== 'archived') ??
      rows[0]
    );
  };

  const unreadFromStudio = () =>
    (messages.data ?? []).filter(
      (message) => message.authorRole === 'admin' && !message.readAt,
    ).length;

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Your account</span>
          <h1>Where things stand</h1>
          <p>
            The current phase of your work with the studio, what has been completed and
            what is coming next.
          </p>
        </div>
        <div class="page-actions">
          <Link to="/client/messages" class="btn">
            Messages
          </Link>
          <Link to="/client/files" class="btn btn--primary">
            Your files
          </Link>
        </div>
      </div>

      <QueryView
        query={projects}
        loadingLabel="Loading your projects"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="Nothing scheduled yet"
        emptyBody="Once your project is opened it will appear here with its phases and dates."
      >
        {(rows) => (
          <>
            <section class="section" aria-labelledby="client-numbers">
              <h2 id="client-numbers" class="visually-hidden">
                Summary
              </h2>
              <div class="grid grid--stats">
                <StatCard
                  label="Current phase"
                  value={primary() ? stageLabel(primary()!.stage) : '--'}
                  hint={
                    primary()
                      ? `${primary()!.milestones.filter((m) => m.status === 'complete').length} of ${primary()!.milestones.length} milestones complete`
                      : undefined
                  }
                  accent
                />
                <StatCard
                  label="Next target"
                  value={primary() ? formatDate(primary()!.dueAt) : '--'}
                  hint={primary()?.name}
                />
                <StatCard
                  label="Deliverables"
                  value={rows().reduce((total, project) => total + project.deliverables.length, 0)}
                  hint="Across all your projects"
                />
                <StatCard
                  label="New messages"
                  value={unreadFromStudio()}
                  hint={unreadFromStudio() > 0 ? 'From the studio' : 'Nothing unread'}
                />
              </div>
            </section>

            <section class="section" aria-labelledby="client-projects">
              <div class="section__head">
                <h2 id="client-projects">Your projects</h2>
              </div>
              <div class="grid grid--halves">
                <For each={rows()}>
                  {(project) => (
                    <ProjectStatusCard
                      project={project}
                      action={
                        <Link
                          to="/client/projects/$projectId"
                          params={{ projectId: project.id }}
                          class="btn btn--small"
                        >
                          Open
                        </Link>
                      }
                    />
                  )}
                </For>
              </div>
            </section>

            <Show when={primary()}>
              {(project) => (
                <div class="grid grid--split">
                  <section class="section" aria-labelledby="client-timeline">
                    <div class="section__head">
                      <h2 id="client-timeline">Timeline</h2>
                      <span class="label">{project().name}</span>
                    </div>
                    <div class="panel">
                      <div class="panel__body">
                        <Timeline milestones={sortMilestones(project().milestones)} />
                      </div>
                    </div>
                  </section>

                  <section class="section" aria-labelledby="client-deliverables">
                    <div class="section__head">
                      <h2 id="client-deliverables">Latest deliverables</h2>
                      <Link to="/client/files" class="label label--signal">
                        All files
                      </Link>
                    </div>
                    <div class="panel">
                      <div class="panel__body">
                        <Show
                          when={project().deliverables.length > 0}
                          fallback={
                            <EmptyState
                              bare
                              title="No deliverables yet"
                              body="Documents and builds appear here as they are produced."
                            />
                          }
                        >
                          <ul class="stack">
                            <For each={project().deliverables.slice(0, 4)}>
                              {(deliverable) => (
                                <li class="row row--between">
                                  <div>
                                    <span class="text-small">{deliverable.name}</span>
                                    <span class="table__cell-sub">
                                      {formatDateTime(deliverable.updatedAt)}
                                    </span>
                                  </div>
                                  <DeliverableBadge status={deliverable.status} />
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </Show>
          </>
        )}
      </QueryView>
    </>
  );
}
