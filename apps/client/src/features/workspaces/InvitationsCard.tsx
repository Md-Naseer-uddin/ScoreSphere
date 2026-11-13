import { Share } from '@capacitor/share';
import type { WorkspaceRole } from '@scoresphere/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { env } from '@/lib/env';
import { isNative } from '@/lib/platform';
import { useRoleLabel } from './labels';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  workspaceKeys,
} from './workspaces-api';

type InviteRole = 'ADMIN' | 'SCORER' | 'VIEWER';

/** The token travels in the fragment, so it never reaches server logs or Referer headers (ADR 0021). */
export function invitationLink(token: string): string {
  return `${env.publicAppUrl}/join#${token}`;
}

export function InvitationsCard({
  workspaceId,
  myRole,
}: {
  workspaceId: string;
  myRole: WorkspaceRole;
}) {
  const { t, i18n } = useTranslation();
  const roleLabel = useRoleLabel();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<InviteRole>('SCORER');
  const [link, setLink] = useState<string | null>(null);
  const roles: InviteRole[] =
    myRole === 'OWNER' ? ['ADMIN', 'SCORER', 'VIEWER'] : ['SCORER', 'VIEWER'];

  const { data: pending = [] } = useQuery({
    queryKey: workspaceKeys.invitations(workspaceId),
    queryFn: () => listInvitations(workspaceId),
  });

  const create = useMutation({
    mutationFn: () => createInvitation(workspaceId, role),
    onSuccess: async (invitation) => {
      setLink(invitationLink(invitation.token));
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(workspaceId) });
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(workspaceId, invitationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(workspaceId) }),
  });

  const share = async () => {
    if (!link) return;
    const text = t('workspaces.inviteMessage', { role: roleLabel(role) });
    if (isNative()) {
      await Share.share({ text, url: link });
    } else if (navigator.share) {
      await navigator.share({ text, url: link }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(link);
      toast.success(t('workspaces.linkCopied'));
    }
  };

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('workspaces.invite')}</h2>
        </CardTitle>
        <CardDescription>{t('workspaces.inviteBody')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
            <SelectTrigger className="w-36" aria-label={t('workspaces.inviteRole')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Link2 aria-hidden /> {t('workspaces.createLink')}
          </Button>
        </div>

        {link && (
          <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">{t('workspaces.linkReady')}</p>
            <Input
              readOnly
              value={link}
              aria-label={t('workspaces.inviteLink')}
              onFocus={(e) => e.target.select()}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => toast.success(t('workspaces.linkCopied')))
                }
              >
                <Copy aria-hidden /> {t('common.copy')}
              </Button>
              <Button size="sm" onClick={() => void share()}>
                <Share2 aria-hidden /> {t('common.share')}
              </Button>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('workspaces.pendingInvites')}</h3>
            <ul className="divide-y rounded-lg border">
              {pending.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1">
                    {roleLabel(invitation.role)} ·{' '}
                    {t('workspaces.expires', {
                      date: dateFormat.format(new Date(invitation.expiresAt)),
                    })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(invitation.id)}>
                    {t('workspaces.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
