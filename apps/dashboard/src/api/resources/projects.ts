/**
 * Project resource functions.
 *
 * TODO(api): replace the mock branch with GET /api/projects.
 */

import { MOCK, delay, request } from '~/api/client';
import * as store from '~/api/mock/store';
import type { Project } from '~/lib/types';

export interface ListProjectsParams {
  /**
   * Restricts the list to one client. Client routes always pass the signed-in
   * client's id.
   *
   * SECURITY: filtering here is for the UI only. The API must derive the
   * permitted clientId from the session and reject (or silently scope) any
   * request where a client asks for projects that are not theirs.
   */
  clientId?: string;
}

export async function listProjects(params: ListProjectsParams = {}): Promise<Project[]> {
  if (MOCK) {
    const rows = store
      .allProjects()
      .filter((project) => (params.clientId ? project.clientId === params.clientId : true))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return delay(rows);
  }

  return request<Project[]>('/api/projects', { query: { clientId: params.clientId } });
}

export interface GetProjectParams {
  projectId: string;
  /** When set, a project belonging to another client resolves as not found. */
  clientId?: string;
}

export async function getProject(params: GetProjectParams): Promise<Project> {
  if (MOCK) {
    const project = store.findProject(params.projectId);
    // Same shape of answer the API should give: a client asking for somebody
    // else's project learns nothing about whether it exists.
    if (!project || (params.clientId && project.clientId !== params.clientId)) {
      throw { code: 'not_found', message: `No project with id ${params.projectId}.` };
    }
    return delay(project);
  }

  return request<Project>(`/api/projects/${params.projectId}`);
}
