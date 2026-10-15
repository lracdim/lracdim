/**
 * Message resource functions.
 *
 * TODO(api): replace the mock branch with GET/POST /api/messages.
 */

import { MOCK, delay, request } from '~/api/client';
import * as store from '~/api/mock/store';
import type { Message, Role } from '~/lib/types';

export interface ListMessagesParams {
  /**
   * The thread to read. Client routes pass the signed-in client's id.
   *
   * SECURITY: the API must scope the thread to the session's own client.
   * A client must never be able to read another client's thread by changing
   * this value.
   */
  clientId?: string;
  projectId?: string;
}

export async function listMessages(params: ListMessagesParams = {}): Promise<Message[]> {
  if (MOCK) {
    const rows = store
      .allMessages()
      .filter((message) => (params.clientId ? message.clientId === params.clientId : true))
      .filter((message) => (params.projectId ? message.projectId === params.projectId : true))
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    return delay(rows);
  }

  return request<Message[]>('/api/messages', {
    query: { clientId: params.clientId, projectId: params.projectId },
  });
}

export interface SendMessageInput {
  clientId: string;
  projectId?: string;
  authorName: string;
  authorRole: Role;
  body: string;
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  if (MOCK) {
    return delay(store.appendMessage(input));
  }

  // TODO(api): the author comes from the session server-side; do not trust
  // authorName or authorRole from the client.
  return request<Message>('/api/messages', {
    method: 'POST',
    body: { clientId: input.clientId, projectId: input.projectId, body: input.body },
  });
}
