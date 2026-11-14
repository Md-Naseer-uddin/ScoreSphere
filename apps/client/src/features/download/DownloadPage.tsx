import { ArrowLeft, Download, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppVersionInfo } from '@/lib/app-version';
import { APP_VERSION } from '@/lib/platform';

/** Where people get the Android app and learn to install the web app (plan M6). */
export function DownloadPage() {
  const { t } = useTranslation();
  const { data: info, isPending } = useAppVersionInfo();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft aria-hidden className="size-4" /> {t('app.name')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('download.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone aria-hidden className="size-4" /> {t('download.android')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isPending ? null : info?.apk ? (
            <>
              <p>{t('download.latest', { version: info.latestVersion ?? '' })}</p>
              <Button asChild>
                <a href={info.apk.url} rel="noopener">
                  <Download aria-hidden /> {t('download.getApk')}
                </a>
              </Button>
              <div className="space-y-1">
                <p className="font-medium">{t('download.checksum')}</p>
                <code
                  className="block break-all rounded bg-muted p-2 text-xs"
                  data-testid="apk-sha256"
                >
                  {info.apk.sha256}
                </code>
                <p className="text-muted-foreground">{t('download.verify')}</p>
              </div>
              {info.releaseNotesUrl && (
                <a
                  href={info.releaseNotesUrl}
                  className="text-primary underline underline-offset-4"
                  rel="noopener"
                >
                  {t('download.releaseNotes')}
                </a>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{t('download.noApk')}</p>
          )}
          <p className="text-muted-foreground">{t('download.requirements')}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t('download.sideload1')}</li>
            <li>{t('download.sideload2')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('download.web')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t('download.webBody')}</p>
          <p className="font-medium">{t('download.androidChrome')}</p>
          <p className="text-muted-foreground">{t('download.androidChromeSteps')}</p>
          <p className="font-medium">{t('download.iphone')}</p>
          <p className="text-muted-foreground">{t('download.iphoneSteps')}</p>
          <p className="rounded-lg bg-muted p-3">{t('download.iphoneOffline')}</p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('download.thisVersion', { version: APP_VERSION })}
      </p>
    </div>
  );
}
