/**
 * Content resource functions, backing the admin content page.
 *
 * TODO(cms): this is where the CMS API connects. The marketing site is
 * Eleventy, so the likely shape is:
 *   GET    /api/content            -> list items
 *   PUT    /api/content/{id}       -> update, triggering an Eleventy rebuild
 *   POST   /api/content            -> create
 * Publishing a page should return the build id so the admin can see whether
 * the public site has picked the change up.
 */

import { MOCK, delay, request } from '~/api/client';
import * as store from '~/api/mock/store';
import type { ContentCollection, ContentItem, ContentStatus } from '~/lib/types';

export interface ListContentParams {
  collection?: ContentCollection | 'all';
  status?: ContentStatus | 'all';
}

export async function listContentItems(
  params: ListContentParams = {},
): Promise<ContentItem[]> {
  const collection =
    params.collection && params.collection !== 'all' ? params.collection : undefined;
  const status = params.status && params.status !== 'all' ? params.status : undefined;

  if (MOCK) {
    const rows = store
      .allContentItems()
      .filter((item) => (collection ? item.collection === collection : true))
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return delay(rows);
  }

  return request<ContentItem[]>('/api/content', { query: { collection, status } });
}

export interface SaveContentItemInput {
  /** Omitted when creating. */
  id?: string;
  collection: ContentCollection;
  title: string;
  slug: string;
  status: ContentStatus;
  body: string;
}

export async function saveContentItem(input: SaveContentItemInput): Promise<ContentItem> {
  if (MOCK) {
    return delay(store.upsertContentItem(input));
  }

  return input.id
    ? request<ContentItem>(`/api/content/${input.id}`, { method: 'PUT', body: input })
    : request<ContentItem>('/api/content', { method: 'POST', body: input });
}
