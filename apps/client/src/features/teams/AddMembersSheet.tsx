import { Share } from '@capacitor/share';
import {
  type LookupResult,
  normalizeIndianMobile,
  type RosterMember,
} from '@scoresphere/contracts';
import { Search, Share2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useErrorText } from '@/components/form/Field';
import { PhoneInput } from '@/components/form/PhoneInput';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { initials } from '@/features/workspaces/MembersCard';
import { ApiClientError, mediaUrl } from '@/lib/api';
import { env } from '@/lib/env';
import { isNative } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { LinkBadge } from './link-badge';
import { useRoster } from './local-data';
import { addTeamMembers, createRosterMember, lookupPhone } from './teams-api';

type Mode = 'phone' | 'name' | 'roster';

interface Props {
  workspaceId: string;
  workspaceName: string;
  teamId: string;
  memberIds: Set<string>;
}

/** Add players to a team: by phone (Player), by name (roster member), or from the roster (ADR 0011). */
export function AddMembersSheet(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('phone');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <UserPlus aria-hidden /> {t('teams.addPlayers')}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('teams.addPlayers')}</SheetTitle>
          <SheetDescription>{t('teams.addPlayersBody')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div
            role="tablist"
            aria-label={t('teams.addPlayers')}
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
          >
            {(['phone', 'name', 'roster'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md px-2 py-2 text-sm',
                  mode === m && 'bg-background font-medium shadow-sm',
                )}
              >
                {t(`teams.mode.${m}`)}
              </button>
            ))}
          </div>
          {mode === 'phone' && <ByPhone {...props} />}
          {mode === 'name' && <ByName {...props} />}
          {mode === 'roster' && <FromRoster {...props} onDone={() => setOpen(false)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useAddFailed() {
  const errorText = useErrorText();
  return (error: unknown) =>
    toast.error(
      errorText(
        error instanceof ApiClientError ? (error.details[0]?.code ?? error.code) : 'generic',
      ),
    );
}

function ByPhone({ workspaceId, workspaceName, teamId, memberIds }: Props) {
  const { t } = useTranslation();
  const failed = useAddFailed();
  const roster = useRoster(workspaceId) ?? [];
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const normalized = normalizeIndianMobile(phone);

  const search = async () => {
    if (!normalized) return;
    setBusy(true);
    setInvited(null);
    try {
      const found = await lookupPhone(workspaceId, normalized);
      setResult(found);
      setName(found.result === 'DISCOVERABLE' ? found.person.displayName : '');
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!result || !normalized) return;
    setBusy(true);
    try {
      let rosterMemberId: string;
      if (result.result === 'ON_ROSTER') {
        rosterMemberId = result.rosterMemberId;
      } else {
        const member = await createRosterMember(workspaceId, {
          displayName: name.trim(),
          link:
            result.result === 'DISCOVERABLE'
              ? { personId: result.person.id }
              : { phone: normalized },
        });
        rosterMemberId = member.id;
      }
      if (!memberIds.has(rosterMemberId))
        await addTeamMembers(workspaceId, teamId, [rosterMemberId]);
      toast.success(t('teams.added', { name: name.trim() || t('teams.player') }));
      if (result.result === 'INVITE') setInvited(name.trim());
      setResult(null);
      setPhone('');
      setName('');
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async (who: string) => {
    const text = t('roster.inviteMessage', {
      name: who,
      workspace: workspaceName,
      link: `${env.publicAppUrl}/auth/register`,
    });
    if (isNative()) await Share.share({ text });
    else if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(text);
      toast.success(t('workspaces.linkCopied'));
    }
  };

  const existing =
    result?.result === 'ON_ROSTER' ? roster.find((m) => m.id === result.rosterMemberId) : undefined;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Label htmlFor="lookup-phone">{t('auth.phone')}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <PhoneInput
              id="lookup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={!normalized || busy}
            aria-label={t('teams.search')}
          >
            <Search aria-hidden />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('teams.phonePrivacy')}</p>
      </form>

      {result?.result === 'DISCOVERABLE' && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Avatar>
            <AvatarImage src={mediaUrl(result.person.avatarUrl)} alt="" />
            <AvatarFallback>{initials(result.person.displayName)}</AvatarFallback>
          </Avatar>
          <p className="flex-1 font-medium">{result.person.displayName}</p>
        </div>
      )}
      {result?.result === 'ON_ROSTER' && (
        <p className="rounded-lg border p-3 text-sm">
          {t('teams.alreadyOnRoster', { name: existing?.displayName ?? '' })}
        </p>
      )}
      {result?.result === 'INVITE' && (
        <p className="rounded-lg border p-3 text-sm">{t('teams.notFound')}</p>
      )}

      {result && result.result !== 'ON_ROSTER' && (
        <div className="space-y-1.5">
          <Label htmlFor="lookup-name">{t('teams.nameOnTeam')}</Label>
          <Input
            id="lookup-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      {result && (
        <Button
          className="w-full"
          disabled={busy || (result.result !== 'ON_ROSTER' && !name.trim())}
          onClick={() => void add()}
        >
          {result.result === 'INVITE' ? t('teams.addAndInvite') : t('teams.addToTeam')}
        </Button>
      )}

      {invited && (
        <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
          <p className="text-sm">{t('roster.invitedHint', { name: invited })}</p>
          <Button size="sm" onClick={() => void shareInvite(invited)}>
            <Share2 aria-hidden /> {t('roster.sendInvite')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ByName({ workspaceId, teamId }: Props) {
  const { t } = useTranslation();
  const failed = useAddFailed();
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const member = await createRosterMember(workspaceId, {
        displayName: name.trim(),
        jerseyNumber: jersey,
      });
      await addTeamMembers(workspaceId, teamId, [member.id]);
      toast.success(t('teams.added', { name: member.displayName }));
      setName('');
      setJersey('');
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <p className="text-sm text-muted-foreground">{t('teams.nameOnlyBody')}</p>
      <div className="space-y-1.5">
        <Label htmlFor="member-name">{t('auth.displayName')}</Label>
        <Input
          id="member-name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="member-jersey">{t('teams.jersey')}</Label>
        <Input
          id="member-jersey"
          value={jersey}
          maxLength={4}
          inputMode="numeric"
          className="w-24"
          onChange={(e) => setJersey(e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {t('teams.addToTeam')}
      </Button>
    </form>
  );
}

function FromRoster({ workspaceId, teamId, memberIds, onDone }: Props & { onDone: () => void }) {
  const { t } = useTranslation();
  const failed = useAddFailed();
  const roster = (useRoster(workspaceId) ?? []).filter((m: RosterMember) => !memberIds.has(m.id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (roster.length === 0)
    return <p className="py-4 text-center text-muted-foreground">{t('teams.rosterAllAdded')}</p>;

  return (
    <div className="space-y-3">
      <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
        {roster.map((member) => (
          <li key={member.id}>
            <label className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={selected.has(member.id)}
                onChange={() => toggle(member.id)}
              />
              <span className="flex-1 truncate">{member.displayName}</span>
              <LinkBadge link={member.link} />
            </label>
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        disabled={busy || selected.size === 0}
        onClick={() => {
          setBusy(true);
          addTeamMembers(workspaceId, teamId, [...selected])
            .then(() => {
              toast.success(t('teams.addedMany', { count: selected.size }));
              setSelected(new Set());
              onDone();
            })
            .catch(failed)
            .finally(() => setBusy(false));
        }}
      >
        {t('teams.addSelected', { count: selected.size })}
      </Button>
    </div>
  );
}
