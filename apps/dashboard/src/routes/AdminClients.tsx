import { useClients } from '~/api/hooks/useClients';
import { useProjects } from '~/api/hooks/useProjects';
import { DataTable, type Column } from '~/components/DataTable';
import { QueryView } from '~/components/QueryView';
import { formatDate } from '~/lib/format';
import type { Client } from '~/lib/types';

export function AdminClients() {
  const clients = useClients();
  const projects = useProjects();

  const projectCount = (clientId: string) =>
    (projects.data ?? []).filter((project) => project.clientId === clientId).length;

  const columns: Column<Client>[] = [
    {
      key: 'company',
      header: 'Company',
      sortValue: (client) => client.company,
      render: (client) => (
        <div>
          <span class="table__cell-strong">{client.company}</span>
          <span class="table__cell-sub">{client.name}</span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      sortValue: (client) => client.email,
      render: (client) => (
        <a class="inline-link text-small" href={`mailto:${client.email}`}>
          {client.email}
        </a>
      ),
    },
    {
      key: 'website',
      header: 'Website',
      render: (client) => (
        <a
          class="inline-link text-small"
          href={client.website}
          rel="noreferrer noopener"
          target="_blank"
        >
          {client.website.replace(/^https?:\/\//, '')}
        </a>
      ),
    },
    {
      key: 'projects',
      header: 'Projects',
      sortValue: (client) => projectCount(client.id),
      render: (client) => <span class="num text-small">{projectCount(client.id)}</span>,
    },
    {
      key: 'since',
      header: 'Client since',
      sortValue: (client) => client.since,
      render: (client) => <span class="num text-small">{formatDate(client.since)}</span>,
    },
  ];

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Accounts</span>
          <h1>Clients</h1>
          <p>
            Every active account. Clients are created by converting a qualified lead on
            the leads board.
          </p>
        </div>
      </div>

      <QueryView
        query={clients}
        loadingLabel="Loading clients"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No clients yet"
        emptyBody="Converting a qualified lead creates the first client record."
      >
        {(rows) => (
          <DataTable
            caption="Clients, A to Z by company"
            columns={columns}
            rows={rows()}
            rowKey={(client) => client.id}
            initialSort={{ key: 'company', direction: 'asc' }}
            emptyTitle="No clients yet"
          />
        )}
      </QueryView>
    </>
  );
}
