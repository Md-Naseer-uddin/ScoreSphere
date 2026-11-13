import { getSport } from '@scoresphere/sports';
import { ChevronRight, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { CreateTeamDialog } from './CreateTeamDialog';
import { useTeams } from './local-data';
import { useCanManageRoster } from './permissions';
import { QuickGuestsCard } from './QuickGuestsCard';

export function TeamsPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const teams = useTeams(workspace?.id);
  const canManage = useCanManageRoster(workspace?.id);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('teams.title')}</h1>
        {workspace && canManage && <CreateTeamDialog workspaceId={workspace.id} />}
      </div>

      <Button variant="outline" asChild className="w-full justify-between">
        <Link to="/app/teams/roster">
          <span className="flex items-center gap-2">
            <Users aria-hidden /> {t('roster.title')}
          </span>
          <ChevronRight aria-hidden />
        </Link>
      </Button>

      {teams === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : teams.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {t('teams.empty')}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                to={`/app/teams/${team.id}`}
                className="block rounded-xl border bg-card p-4 hover:bg-muted/50"
              >
                <p className="font-medium">{team.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t('teams.memberCount', { count: team.memberCount })}
                  {team.sportKeys.length > 0 &&
                    ` · ${team.sportKeys.map((k) => getSport(k).name).join(', ')}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {workspace && <QuickGuestsCard workspaceId={workspace.id} canPromote={canManage} />}
    </section>
  );
}
