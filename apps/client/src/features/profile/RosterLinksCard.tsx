import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listMyRosterLinks,
  myRosterLinksKey,
  respondToRosterLink,
} from '@/features/teams/teams-api';

/** Teams that added this person by phone. Confirming links their history to this account (ADR 0013). */
export function RosterLinksCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: links = [] } = useQuery({ queryKey: myRosterLinksKey, queryFn: listMyRosterLinks });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToRosterLink(id, accept),
    onSuccess: (updated) => queryClient.setQueryData(myRosterLinksKey, updated),
    onError: () => toast.error(t('errors.generic')),
  });

  if (links.length === 0) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>
          <h2>{t('rosterLinks.title')}</h2>
        </CardTitle>
        <CardDescription>{t('rosterLinks.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {links.map((link) => (
            <li key={link.rosterMemberId} className="space-y-2 py-3">
              <p>
                {t('rosterLinks.addedYou', { workspace: link.workspaceName, name: link.nameUsed })}
              </p>
              {link.state === 'AWAITING_APPROVAL' ? (
                <Badge variant="outline">{t('rosterLinks.awaitingAdmin')}</Badge>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: link.rosterMemberId, accept: true })}
                  >
                    {t('rosterLinks.thatsMe')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: link.rosterMemberId, accept: false })}
                  >
                    {t('rosterLinks.notMe')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
