import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { getPlayerStats, statsKeys } from './stats-api';
import { StatsSummary } from './StatsSummary';

/** A roster member's statistics in this workspace (spec frontend: /app/players/:id). */
export function PlayerPage() {
  const { t } = useTranslation();
  const { rosterMemberId = '' } = useParams();
  const workspace = useCurrentWorkspace();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const { data, isPending, isError } = useQuery({
    queryKey: statsKeys.player(workspace?.id ?? '', rosterMemberId),
    queryFn: () => getPlayerStats(workspace!.id, rosterMemberId),
    enabled: Boolean(workspace) && authenticated,
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/teams/roster">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{data?.displayName ?? t('stats.player')}</h1>
      </div>
      {!authenticated ? (
        <p className="text-muted-foreground">{t('stats.needsOnline')}</p>
      ) : isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !data ? (
        <p className="text-muted-foreground">{t('errors.generic')}</p>
      ) : (
        <StatsSummary stats={data} />
      )}
    </section>
  );
}
