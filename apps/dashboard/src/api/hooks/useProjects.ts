import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { getProject, listProjects } from '~/api/resources/projects';
import { currentClientId } from '~/lib/auth';
import { STALE_TIME, queryKeys } from './queryKeys';

/**
 * Lists projects. A signed-in client only ever sees their own: the clientId
 * comes from the session here, so no component can widen the result.
 *
 * SECURITY: the API must enforce the same scoping server-side.
 */
export function useProjects() {
  return useQuery(() => {
    const scopedTo = currentClientId() ?? undefined;
    return {
      queryKey: queryKeys.projects.list(scopedTo),
      queryFn: () => listProjects({ clientId: scopedTo }),
      staleTime: STALE_TIME.reference,
    };
  });
}

export function useProject(projectId: Accessor<string | undefined>) {
  return useQuery(() => {
    const scopedTo = currentClientId() ?? undefined;
    const id = projectId();
    return {
      queryKey: queryKeys.projects.detail(id ?? '', scopedTo),
      queryFn: () => getProject({ projectId: id as string, clientId: scopedTo }),
      enabled: Boolean(id),
      staleTime: STALE_TIME.reference,
    };
  });
}
