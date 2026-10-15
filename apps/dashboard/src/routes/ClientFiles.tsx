import { For, createMemo, createSignal } from 'solid-js';
import { useProjects } from '~/api/hooks/useProjects';
import { DeliverableBadge } from '~/components/Badge';
import { DataTable, type Column } from '~/components/DataTable';
import { QueryView } from '~/components/QueryView';
import { formatDateTime, labelFor } from '~/lib/format';
import type { Deliverable } from '~/lib/types';

interface FileRow extends Deliverable {
  projectId: string;
  projectName: string;
}

export function ClientFiles() {
  const projects = useProjects();
  const [projectFilter, setProjectFilter] = createSignal<string>('all');

  const rows = createMemo<FileRow[]>(() =>
    (projects.data ?? [])
      .filter((project) => projectFilter() === 'all' || project.id === projectFilter())
      .flatMap((project) =>
        project.deliverables.map((deliverable) => ({
          ...deliverable,
          projectId: project.id,
          projectName: project.name,
        })),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  const columns: Column<FileRow>[] = [
    {
      key: 'name',
      header: 'File',
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <span class="table__cell-strong">
            {row.href ? (
              <a class="inline-link" href={row.href} rel="noreferrer noopener">
                {row.name}
              </a>
            ) : (
              row.name
            )}
          </span>
          <span class="table__cell-sub">{row.projectName}</span>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      sortValue: (row) => row.kind,
      render: (row) => <span class="text-small">{labelFor.titleCase(row.kind)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => row.status,
      render: (row) => <DeliverableBadge status={row.status} />,
    },
    {
      key: 'size',
      header: 'Size',
      render: (row) => <span class="num text-small">{row.sizeLabel ?? '--'}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortValue: (row) => row.updatedAt,
      render: (row) => <span class="num text-small">{formatDateTime(row.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Your account</span>
          <h1>Files</h1>
          <p>
            Every document, design and build handed over so far, newest first. Items
            still in draft are visible so you know what is coming.
          </p>
        </div>
      </div>

      <QueryView
        query={projects}
        loadingLabel="Loading your files"
        isEmpty={(list) => list.length === 0}
        emptyTitle="No files yet"
        emptyBody="Deliverables appear here as each one is produced."
      >
        {(list) => (
          <>
            <div class="filterbar">
              <label class="field field--inline">
                <span class="field__label">Project</span>
                <select
                  class="field__control"
                  value={projectFilter()}
                  onChange={(event) => setProjectFilter(event.currentTarget.value)}
                >
                  <option value="all">All projects</option>
                  <For each={list()}>
                    {(project) => <option value={project.id}>{project.name}</option>}
                  </For>
                </select>
              </label>
              <span class="filterbar__count" role="status">
                {rows().length} file{rows().length === 1 ? '' : 's'}
              </span>
            </div>

            <DataTable
              caption="Deliverables, newest first"
              columns={columns}
              rows={rows()}
              rowKey={(row) => row.id}
              initialSort={{ key: 'updatedAt', direction: 'desc' }}
              emptyTitle="No files for this project"
              emptyBody="Pick another project, or wait for the first deliverable."
            />
          </>
        )}
      </QueryView>
    </>
  );
}
