import { SPORTS } from '@scoresphere/sports';
import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SportsPage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('sports.title')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SPORTS.map((sport) => (
          <li key={sport.key} className="rounded-xl border bg-card p-4">
            <p className="font-medium">{sport.name}</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {t(`sports.participation.${sport.participation}`)}
              {sport.usesClock && (
                <span className="inline-flex items-center gap-1">
                  <Timer aria-hidden className="size-3.5" />
                  {t('sports.timed')}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
