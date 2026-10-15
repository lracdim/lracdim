/**
 * Lead resource functions.
 *
 * Each function is the only place that knows whether data comes from the mock
 * store or the API. Hooks call these; components call hooks.
 *
 * TODO(api): drop the `if (MOCK)` branch once GET/PATCH /api/leads exist.
 */

import { MOCK, delay, request } from '~/api/client';
import * as store from '~/api/mock/store';
import type { Client, Lead, Project } from '~/lib/types';
import type { WorkflowStage } from '~/lib/workflow';

export interface ListLeadsParams {
  /** Omit or 'all' for every stage. */
  stage?: WorkflowStage | 'all';
}

export async function listLeads(params: ListLeadsParams = {}): Promise<Lead[]> {
  const stage = params.stage && params.stage !== 'all' ? params.stage : undefined;

  if (MOCK) {
    const rows = store
      .allLeads()
      .filter((lead) => (stage ? lead.stage === stage : true))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return delay(rows);
  }

  return request<Lead[]>('/api/leads', { query: { stage } });
}

export async function getLead(leadId: string): Promise<Lead> {
  if (MOCK) {
    const lead = store.findLead(leadId);
    if (!lead) {
      throw { code: 'not_found', message: `No lead with id ${leadId}.` };
    }
    return delay(lead);
  }

  return request<Lead>(`/api/leads/${leadId}`);
}

export interface AdvanceLeadInput {
  leadId: string;
  stage: WorkflowStage;
  note?: string;
}

export async function advanceLead(input: AdvanceLeadInput): Promise<Lead> {
  if (MOCK) {
    const lead = store.updateLeadStage(input.leadId, input.stage, input.note);
    if (!lead) {
      throw { code: 'not_found', message: `No lead with id ${input.leadId}.` };
    }
    return delay(lead);
  }

  return request<Lead>(`/api/leads/${input.leadId}/stage`, {
    method: 'PATCH',
    body: { stage: input.stage, note: input.note },
  });
}

export interface ConvertLeadInput {
  leadId: string;
  projectName: string;
}

export interface ConvertLeadResult {
  client: Client;
  project: Project;
}

/**
 * Creates a client and an opening project from a qualified lead.
 * The API must do this in one transaction so a half-converted lead cannot exist.
 */
export async function convertLead(input: ConvertLeadInput): Promise<ConvertLeadResult> {
  if (MOCK) {
    const result = store.convertLead(input.leadId, input.projectName);
    if (!result) {
      throw { code: 'not_found', message: `No lead with id ${input.leadId}.` };
    }
    return delay(result);
  }

  return request<ConvertLeadResult>(`/api/leads/${input.leadId}/convert`, {
    method: 'POST',
    body: { projectName: input.projectName },
  });
}
