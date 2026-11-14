import type { Rule, SportKey } from '@scoresphere/contracts';
import { latestEngine, previewRules } from '@scoresphere/sports';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SideView } from '@/features/matches/hooks';
import { sportUi } from '@/sports/registry';

/** Shows what the rules would do in a short sample game (plan M8 "preview"). */
export function RulePreviewCard({
  sport,
  config,
  rules,
}: {
  sport: SportKey;
  config: Record<string, unknown>;
  rules: Rule[];
}) {
  const { t } = useTranslation();
  const ui = sportUi(sport);
  const preview = useMemo(() => {
    const engine = latestEngine(sport);
    return engine ? previewRules(engine, config, rules) : null;
  }, [sport, config, rules]);
  if (!ui || !preview) return null;

  const sides: SideView[] = preview.ids.map((ids, side) => ({
    side: side as 0 | 1,
    name: t('rulesets.preview.side', { side: side === 0 ? 'A' : 'B' }),
    participants: ids.map((participantId, i) => ({
      participantId,
      displayName: t('rulesets.preview.player', { side: side === 0 ? 'A' : 'B', n: i + 1 }),
    })),
  }));
  const fired = preview.timeline.filter((entry) => entry.derived?.length);

  return (
    <section aria-label={t('rulesets.preview.title')} className="space-y-2 rounded-xl border p-4">
      <h2 className="font-medium">{t('rulesets.preview.title')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('rulesets.preview.intro', { count: preview.timeline.length })}
      </p>
      {fired.length === 0 ? (
        <p className="text-sm">{t('rulesets.preview.nothing')}</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {fired.map((entry) => (
            <li key={entry.seq}>
              <span className="text-muted-foreground">{ui.describe(entry, sides)}</span>
              {entry.derived!.map((effect, i) => (
                <span key={i} className="block">
                  {effect.invalid
                    ? t('matches.timeline.ruleSkipped', {
                        name: effect.ruleName,
                        reason: effect.invalid.message,
                      })
                    : t('matches.timeline.rule', {
                        name: effect.ruleName,
                        effect: ui.describe(effect, sides),
                      })}
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-muted-foreground">{t('rulesets.preview.with')}</dt>
        <dd className="tabular-nums" data-testid="preview-with">
          {preview.summary}
        </dd>
        <dt className="text-muted-foreground">{t('rulesets.preview.without')}</dt>
        <dd className="tabular-nums">{preview.summaryWithout}</dd>
      </dl>
    </section>
  );
}
