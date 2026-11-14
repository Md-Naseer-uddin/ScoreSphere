import type { PlayerStats } from '@scoresphere/contracts';
import { getSport } from '@scoresphere/sports';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** Most telling statistics first; anything else follows in the order the engine reports. */
const HEADLINE: Record<string, string[]> = {
  cricket: [
    'runs',
    'balls_faced',
    'fours',
    'sixes',
    'wickets',
    'runs_conceded',
    'maidens',
    'catches',
  ],
  badminton: ['games_won', 'points_won', 'service_points_won', 'longest_streak'],
  tennis: ['sets_won', 'games_won', 'points_won', 'breaks'],
  volleyball: ['points_scored', 'attack_points', 'block_points', 'service_aces', 'sets_won'],
  chess: ['moves'],
};

/** A record per sport, key statistics and recent results (plan M7). */
export function StatsSummary({ stats }: { stats: PlayerStats }) {
  const { t } = useTranslation();
  if (stats.sports.length === 0)
    return <p className="text-sm text-muted-foreground">{t('stats.none')}</p>;
  return (
    <div className="space-y-4">
      {stats.sports.map((s) => {
        const keys = (HEADLINE[s.sport] ?? []).filter((k) => k in s.metrics);
        return (
          <div key={s.sport} className="space-y-2" data-testid={`stats-${s.sport}`}>
            <p className="font-medium">
              {getSport(s.sport).name}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {t('stats.record', { played: s.played, won: s.won, drawn: s.drawn, lost: s.lost })}
              </span>
            </p>
            {keys.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {keys.map((k) => (
                  <div key={k} className="flex justify-between gap-2 border-b py-1">
                    <dt className="text-muted-foreground">
                      {t(`awards.metric.${k}`, { defaultValue: k.replaceAll('_', ' ') })}
                    </dt>
                    <dd className="tabular-nums">{s.metrics[k]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
      {stats.recent.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('stats.recent')}</p>
          <ul className="space-y-1 text-sm">
            {stats.recent.map((m) => (
              <li key={m.matchId} className="flex justify-between gap-2">
                <Link
                  to={`/app/matches/${m.matchId}`}
                  className="truncate text-primary underline-offset-4 hover:underline"
                >
                  {m.title || getSport(m.sport).name}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {t(`stats.result.${m.result}`)} · {m.summary}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
