import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import {
  advanceLead,
  convertLead,
  getLead,
  listLeads,
  type AdvanceLeadInput,
  type ConvertLeadInput,
  type ListLeadsParams,
} from '~/api/resources/leads';
import { STALE_TIME, queryKeys } from './queryKeys';

export function useLeads(params: Accessor<ListLeadsParams> = () => ({})) {
  return useQuery(() => ({
    queryKey: queryKeys.leads.list(params()),
    queryFn: () => listLeads(params()),
    staleTime: STALE_TIME.pipeline,
  }));
}

export function useLead(leadId: Accessor<string | undefined>) {
  return useQuery(() => ({
    queryKey: queryKeys.leads.detail(leadId() ?? ''),
    queryFn: () => getLead(leadId() as string),
    enabled: Boolean(leadId()),
    staleTime: STALE_TIME.pipeline,
  }));
}

/** Advances a lead to a given stage, or declines it. */
export function useAdvanceLead() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: AdvanceLeadInput) => advanceLead(input),
    onSuccess: (lead) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
      queryClient.setQueryData(queryKeys.leads.detail(lead.id), lead);
    },
  }));
}

/** Creates a client and an opening project from a qualified lead. */
export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: ConvertLeadInput) => convertLead(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  }));
}
