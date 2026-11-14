import { type SportKey } from '@scoresphere/contracts';
import { getSport, latestEngine, rulesContent, SPORTS } from '@scoresphere/sports';
import { ArrowLeft, ChevronRight, ExternalLink, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { sportUi } from '@/sports/registry';

export function SportsPage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('sports.title')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SPORTS.map((sport) => (
          <li key={sport.key}>
            <Link
              to={`/app/sports/${sport.key}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted"
            >
              <span className="flex-1">
                <span className="block font-medium">{sport.name}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t(`sports.participation.${sport.participation}`)}
                  {sport.usesClock && (
                    <span className="inline-flex items-center gap-1">
                      <Timer aria-hidden className="size-3.5" />
                      {t('sports.timed')}
                    </span>
                  )}
                  {!sportUi(sport.key) && <span>· {t('common.comingSoon')}</span>}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A sport's overview: rules help with its sources, and the formats it can be played in. */
export function SportPage() {
  const { t } = useTranslation();
  const { sportKey } = useParams();
  const sport = SPORTS.find((s) => s.key === sportKey);
  if (!sport)
    return <p className="py-10 text-center text-muted-foreground">{t('sports.notFound')}</p>;
  const key = sport.key as SportKey;
  const content = rulesContent(key);
  const presets = latestEngine(key)?.presets ?? [];
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/sports">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{getSport(key).name}</h1>
      </div>
      {sportUi(key) ? (
        <Button asChild className="w-full">
          <Link to={`/app/matches/new?sport=${key}`}>{t('sports.startMatch')}</Link>
        </Button>
      ) : (
        <p className="text-muted-foreground">{t('sports.comingSoon')}</p>
      )}
      {content && (
        <>
          <p>{content.summary}</p>
          {content.sections.map((section) => (
            <section key={section.title} className="space-y-1">
              <h2 className="font-medium">{section.title}</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {presets.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-medium">{t('sports.formats')}</h2>
          <ul className="space-y-1 text-sm">
            {presets.map((p) => (
              <li key={p.key}>
                {p.name}{' '}
                <span className="text-muted-foreground">
                  ({t(`matches.presetCategory.${p.category}`)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {content && (
        <section className="space-y-1 text-sm text-muted-foreground">
          <h2 className="font-medium text-foreground">{t('sports.sources')}</h2>
          {content.sources.map((source) => (
            <p key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 underline"
              >
                {source.name} <ExternalLink aria-hidden className="size-3" />
              </a>{' '}
              · {t('sports.edition', { edition: source.edition })} ·{' '}
              {t('sports.reviewed', { date: source.lastReviewed })}
            </p>
          ))}
          <p>{t('sports.summaryNote')}</p>
        </section>
      )}
    </section>
  );
}
