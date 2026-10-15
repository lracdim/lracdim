import { For, Show, createSignal } from 'solid-js';
import { useClients } from '~/api/hooks/useClients';
import { useProjects } from '~/api/hooks/useProjects';
import { DeliverableBadge, StageBadge } from '~/components/Badge';
import { ProjectStatusCard } from '~/components/ProjectStatusCard';
import { QueryView } from '~/components/QueryView';
import { Timeline } from '~/components/Timeline';
import { formatDate } from '~/lib/format';

export function AdminProjects() {
  const projects = useProjects();
  const clients = useClients();
  const [openId, setOpenId] = createSignal<string | null>(null);

  const companyFor = (clientId: string) =>
    (clients.data ?? []).find((client) => client.id === clientId)?.company ?? clientId;

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Delivery</span>
          <h1>Projects</h1>
          <p>
            Every engagement with its current phase. Expand a project to review its
            milestone history and deliverables.
          </p>
        </div>
      </div>

      <QueryView
        query={projects}
        loadingLabel="Loading projects"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No projects yet"
        emptyBody="Convert a qualified lead on the leads board to open the first project."
      >
        {(rows) => (
          <div class="stack">
            <For each={rows()}>
              {(project) => {
                const expanded = () => openId() === project.id;
                return (
                  <div class="stack stack--tight">
                    <ProjectStatusCard
                      project={project}
                      action={
                        <button
                          type="button"
                          class="btn btn--small"
                          aria-expanded={expanded()}
                          aria-controls={`project-detail-${project.id}`}
                          onClick={() => setOpenId(expanded() ? null : project.id)}
                        >
                          {expanded() ? 'Hide detail' : 'Show detail'}
                        </button>
                      }
                    />
                    <Show when={expanded()}>
                      <div class="panel" id={`project-detail-${project.id}`}>
                        <div class="panel__head">
                          <h3>{project.name}</h3>
                          <StageBadge stage={project.stage} />
                        </div>
                        <div class="panel__body">
                          <dl class="dl-grid" style={{ 'margin-bottom': '32px' }}>
                            <div>
                              <dt>Client</dt>
                              <dd>{companyFor(project.clientId)}</dd>
                            </div>
                            <div>
                              <dt>Started</dt>
                              <dd class="num">{formatDate(project.startedAt)}</dd>
                            </div>
                            <div>
                              <dt>Target</dt>
                              <dd class="num">{formatDate(project.dueAt)}</dd>
                            </div>
                          </dl>

                          <div class="grid grid--halves">
                            <section aria-labelledby={`milestones-${project.id}`}>
                              <h4 id={`milestones-${project.id}`} class="label">
                                Milestones
                              </h4>
                              <div style={{ 'margin-top': '16px' }}>
                                <Timeline milestones={project.milestones} />
                              </div>
                            </section>

                            <section aria-labelledby={`deliverables-${project.id}`}>
                              <h4 id={`deliverables-${project.id}`} class="label">
                                Deliverables
                              </h4>
                              <ul class="stack stack--tight" style={{ 'margin-top': '16px' }}>
                                <For each={project.deliverables}>
                                  {(deliverable) => (
                                    <li class="row row--between">
                                      <div>
                                        <span class="text-small">{deliverable.name}</span>
                                        <span class="table__cell-sub">
                                          Updated {formatDate(deliverable.updatedAt)}
                                        </span>
                                      </div>
                                      <DeliverableBadge status={deliverable.status} />
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </section>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </QueryView>
    </>
  );
}
