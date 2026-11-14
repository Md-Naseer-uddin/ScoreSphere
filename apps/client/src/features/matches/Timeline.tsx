import type { TimelineEntry } from '@scoresphere/engine-kit';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { SportUi } from '@/sports/types';
import { cn } from '@/lib/utils';
import type { SideView } from './hooks';

type Entry = TimelineEntry<{ type: string } & Record<string, unknown>>;

/** Recent events, newest first. Undone events stay visible, struck through (ADR 0005). */
export function Timeline({
  entries,
  sides,
  ui,
  limit = 12,
  onCorrect,
  busy = false,
}: {
  entries: Entry[];
  sides: SideView[];
  ui: SportUi;
  limit?: number;
  onCorrect?: (entry: Entry, payload: Record<string, unknown>) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const recent = [...entries].reverse().slice(0, limit);
  if (recent.length === 0) return null;
  return (
    <section aria-label={t('matches.timeline.title')} className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t('matches.timeline.title')}</h2>
      <ol className="divide-y rounded-xl border">
        {recent.map((entry) => {
          const undone = entry.voidedBy !== undefined;
          const correction = onCorrect && !undone ? ui.correction?.(entry) : null;
          return (
            <li key={entry.seq} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={cn('flex-1', undone && 'text-muted-foreground line-through')}>
                {ui.describe(entry, sides)}
                {entry.replacedBy !== undefined && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('matches.timeline.corrected')}
                  </span>
                )}
                {undone && <span className="sr-only"> ({t('matches.timeline.undone')})</span>}
                {entry.invalid && (
                  <span className="ml-2 text-xs text-destructive">
                    {t('matches.timeline.flagged')}
                  </span>
                )}
                {entry.derived?.map((effect, i) => (
                  <span key={i} className="block text-xs text-muted-foreground">
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
              </span>
              {correction && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onCorrect!(entry, correction.payload)}
                >
                  {correction.label}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
