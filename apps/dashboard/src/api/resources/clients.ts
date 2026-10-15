/**
 * Client resource functions.
 *
 * TODO(api): replace the mock branch with GET /api/clients.
 */

import { MOCK, delay, request } from '~/api/client';
import * as store from '~/api/mock/store';
import type { Client } from '~/lib/types';

export interface ListClientsParams {
  /**
   * When set, only this client is returned. The dashboard passes the signed-in
   * client's id so a client account can never list the others.
   *
   * SECURITY: this is a convenience filter only. The API must scope every
   * response to the session's own client, server-side; a client token must not
   * be able to widen the result by omitting or changing this parameter.
   */
  clientId?: string;
}

export async function listClients(params: ListClientsParams = {}): Promise<Client[]> {
  if (MOCK) {
    const rows = store
      .allClients()
      .filter((client) => (params.clientId ? client.id === params.clientId : true))
      .sort((a, b) => a.company.localeCompare(b.company));
    return delay(rows);
  }

  return request<Client[]>('/api/clients', { query: { clientId: params.clientId } });
}

export async function getClient(clientId: string): Promise<Client> {
  if (MOCK) {
    const client = store.allClients().find((candidate) => candidate.id === clientId);
    if (!client) {
      throw { code: 'not_found', message: `No client with id ${clientId}.` };
    }
    return delay(client);
  }

  return request<Client>(`/api/clients/${clientId}`);
}
