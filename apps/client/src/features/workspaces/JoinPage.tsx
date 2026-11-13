import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FullScreenSpinner, RequireAuth } from '@/features/auth/RequireAuth';
import { useWorkspaceSelection } from './current-workspace';
import { useRoleLabel } from './labels';
import { acceptInvitation, previewInvitation, workspaceKeys } from './workspaces-api';

const STASH_KEY = 'scoresphere.pendingInvite';

/**
 * Moves the invite token from the URL fragment into session storage and strips it from the
 * address bar. Runs during render, before any redirect to sign-in can drop the fragment.
 */
export function stashInviteToken(): string | null {
  const fromHash = window.location.hash.slice(1);
  try {
    if (fromHash) {
      sessionStorage.setItem(STASH_KEY, fromHash);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return sessionStorage.getItem(STASH_KEY);
  } catch {
    return fromHash || null;
  }
}

function clearStash(): void {
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function JoinPage() {
  const [token] = useState(stashInviteToken);
  return (
    <RequireAuth>
      <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-sm">
          {token ? <JoinCard token={token} /> : <InvalidInvite />}
        </div>
      </div>
    </RequireAuth>
  );
}

function InvalidInvite() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('join.invalidTitle')}</h1>
        </CardTitle>
        <CardDescription>{t('join.invalidBody')}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to="/app">{t('common.goHome')}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function JoinCard({ token }: { token: string }) {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const select = useWorkspaceSelection((s) => s.select);
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => previewInvitation(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: async (workspace) => {
      clearStash();
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      select(workspace.id);
      void navigate(`/app/workspaces/${workspace.id}`, { replace: true });
    },
  });

  if (preview.isPending) return <FullScreenSpinner />;
  if (preview.isError || accept.isError) return <InvalidInvite />;
  const invitation = preview.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('join.title', { workspace: invitation.workspaceName })}</h1>
        </CardTitle>
        <CardDescription>
          {invitation.alreadyMember
            ? t('join.alreadyMember')
            : t('join.body', { role: roleLabel(invitation.role) })}
        </CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            clearStash();
            void navigate('/app', { replace: true });
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button className="flex-1" disabled={accept.isPending} onClick={() => accept.mutate()}>
          {invitation.alreadyMember ? t('join.open') : t('join.accept')}
        </Button>
      </CardFooter>
    </Card>
  );
}
