import { useMutation } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearSession, useSession } from '@/features/auth/session';
import { clearReferenceData } from '@/features/sync/reference-sync';
import { ApiClientError, apiFetch, json } from '@/lib/api';
import { db } from '@/lib/db';
import { queryClient } from '@/lib/query-client';

async function downloadExport() {
  const data = await apiFetch('/me/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'scoresphere-my-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Removes everything this account left on the device. */
async function forgetDevice(userId: string) {
  const matchIds = await db.matches.where('ownerUserId').equals(userId).primaryKeys();
  await db.transaction('rw', db.matches, db.matchEvents, db.quickGuests, async () => {
    for (const id of matchIds) {
      await db.matchEvents.where('[matchId+seq]').between([id, -Infinity], [id, Infinity]).delete();
    }
    await db.matches.bulkDelete(matchIds);
    await db.quickGuests.where('ownerUserId').equals(userId).delete();
  });
}

/** The DPDP rights: a copy of your data, and erasure. */
export function YourDataCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useSession((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const exporting = useMutation({
    mutationFn: downloadExport,
    onError: () => toast.error(t('errors.generic')),
  });
  const deleting = useMutation({
    mutationFn: () => apiFetch('/me/deletion', { method: 'POST', ...json({ password }) }),
    onSuccess: async () => {
      if (userId) await forgetDevice(userId).catch(() => undefined);
      await clearSession();
      queryClient.clear();
      await clearReferenceData().catch(() => undefined);
      navigate('/auth/register', { replace: true });
      toast.success(t('yourData.deleted'));
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.details.some((d) => d.code === 'WRONG_PASSWORD')) {
        setError(t('yourData.wrongPassword'));
      } else {
        setError(e instanceof Error ? e.message : t('errors.generic'));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('yourData.title')}</CardTitle>
        <CardDescription>
          {t('yourData.body')}{' '}
          <Link to="/privacy" className="text-primary underline underline-offset-4">
            {t('legal.privacy')}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={exporting.isPending} onClick={() => exporting.mutate()}>
          <Download aria-hidden /> {t('yourData.download')}
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden /> {t('yourData.delete')}
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('yourData.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('yourData.deleteBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="delete-password">{t('auth.password')}</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!password || deleting.isPending}
              onClick={() => deleting.mutate()}
            >
              {t('yourData.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
