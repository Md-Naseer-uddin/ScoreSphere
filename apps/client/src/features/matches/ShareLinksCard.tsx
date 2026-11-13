import type { CreatedShareLink } from '@scoresphere/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { env } from '@/lib/env';
import { shareText } from '@/lib/platform';
import { createShareLink, listShareLinks, matchKeys, revokeShareLink } from './matches-api';

/** The token is in the fragment, so it never reaches a server log or Referer (ADR 0021). */
export function liveUrl(token: string): string {
  return `${env.publicAppUrl}/live#${token}`;
}

/** Read-only links for spectators: create, copy and revoke. */
export function ShareLinksCard({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreatedShareLink | null>(null);
  const links = useQuery({
    queryKey: matchKeys.shareLinks(matchId),
    queryFn: () => listShareLinks(matchId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: matchKeys.shareLinks(matchId) });

  const create = useMutation({
    mutationFn: (hours: number | null) => createShareLink(matchId, hours),
    onSuccess: (link) => {
      setCreated(link);
      void refresh();
    },
    onError: () => toast.error(t('matches.share.failed')),
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeShareLink(matchId, linkId),
    onSuccess: () => {
      if (created) setCreated(null);
      toast.success(t('matches.share.revoked'));
      void refresh();
    },
  });

  const active = links.data?.filter((l) => l.active) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 aria-hidden className="size-4" /> {t('matches.share.title')}
        </CardTitle>
        <CardDescription>{t('matches.share.body')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {created && (
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <p className="break-all text-sm" data-testid="share-url">
              {liveUrl(created.token)}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(liveUrl(created.token));
                  toast.success(t('matches.share.copied'));
                }}
              >
                <Copy aria-hidden /> {t('common.copy')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void shareText(t('matches.share.message'), liveUrl(created.token))}
              >
                <Share2 aria-hidden /> {t('common.share')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('matches.share.onlyOnce')}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(null)}>
            {t('matches.share.create')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={create.isPending}
            onClick={() => create.mutate(24)}
          >
            {t('matches.share.create24h')}
          </Button>
        </div>
        {active.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {active.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {link.expiresAt
                    ? t('matches.share.expires', {
                        date: new Date(link.expiresAt).toLocaleString(),
                      })
                    : t('matches.share.noExpiry')}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(link.id)}
                >
                  {t('matches.share.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
