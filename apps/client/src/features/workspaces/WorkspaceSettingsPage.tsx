import { hasRole } from '@scoresphere/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { InvitationsCard } from './InvitationsCard';
import { MembersCard } from './MembersCard';
import { WorkspaceDetailsCard } from './WorkspaceDetailsCard';
import { getWorkspace, workspaceKeys } from './workspaces-api';

export function WorkspaceSettingsPage() {
  const { t } = useTranslation();
  const { workspaceId = '' } = useParams();
  const {
    data: workspace,
    isPending,
    isError,
  } = useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: () => getWorkspace(workspaceId),
  });

  if (isPending) return <Skeleton className="h-48 w-full" />;
  if (isError || !workspace) {
    return <p className="py-10 text-center text-muted-foreground">{t('workspaces.notFound')}</p>;
  }
  if (workspace.type === 'PERSONAL') {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('workspaces.personal')}</h1>
        <p className="text-muted-foreground">{t('workspaces.personalBody')}</p>
      </section>
    );
  }

  const isAdmin = hasRole(workspace.role, 'ADMIN');
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{workspace.name}</h1>
      <WorkspaceDetailsCard workspace={workspace} editable={isAdmin} />
      <MembersCard workspaceId={workspace.id} myRole={workspace.role} />
      {isAdmin && <InvitationsCard workspaceId={workspace.id} myRole={workspace.role} />}
    </section>
  );
}
