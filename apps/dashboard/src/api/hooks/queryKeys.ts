/**
 * Every query key in one place, so invalidation stays honest.
 *
 * Keys are hierarchical: invalidating ['leads'] invalidates every lead list
 * and detail query underneath it.
 */

import type { ListContentParams } from '~/api/resources/content';
import type { ListLeadsParams } from '~/api/resources/leads';
import type { ListMessagesParams } from '~/api/resources/messages';

export const queryKeys = {
  leads: {
    all: () => ['leads'] as const,
    list: (params: ListLeadsParams) => ['leads', 'list', params.stage ?? 'all'] as const,
    detail: (leadId: string) => ['leads', 'detail', leadId] as const,
  },
  clients: {
    all: () => ['clients'] as const,
    list: (clientId?: string) => ['clients', 'list', clientId ?? 'all'] as const,
    detail: (clientId: string) => ['clients', 'detail', clientId] as const,
  },
  projects: {
    all: () => ['projects'] as const,
    list: (clientId?: string) => ['projects', 'list', clientId ?? 'all'] as const,
    detail: (projectId: string, clientId?: string) =>
      ['projects', 'detail', projectId, clientId ?? 'all'] as const,
  },
  messages: {
    all: () => ['messages'] as const,
    list: (params: ListMessagesParams) =>
      ['messages', 'list', params.clientId ?? 'all', params.projectId ?? 'all'] as const,
  },
  content: {
    all: () => ['content'] as const,
    list: (params: ListContentParams) =>
      ['content', 'list', params.collection ?? 'all', params.status ?? 'all'] as const,
  },
} as const;

/**
 * Reference data changes rarely while a single admin uses the dashboard, so a
 * generous staleTime keeps navigation instant without stale-looking records.
 */
export const STALE_TIME = {
  /** Pipeline data the admin is actively working through. */
  pipeline: 30_000,
  /** Clients and projects: edited rarely. */
  reference: 60_000,
  /** A thread should feel current. */
  conversation: 15_000,
} as const;
