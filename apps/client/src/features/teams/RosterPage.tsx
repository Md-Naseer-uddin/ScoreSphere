import { hasRole, type RosterMember } from '@scoresphere/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { initials } from '@/features/workspaces/MembersCard';
import { mediaUrl } from '@/lib/api';
import { LinkBadge } from './link-badge';
import { LinkPhoneDialog } from './LinkPhoneDialog';
import { useRoster } from './local-data';
import { useCanManageRoster } from './permissions';
import { archiveRosterMember, decideClaim } from './teams-api';

/** Everyone this workspace scores for, with claims waiting for an admin first. */
export function RosterPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const roster = useRoster(workspace?.id);
  const canManage = useCanManageRoster(workspace?.id);
  const isAdmin = workspace ? hasRole(workspace.role, 'ADMIN') : false;

  if (!workspace || roster === undefined) return <Skeleton className="h-48 w-full" />;

  const claims = roster.filter((m) => m.link === 'AWAITING_APPROVAL');
  const others = roster.filter((m) => m.link !== 'AWAITING_APPROVAL');

  const decide = (member: RosterMember, approve: boolean) =>
    void decideClaim(workspace.id, member.id, approve)
      .then(() => toast.success(approve ? t('roster.approved') : t('roster.rejected')))
      .catch(() => toast.error(t('errors.generic')));

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('roster.title')}</h1>
        <p className="text-muted-foreground">{t('roster.body')}</p>
      </div>

      {claims.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium">{t('roster.claimsTitle')}</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {claims.map((member) => (
              <li key={member.id} className="space-y-2 px-4 py-3">
                <p className="text-sm">
                  {t('roster.claimBody', {
                    account: member.claimantName ?? '',
                    name: member.displayName,
                  })}
                </p>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(member, true)}>
                      {t('roster.approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(member, false)}>
                      {t('roster.reject')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('roster.adminWillReview')}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {others.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {t('roster.empty')}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {others.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar>
                <AvatarImage src={mediaUrl(member.avatarUrl)} alt="" />
                <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
              </Avatar>
              <Link
                to={`/app/players/${member.id}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {member.displayName}
              </Link>
              <LinkBadge link={member.link} />
              {canManage && member.link === 'NONE' && (
                <LinkPhoneDialog workspaceId={workspace.id} member={member} />
              )}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('roster.archiveConfirm', { name: member.displayName }))) {
                      void archiveRosterMember(workspace.id, member.id).catch(() =>
                        toast.error(t('errors.generic')),
                      );
                    }
                  }}
                >
                  {t('roster.archive')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
