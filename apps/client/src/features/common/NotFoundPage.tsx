import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-md space-y-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('common.notFound')}</h1>
      <p className="text-muted-foreground">{t('common.notFoundBody')}</p>
      <Button asChild>
        <Link to="/app">{t('common.goHome')}</Link>
      </Button>
    </section>
  );
}
