import { newId } from '@scoresphere/contracts';
import { Smartphone, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSession } from '@/features/auth/session';
import { db, type QuickGuest } from '@/lib/db';
import { useQuickGuests } from './local-data';
import { createRosterMember } from './teams-api';

/**
 * Quick guests live only on this device (ADR 0011). Promoting one creates a workspace
 * roster member, which syncs to other scorers and can collect stats and awards.
 */
export function QuickGuestsCard({
  workspaceId,
  canPromote,
}: {
  workspaceId: string;
  canPromote: boolean;
}) {
  const { t } = useTranslation();
  const userId = useSession((s) => s.user?.id);
  const guests = useQuickGuests() ?? [];
  const [name, setName] = useState('');

  const add = async () => {
    const displayName = name.trim();
    if (!displayName || !userId) return;
    await db.quickGuests.add({
      id: newId(),
      ownerUserId: userId,
      displayName,
      jerseyNumber: null,
      createdAt: new Date().toISOString(),
    });
    setName('');
  };

  const promote = async (guest: QuickGuest) => {
    try {
      await createRosterMember(workspaceId, {
        displayName: guest.displayName,
        jerseyNumber: guest.jerseyNumber,
      });
      await db.quickGuests.delete(guest.id);
      toast.success(t('guests.promoted', { name: guest.displayName }));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone aria-hidden className="size-4" />
          <h2>{t('guests.title')}</h2>
        </CardTitle>
        <CardDescription>{t('guests.body')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('guests.namePlaceholder')}
            aria-label={t('guests.name')}
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            <UserPlus aria-hidden /> {t('guests.add')}
          </Button>
        </form>
        {guests.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {guests.map((guest) => (
              <li key={guest.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 truncate">{guest.displayName}</span>
                {canPromote && (
                  <Button size="sm" variant="ghost" onClick={() => void promote(guest)}>
                    {t('guests.promote')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void db.quickGuests.delete(guest.id)}
                >
                  {t('guests.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
