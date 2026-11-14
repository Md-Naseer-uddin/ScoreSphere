import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" asChild>
          <Link to="/app/matches/new">{t('home.startMatch')}</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/app/sports">{t('home.browseSports')}</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        <Link to="/download" className="text-primary underline underline-offset-4">
          {t('home.getApp')}
        </Link>
      </p>
    </section>
  );
}
