import { getSport } from '@scoresphere/sports';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaces } from '@/features/workspaces/current-workspace';
import { useWorkspaceName } from '@/features/workspaces/labels';
import { initials } from '@/features/workspaces/MembersCard';
import { mediaUrl } from '@/lib/api';
import { AddMembersSheet } from './AddMembersSheet';
import { LinkBadge } from './link-badge';
import { useTeam } from './local-data';
import { useCanManageRoster } from './permissions';
import { archiveTeam, removeTeamMember } from './teams-api';

export function TeamDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaceName = useWorkspaceName();
  const { teamId } = useParams();
  const data = useTeam(teamId);
  const { data: workspaces } = useWorkspaces();
  const canManage = useCanManageRoster(data?.team.workspaceId);

  if (data === undefined) return <Skeleton className="h-48 w-full" />;
  if (data === null)
    return <p className="py-10 text-center text-muted-foreground">{t('teams.notFoundTeam')}</p>;

  const { team, members } = data;
  const workspace = workspaces?.find((w) => w.id === team.workspaceId);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t('teams.memberCount', { count: members.length })}
          {team.sportKeys.length > 0 &&
            ` · ${team.sportKeys.map((k) => getSport(k).name).join(', ')}`}
        </p>
      </div>

      {canManage && workspace && (
        <AddMembersSheet
          workspaceId={team.workspaceId}
          workspaceName={workspaceName(workspace)}
          teamId={team.id}
          memberIds={new Set(members.map((m) => m.rosterMember.id))}
        />
      )}

      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {t('teams.noMembers')}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {members.map(({ membershipId, jerseyNumber, rosterMember }) => (
            <li key={membershipId} className="flex items-center gap-3 px-4 py-3">
              <Avatar>
                <AvatarImage src={mediaUrl(rosterMember.avatarUrl)} alt="" />
                <AvatarFallback>{initials(rosterMember.displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{rosterMember.displayName}</p>
                {(jerseyNumber ?? rosterMember.jerseyNumber) && (
                  <p className="text-sm text-muted-foreground">
                    {t('teams.jerseyShort', { number: jerseyNumber ?? rosterMember.jerseyNumber })}
                  </p>
                )}
              </div>
              <LinkBadge link={rosterMember.link} />
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void removeTeamMember(team.workspaceId, team.id, membershipId).catch(() =>
                      toast.error(t('errors.generic')),
                    )
                  }
                >
                  {t('workspaces.remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Button
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => {
            if (!window.confirm(t('teams.archiveConfirm', { name: team.name }))) return;
            void archiveTeam(team.workspaceId, team.id).then(() =>
              navigate('/app/teams', { replace: true }),
            );
          }}
        >
          {t('teams.archive')}
        </Button>
      )}
    </section>
  );
}
