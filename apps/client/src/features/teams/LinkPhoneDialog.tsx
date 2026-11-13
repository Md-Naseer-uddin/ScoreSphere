import { normalizeIndianMobile, type RosterMember } from '@scoresphere/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useErrorText } from '@/components/form/Field';
import { PhoneInput } from '@/components/form/PhoneInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api';
import { linkRosterMember, lookupPhone } from './teams-api';

/** Gives a name-only roster member a phone, e.g. once a student gets one (ADR 0011). */
export function LinkPhoneDialog({
  workspaceId,
  member,
}: {
  workspaceId: string;
  member: RosterMember;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const normalized = normalizeIndianMobile(phone);

  const link = async () => {
    if (!normalized) return;
    setBusy(true);
    try {
      const found = await lookupPhone(workspaceId, normalized);
      if (found.result === 'ON_ROSTER') {
        toast.error(t('errors.ALREADY_ON_ROSTER'));
        return;
      }
      const target =
        found.result === 'DISCOVERABLE' ? { personId: found.person.id } : { phone: normalized };
      const updated = await linkRosterMember(workspaceId, member.id, target);
      toast.success(
        updated.link === 'LINKED'
          ? t('roster.linkedNow')
          : t('roster.invitedNow', { name: member.displayName }),
      );
      setOpen(false);
      setPhone('');
    } catch (error) {
      toast.error(
        errorText(
          error instanceof ApiClientError ? (error.details[0]?.code ?? error.code) : 'generic',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {t('roster.addPhone')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('roster.addPhoneTitle', { name: member.displayName })}</DialogTitle>
          <DialogDescription>{t('roster.addPhoneBody')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void link();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="link-phone">{t('auth.phone')}</Label>
            <PhoneInput id="link-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={!normalized || busy}>
            {t('roster.linkPhone')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
