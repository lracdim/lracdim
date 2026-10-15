import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import {
  listContentItems,
  saveContentItem,
  type ListContentParams,
  type SaveContentItemInput,
} from '~/api/resources/content';
import { STALE_TIME, queryKeys } from './queryKeys';

export function useContentItems(params: Accessor<ListContentParams> = () => ({})) {
  return useQuery(() => ({
    queryKey: queryKeys.content.list(params()),
    queryFn: () => listContentItems(params()),
    staleTime: STALE_TIME.reference,
  }));
}

export function useSaveContentItem() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: SaveContentItemInput) => saveContentItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.content.all() });
    },
  }));
}
