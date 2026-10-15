/**
 * Domain types for the LRACDIMENSION studio dashboard.
 *
 * These mirror the shapes the Litestar API at /api is expected to return.
 * When the API lands, keep these as the single source of truth for the UI and
 * adapt in src/api/resources/* if the wire format differs.
 */

import type { WorkflowStage } from './workflow';

export type Role = 'admin' | 'client';

export interface Session {
  userId: string;
  name: string;
  role: Role;
  /** Present only for role === 'client'. Scopes every client-side query. */
  clientId?: string;
}

export type ProjectType =
  | 'wordpress'
  | 'automation'
  | 'web_app'
  | 'maintenance'
  | 'audit';

export type BudgetRange =
  | 'under_5k'
  | '5k_15k'
  | '15k_40k'
  | '40k_plus'
  | 'undecided';

export type LeadTimeline = 'asap' | 'one_to_three_months' | 'this_quarter' | 'exploring';

export interface Lead {
  id: string;
  /** ISO 8601. */
  submittedAt: string;
  name: string;
  email: string;
  company: string;
  website: string;
  projectType: ProjectType;
  budgetRange: BudgetRange;
  timeline: LeadTimeline;
  problem: string;
  stage: WorkflowStage;
  /** 0-100, produced by the public site's website diagnostic. Optional. */
  healthScore?: number;
  notes: string;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  website: string;
  since: string;
  /** Lead this client was converted from, when known. */
  sourceLeadId?: string;
}

export type MilestoneStatus = 'complete' | 'in_progress' | 'upcoming' | 'blocked';

export interface Milestone {
  id: string;
  name: string;
  stage: WorkflowStage;
  status: MilestoneStatus;
  /** ISO date the milestone is due or was completed. */
  dueAt: string;
  completedAt?: string;
  note?: string;
}

export type DeliverableStatus = 'draft' | 'in_review' | 'approved' | 'delivered';

export interface Deliverable {
  id: string;
  name: string;
  kind: 'document' | 'design' | 'build' | 'report' | 'credential';
  status: DeliverableStatus;
  updatedAt: string;
  /** Where the artefact lives. Mock data uses placeholder paths. */
  href?: string;
  sizeLabel?: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  stage: WorkflowStage;
  startedAt: string;
  dueAt: string;
  summary: string;
  projectType: ProjectType;
  milestones: Milestone[];
  deliverables: Deliverable[];
}

export interface Message {
  id: string;
  clientId: string;
  projectId?: string;
  authorName: string;
  authorRole: Role;
  body: string;
  sentAt: string;
  readAt?: string;
}

export type ContentCollection = 'page' | 'project' | 'service' | 'blog';
export type ContentStatus = 'draft' | 'review' | 'published' | 'archived';

export interface ContentItem {
  id: string;
  collection: ContentCollection;
  title: string;
  slug: string;
  status: ContentStatus;
  /** Markdown body. */
  body: string;
  updatedAt: string;
  author: string;
}

/** Normalised error shape produced by src/api/client.ts. */
export interface ApiError {
  code: string;
  message: string;
}
