import type { WorkspaceSummary } from '@scoresphere/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { create } from 'zustand';
import { useSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { listWorkspaces, workspaceKeys } from './workspaces-api';

const KEY = 'scoresphere.currentWorkspace';

// A per-device convenience only; storage can be unavailable (private mode), so never rely on it.
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Ignore: the selection just won't persist across reloads.
  }
}

export const useWorkspaceSelection = create<{
  selectedId: string | null;
  select: (id: string) => void;
}>((set) => ({
  selectedId: read(),
  select: (id) => {
    write(id);
    set({ selectedId: id });
  },
}));

/** The user's workspaces: from the server when reachable, else from the device copy. */
export function useWorkspaces() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  const query = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: listWorkspaces,
    enabled: authenticated,
  });
  const cached = useLiveQuery(
    async () =>
      (await db.workspaces.toArray()).sort(
        (a, b) => Number(b.type === 'PERSONAL') - Number(a.type === 'PERSONAL'),
      ),
    [],
  );
  return { ...query, data: query.data ?? (cached?.length ? cached : undefined) };
}

/** The workspace new teams and matches belong to: the user's pick, else their personal one. */
export function useCurrentWorkspace(): WorkspaceSummary | undefined {
  const { data } = useWorkspaces();
  const selectedId = useWorkspaceSelection((s) => s.selectedId);
  return data?.find((w) => w.id === selectedId) ?? data?.[0];
}
