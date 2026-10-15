/**
 * In-memory mock store.
 *
 * Holds a mutable copy of the seed so mutations (advancing a lead, sending a
 * message, saving a content item) persist for the lifetime of the page. It
 * resets on reload, which is the right behaviour for a demo.
 *
 * Only src/api/resources/* may import this module.
 */

import type {
  Client,
  ContentItem,
  Deliverable,
  Lead,
  Message,
  Milestone,
  Project,
} from '~/lib/types';
import type { WorkflowStage } from '~/lib/workflow';
import { clients, contentItems, leads, messages, projects } from './seed';

function clone<T>(value: T): T {
  return structuredClone(value);
}

interface MockState {
  leads: Lead[];
  clients: Client[];
  projects: Project[];
  messages: Message[];
  contentItems: ContentItem[];
}

const state: MockState = {
  leads: clone(leads),
  clients: clone(clients),
  projects: clone(projects),
  messages: clone(messages),
  contentItems: clone(contentItems),
};

let sequence = 1000;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence}`;
}

/* -- reads ------------------------------------------------------------- */

export function allLeads(): Lead[] {
  return clone(state.leads);
}

export function findLead(leadId: string): Lead | undefined {
  const match = state.leads.find((lead) => lead.id === leadId);
  return match ? clone(match) : undefined;
}

export function allClients(): Client[] {
  return clone(state.clients);
}

export function allProjects(): Project[] {
  return clone(state.projects);
}

export function findProject(projectId: string): Project | undefined {
  const match = state.projects.find((project) => project.id === projectId);
  return match ? clone(match) : undefined;
}

export function allMessages(): Message[] {
  return clone(state.messages);
}

export function allContentItems(): ContentItem[] {
  return clone(state.contentItems);
}

/* -- writes ------------------------------------------------------------ */

export function updateLeadStage(
  leadId: string,
  stage: WorkflowStage,
  note?: string,
): Lead | undefined {
  const lead = state.leads.find((candidate) => candidate.id === leadId);
  if (!lead) return undefined;
  lead.stage = stage;
  if (note && note.trim()) {
    lead.notes = lead.notes ? `${lead.notes}\n${note.trim()}` : note.trim();
  }
  return clone(lead);
}

/**
 * Converts a qualified lead into a client plus an opening project, mirroring
 * what the API will do inside one transaction.
 */
export function convertLead(leadId: string, projectName: string): {
  client: Client;
  project: Project;
} | undefined {
  const lead = state.leads.find((candidate) => candidate.id === leadId);
  if (!lead) return undefined;

  const existing = state.clients.find((client) => client.sourceLeadId === leadId);
  const client: Client =
    existing ??
    {
      id: nextId('cli'),
      name: lead.name,
      company: lead.company,
      email: lead.email,
      website: lead.website,
      since: new Date().toISOString(),
      sourceLeadId: lead.id,
    };
  if (!existing) state.clients.push(client);

  const startedAt = new Date().toISOString();
  const dueAt = new Date(Date.now() + 90 * 86_400_000).toISOString();

  const milestones: Milestone[] = [
    {
      id: nextId('mil'),
      name: 'Onboarding and access handover',
      stage: 'onboarding',
      status: 'in_progress',
      dueAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    },
    {
      id: nextId('mil'),
      name: 'Strategy and scope sign-off',
      stage: 'strategy',
      status: 'upcoming',
      dueAt: new Date(Date.now() + 25 * 86_400_000).toISOString(),
    },
    {
      id: nextId('mil'),
      name: 'Design approval',
      stage: 'design',
      status: 'upcoming',
      dueAt: new Date(Date.now() + 45 * 86_400_000).toISOString(),
    },
    {
      id: nextId('mil'),
      name: 'Build',
      stage: 'development',
      status: 'upcoming',
      dueAt: new Date(Date.now() + 75 * 86_400_000).toISOString(),
    },
    {
      id: nextId('mil'),
      name: 'Review and launch',
      stage: 'launch',
      status: 'upcoming',
      dueAt,
    },
  ];

  const deliverables: Deliverable[] = [
    {
      id: nextId('dlv'),
      name: 'Signed scope of work',
      kind: 'document',
      status: 'draft',
      updatedAt: startedAt,
    },
  ];

  const project: Project = {
    id: nextId('prj'),
    clientId: client.id,
    name: projectName.trim() || `${lead.company} engagement`,
    stage: 'onboarding',
    startedAt,
    dueAt,
    summary: lead.problem,
    projectType: lead.projectType,
    milestones,
    deliverables,
  };
  state.projects.push(project);

  lead.stage = 'onboarding';

  return { client: clone(client), project: clone(project) };
}

export function appendMessage(input: {
  clientId: string;
  projectId?: string;
  authorName: string;
  authorRole: Message['authorRole'];
  body: string;
}): Message {
  const message: Message = {
    id: nextId('msg'),
    clientId: input.clientId,
    projectId: input.projectId,
    authorName: input.authorName,
    authorRole: input.authorRole,
    body: input.body.trim(),
    sentAt: new Date().toISOString(),
  };
  state.messages.push(message);
  return clone(message);
}

export function upsertContentItem(
  input: Omit<ContentItem, 'id' | 'updatedAt' | 'author'> & {
    id?: string;
    author?: string;
  },
): ContentItem {
  const updatedAt = new Date().toISOString();
  const existingIndex = input.id
    ? state.contentItems.findIndex((item) => item.id === input.id)
    : -1;

  if (existingIndex >= 0) {
    const existing = state.contentItems[existingIndex];
    const next: ContentItem = {
      ...existing,
      collection: input.collection,
      title: input.title,
      slug: input.slug,
      status: input.status,
      body: input.body,
      updatedAt,
    };
    state.contentItems[existingIndex] = next;
    return clone(next);
  }

  const created: ContentItem = {
    id: input.id ?? nextId('cnt'),
    collection: input.collection,
    title: input.title,
    slug: input.slug,
    status: input.status,
    body: input.body,
    updatedAt,
    author: input.author ?? 'John Carl Dimatulac',
  };
  state.contentItems.push(created);
  return clone(created);
}
