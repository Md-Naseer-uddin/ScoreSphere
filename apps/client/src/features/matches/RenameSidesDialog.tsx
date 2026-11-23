import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { db } from '@/lib/db';
import type { SideView } from './hooks';
import { matchKeys, renameSides } from './matches-api';

/** Fixes team names after setup, e.g. one left as "Team B". Needs a connection. */
export function RenameSidesDialog({ matchId, sides }: { matchId: string; sides: SideView[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const valid = names.length === sides.length && names.every((n) => n.trim().length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const renamed = await renameSides(matchId, {
        sides: sides.map((s, i) => ({ side: s.side, name: names[i]!.trim() })),
      });
      // This device's copy shows the new names straight away, scoring screen included.
      await db.matches
        .where('id')
        .equals(matchId)
        .modify((match) => {
          for (const side of match.sides) {
            side.name = renamed.find((r) => r.side === side.side)?.name ?? side.name;
          }
        });
      await queryClient.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(t('matches.rename.done'));
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setNames(sides.map((s) => s.name));
          setOpen(true);
        }}
      >
        <Pencil aria-hidden /> {t('matches.rename.action')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('matches.rename.title')}</DialogTitle>
            <DialogDescription>{t('matches.rename.body')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {sides.map((side, i) => (
              <div key={side.side} className="space-y-1">
                <Label htmlFor={`rename-${side.side}`}>
                  {t('matches.rename.side', { side: i === 0 ? 'A' : 'B' })}
                </Label>
                <Input
                  id={`rename-${side.side}`}
                  maxLength={60}
                  autoCapitalize="words"
                  value={names[i] ?? ''}
                  onChange={(e) =>
                    setNames((current) => current.map((n, j) => (j === i ? e.target.value : n)))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!valid || saving} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
