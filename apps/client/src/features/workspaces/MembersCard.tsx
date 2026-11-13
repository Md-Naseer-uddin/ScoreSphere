import { hasRole, type Member, WORKSPACE_ROLES, type WorkspaceRole } from '@scoresphere/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useErrorText } from '@/components/form/Field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session';
import { ApiClientError, mediaUrl } from '@/lib/api';
import { useRoleLabel } from './labels';
import { changeMemberRole, listMembers, removeMember, workspaceKeys } from './workspaces-api';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function MembersCard({
  workspaceId,
  myRole,
}: {
  workspaceId: string;
  myRole: WorkspaceRole;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const roleLabel = useRoleLabel();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useSession((s) => s.user);
  const { data: members, isPending } = useQuery({
    queryKey: workspaceKeys.members(workspaceId),
    queryFn: () => listMembers(workspaceId),
  });

  const onError = (error: unknown) => {
    const code =
      error instanceof ApiClientError ? (error.details[0]?.code ?? error.code) : 'generic';
    toast.error(errorText(code));
  };

  const roleChange = useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: WorkspaceRole }) =>
      changeMemberRole(workspaceId, membershipId, role),
    onSuccess: (updated) => queryClient.setQueryData(workspaceKeys.members(workspaceId), updated),
    onError,
  });

  const removal = useMutation({
    mutationFn: (member: Member) => removeMember(workspaceId, member.membershipId),
    onSuccess: async (_data, member) => {
      if (member.userId === me?.id) {
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        void navigate('/app', { replace: true });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
    onError,
  });

  const isAdmin = hasRole(myRole, 'ADMIN');
  const assignable = WORKSPACE_ROLES.filter((r) => r !== 'OWNER' || myRole === 'OWNER');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('workspaces.members')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y">
            {members?.map((member) => {
              const isMe = member.userId === me?.id;
              const canManage = isAdmin && !isMe && (member.role !== 'OWNER' || myRole === 'OWNER');
              return (
                <li key={member.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar>
                    <AvatarImage src={mediaUrl(member.avatarUrl)} alt="" />
                    <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {member.displayName}{' '}
                      {isMe && <span className="text-muted-foreground">({t('common.you')})</span>}
                    </p>
                  </div>
                  {canManage ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) =>
                        roleChange.mutate({
                          membershipId: member.membershipId,
                          role: role as WorkspaceRole,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-32"
                        aria-label={t('workspaces.roleFor', { name: member.displayName })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignable.map((role) => (
                          <SelectItem key={role} value={role}>
                            {roleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                  )}
                  {(canManage || isMe) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removal.isPending}
                      onClick={() => {
                        const prompt = isMe
                          ? t('workspaces.leaveConfirm')
                          : t('workspaces.removeConfirm', { name: member.displayName });
                        if (window.confirm(prompt)) removal.mutate(member);
                      }}
                    >
                      {isMe ? t('workspaces.leave') : t('workspaces.remove')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
