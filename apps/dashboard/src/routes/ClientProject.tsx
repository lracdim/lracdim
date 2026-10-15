import { For, Show } from 'solid-js';
import { Link, useParams } from '@tanstack/solid-router';
import { useMessages } from '~/api/hooks/useMessages';
import { useProject } from '~/api/hooks/useProjects';
import { DeliverableBadge, StageBadge } from '~/components/Badge';
import { EmptyState } from '~/components/EmptyState';
import { QueryView } from '~/components/QueryView';
import { SkeletonBlock } from '~/components/Skeleton';
import { Timeline } from '~/components/Timeline';
import { formatDate, formatDateTime, labelFor } from '~/lib/format';
import { stageLabel, stageProgress } from '~/lib/workflow';

export function ClientProject() {
  const params = useParams({ strict: false });
  const projectId = () => (params() as { projectId?: string }).projectId;

  const project = useProject(projectId);
  const messages = useMessages(() => ({ projectId: projectId() }));

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Project</span>
          {/* The heading only names the project; errors are reported once, below. */}
          <h1>
            <Show
              when={project.data}
              fallback={
                project.isPending ? (
                  <SkeletonBlock lines={1} height="26px" label="Loading project" />
                ) : (
                  'Project unavailable'
                )
              }
            >
              {(current) => current().name}
            </Show>
          </h1>
        </div>
        <div class="page-actions">
          <Link to="/client" class="btn btn--quiet">
            Back to overview
          </Link>
        </div>
      </div>

      <QueryView query={project} loadingLabel="Loading project detail">
        {(current) => {
          const percent = () => Math.round(stageProgress(current().stage) * 100);
          return (
            <>
              <section class="section" aria-labelledby="project-phase">
                <div class="panel">
                  <div class="panel__head">
                    <h2 id="project-phase">Current phase</h2>
                    <StageBadge stage={current().stage} />
                  </div>
                  <div class="panel__body stack">
                    <p class="text-muted">{current().summary}</p>

                    <div>
                      <div class="row row--between">
                        <span class="label label--signal">{stageLabel(current().stage)}</span>
                        <span class="label num">{percent()}%</span>
                      </div>
                      <div
                        class="meter"
                        role="progressbar"
                        aria-valuenow={percent()}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-label="Delivery progress"
                      >
                        <span class="meter__fill" style={{ width: `${percent()}%` }} />
                      </div>
                    </div>

                    <dl class="dl-grid">
                      <div>
                        <dt>Type</dt>
                        <dd>{labelFor.projectType(current().projectType)}</dd>
                      </div>
                      <div>
                        <dt>Started</dt>
                        <dd class="num">{formatDate(current().startedAt)}</dd>
                      </div>
                      <div>
                        <dt>Target</dt>
                        <dd class="num">{formatDate(current().dueAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </section>

              <div class="grid grid--split">
                <section class="section" aria-labelledby="project-milestones">
                  <div class="section__head">
                    <h2 id="project-milestones">Milestones</h2>
                  </div>
                  <div class="panel">
                    <div class="panel__body">
                      <Timeline milestones={current().milestones} />
                    </div>
                  </div>
                </section>

                <section class="section" aria-labelledby="project-deliverables">
                  <div class="section__head">
                    <h2 id="project-deliverables">Deliverables</h2>
                  </div>
                  <div class="panel">
                    <div class="panel__body">
                      <Show
                        when={current().deliverables.length > 0}
                        fallback={
                          <EmptyState
                            bare
                            title="No deliverables yet"
                            body="They appear here as each one is produced."
                          />
                        }
                      >
                        <ul class="stack">
                          <For each={current().deliverables}>
                            {(deliverable) => (
                              <li class="row row--between">
                                <div>
                                  <span class="text-small">{deliverable.name}</span>
                                  <span class="table__cell-sub">
                                    {labelFor.titleCase(deliverable.kind)} &middot;{' '}
                                    {formatDateTime(deliverable.updatedAt)}
                                    <Show when={deliverable.sizeLabel}>
                                      {' '}
                                      &middot; {deliverable.sizeLabel}
                                    </Show>
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

              <section class="section" aria-labelledby="project-messages">
                <div class="section__head">
                  <h2 id="project-messages">Recent messages on this project</h2>
                  <Link to="/client/messages" class="label label--signal">
                    Open thread
                  </Link>
                </div>
                <QueryView
                  query={messages}
                  loadingLabel="Loading project messages"
                  isEmpty={(rows) => rows.length === 0}
                  emptyTitle="No messages on this project"
                  emptyBody="Start a conversation from the messages page."
                >
                  {(rows) => (
                    <ul class="thread">
                      <For each={rows().slice(-3)}>
                        {(message) => (
                          <li class="thread__item" data-own={message.authorRole === 'client'}>
                            <div class="thread__meta">
                              <span class="thread__author">{message.authorName}</span>
                              <span class="label num">{formatDateTime(message.sentAt)}</span>
                            </div>
                            <p class="thread__body">{message.body}</p>
                          </li>
                        )}
                      </For>
                    </ul>
                  )}
                </QueryView>
              </section>
            </>
          );
        }}
      </QueryView>
    </>
  );
}
