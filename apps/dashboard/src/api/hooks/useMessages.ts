import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { listMessages, sendMessage, type SendMessageInput } from '~/api/resources/messages';
import { currentClientId, session } from '~/lib/auth';
import { STALE_TIME, queryKeys } from './queryKeys';

export interface UseMessagesOptions {
  /** Admin only: whose thread to read. Ignored for a client session. */
  clientId?: string;
  projectId?: string;
}

/**
 * Reads a message thread. For a client session the thread is pinned to their
 * own clientId regardless of what is passed in.
 *
 * SECURITY: the API must scope threads to the session's client server-side.
 */
export function useMessages(options: Accessor<UseMessagesOptions> = () => ({})) {
  return useQuery(() => {
    const scoped = currentClientId();
    const params = {
      clientId: scoped ?? options().clientId,
      projectId: options().projectId,
    };
    return {
      queryKey: queryKeys.messages.list(params),
      queryFn: () => listMessages(params),
      enabled: Boolean(params.clientId),
      staleTime: STALE_TIME.conversation,
    };
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: Omit<SendMessageInput, 'authorName' | 'authorRole'>) => {
      const current = session();
      if (!current) {
        return Promise.reject({
          code: 'unauthenticated',
          message: 'Sign in again to send a message.',
        });
      }
      // TODO(api): the server derives the author from the session; these two
      // fields exist only to make the mock thread readable.
      return sendMessage({
        ...input,
        clientId: currentClientId() ?? input.clientId,
        authorName: current.name,
        authorRole: current.role,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() });
    },
  }));
}
