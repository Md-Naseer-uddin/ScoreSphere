import { hasRole, type WorkspaceRole } from '@scoresphere/contracts';
import { useWorkspaces } from '@/features/workspaces/current-workspace';

/** The caller's role in a workspace, from the cached workspace list. */
export function useWorkspaceRole(workspaceId: string | undefined): WorkspaceRole | undefined {
  const { data } = useWorkspaces();
  return data?.find((w) => w.id === workspaceId)?.role;
}

/** Scorers and above manage rosters and teams; the server enforces this too. */
export function useCanManageRoster(workspaceId: string | undefined): boolean {
  const role = useWorkspaceRole(workspaceId);
  return role ? hasRole(role, 'SCORER') : false;
}
