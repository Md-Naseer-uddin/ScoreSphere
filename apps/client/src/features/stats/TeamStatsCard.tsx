import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth/session';
import { getMyStats, getTeamStats, statsKeys } from './stats-api';
import { StatsSummary } from './StatsSummary';

export function TeamStatsCard({ workspaceId, teamId }: { workspaceId: string; teamId: string }) {
  const { t } = useTranslation();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const { data } = useQuery({
    queryKey: statsKeys.team(workspaceId, teamId),
    queryFn: () => getTeamStats(workspaceId, teamId),
    enabled: authenticated,
  });
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('stats.teamRecord')}</CardTitle>
      </CardHeader>
      <CardContent>
        <StatsSummary stats={data} />
      </CardContent>
    </Card>
  );
}

/** The signed-in user's own career, from every workspace that has linked them. */
export function MyStatsCard() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: statsKeys.me, queryFn: getMyStats });
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('stats.mine')}</CardTitle>
      </CardHeader>
      <CardContent>
        <StatsSummary stats={data} />
      </CardContent>
    </Card>
  );
}
