import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LEGAL_UPDATED, type LegalSection, privacySections, termsSections } from './content';

function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft aria-hidden className="size-4" /> {t('app.name')}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {t('legal.updated', { date: LEGAL_UPDATED })}
        </p>
        <p className="rounded-lg bg-muted p-3 text-sm">{t('legal.draft')}</p>
      </div>
      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-lg font-medium">{section.title}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {section.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return <LegalPage title={t('legal.privacy')} sections={privacySections} />;
}

export function TermsPage() {
  const { t } = useTranslation();
  return <LegalPage title={t('legal.terms')} sections={termsSections} />;
}
