import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { getClient, listClients } from '~/api/resources/clients';
import { currentClientId } from '~/lib/auth';
import { STALE_TIME, queryKeys } from './queryKeys';

/**
 * Lists clients. A signed-in client sees only their own record: the query is
 * scoped from the session, not from anything a component passes in.
 *
 * SECURITY: this scoping is a UI guarantee only. The Litestar API must apply
 * the same rule server-side for every request.
 */
export function useClients() {
  return useQuery(() => {
    const scopedTo = currentClientId() ?? undefined;
    return {
      queryKey: queryKeys.clients.list(scopedTo),
      queryFn: () => listClients({ clientId: scopedTo }),
      staleTime: STALE_TIME.reference,
    };
  });
}

export function useClient(clientId: Accessor<string | undefined>) {
  return useQuery(() => ({
    queryKey: queryKeys.clients.detail(clientId() ?? ''),
    queryFn: () => getClient(clientId() as string),
    enabled: Boolean(clientId()),
    staleTime: STALE_TIME.reference,
  }));
}
