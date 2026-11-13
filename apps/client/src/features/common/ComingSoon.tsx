import { useTranslation } from 'react-i18next';

export function ComingSoon() {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 py-10 text-center">
      <h1 className="text-xl font-semibold">{t('common.comingSoon')}</h1>
      <p className="text-muted-foreground">{t('common.comingSoonBody')}</p>
    </section>
  );
}
