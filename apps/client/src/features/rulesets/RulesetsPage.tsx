import { type Ruleset, hasRole, type SportKey } from '@scoresphere/contracts';
import { getSport, latestEngine, SPORTS } from '@scoresphere/sports';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { db } from '@/lib/db';
import { sportUi } from '@/sports/registry';

/** Sports whose engine declares what rules may use, and which can be scored here. */
export const ruleSports = SPORTS.filter(
  (s) => sportUi(s.key) && latestEngine(s.key)?.ruleCatalogue,
).map((s) => s.key);

/** The workspace's rulesets for one sport, from the device copy (works offline). */
export function useRulesets(workspaceId: string | undefined, sport?: SportKey | null) {
  return useLiveQuery(async () => {
    if (!workspaceId) return [] as Ruleset[];
    const all = await db.rulesets.where('workspaceId').equals(workspaceId).toArray();
    return all
      .filter((r) => !sport || r.sport === sport)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workspaceId, sport]);
}

/** Custom rulesets (plan M8): saved settings plus rules, used when starting a match. */
export function RulesetsPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const rulesets = useRulesets(workspace?.id);
  const canEdit = workspace ? hasRole(workspace.role, 'SCORER') : false;
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/matches">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{t('rulesets.title')}</h1>
        {canEdit && (
          <Button asChild className="ml-auto">
            <Link to="/app/rulesets/new">
              <Plus aria-hidden /> {t('rulesets.new')}
            </Link>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('rulesets.intro')}</p>
      {rulesets === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : rulesets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('rulesets.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {rulesets.map((r) => (
            <li key={r.id}>
              <Link
                to={`/app/rulesets/${r.id}`}
                className="block rounded-xl border p-4 hover:bg-muted"
              >
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {getSport(r.sport).name} · {t('rulesets.count', { count: r.latest.rules.length })}{' '}
                  · {t('rulesets.version', { version: r.latest.version })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
