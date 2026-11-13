import {
  type MatchSideSnapshot,
  newId,
  type SideIndex,
  type SportKey,
} from '@scoresphere/contracts';
import { isScorable, SPORTS } from '@scoresphere/sports';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/session';
import { useQuickGuests, useRoster } from '@/features/teams/local-data';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { sportUi } from '@/sports/registry';
import type { SportSetup } from '@/sports/types';
import { createLocalMatch } from './local-store';

/** A player slot: picked from the roster or the device's quick guests, or typed in. */
interface Slot {
  pick: string;
  name: string;
}

const emptySlot = (): Slot => ({ pick: '', name: '' });
type Step = 'sport' | 'format' | 'players';

/**
 * Match setup (spec frontend §7): sport → format → players → start. Works offline: rosters
 * and guests come from the device, and the match is created locally (ADR 0008).
 */
export function NewMatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workspace = useCurrentWorkspace();
  const userId = useSession((s) => s.user?.id);
  const roster = useRoster(workspace?.id);
  const guests = useQuickGuests();

  const initialSport = params.get('sport') as SportKey | null;
  const [sport, setSport] = useState<SportKey | null>(
    initialSport && isScorable(initialSport) ? initialSport : null,
  );
  const [step, setStep] = useState<Step>(sport ? 'format' : 'sport');
  const [setup, setSetup] = useState<SportSetup | null>(() =>
    sport ? (sportUi(sport)?.defaultSetup() ?? null) : null,
  );
  const [slots, setSlots] = useState<[Slot[], Slot[]]>([[emptySlot()], [emptySlot()]]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const ui = sport ? sportUi(sport) : undefined;

  const options = useMemo(
    () => [
      ...(roster ?? []).map((m) => ({
        value: `roster:${m.id}`,
        label: m.displayName,
        rosterMemberId: m.id,
      })),
      ...(guests ?? []).map((g) => ({
        value: `guest:${g.id}`,
        label: g.displayName,
        rosterMemberId: null,
      })),
    ],
    [roster, guests],
  );

  const chooseSetup = (next: SportSetup, forSport: SportKey | null = sport) => {
    setSetup(next);
    const size = (forSport ? sportUi(forSport)?.playersPerSide(next.config) : undefined) ?? 1;
    setSlots(
      (current) =>
        current.map((side) => Array.from({ length: size }, (_, i) => side[i] ?? emptySlot())) as [
          Slot[],
          Slot[],
        ],
    );
  };

  const slotName = (slot: Slot) =>
    slot.pick ? (options.find((o) => o.value === slot.pick)?.label ?? '') : slot.name.trim();
  const picks = slots
    .flat()
    .map((s) => s.pick)
    .filter(Boolean);
  const duplicate = new Set(picks).size !== picks.length;
  const complete = slots.every((side) => side.every((s) => slotName(s).length > 0));

  const start = async () => {
    if (!sport || !setup || !workspace || !userId || !complete || duplicate) return;
    setSaving(true);
    const sides: MatchSideSnapshot[] = slots.map((side, index) => {
      const participants = side.map((slot) => ({
        participantId: newId(),
        displayName: slotName(slot),
        rosterMemberId: options.find((o) => o.value === slot.pick)?.rosterMemberId ?? null,
      }));
      return {
        side: index as SideIndex,
        name: participants
          .map((p) => p.displayName)
          .join(' / ')
          .slice(0, 60),
        teamId: null,
        participants,
      };
    });
    const created = await createLocalMatch({
      ownerUserId: userId,
      workspaceId: workspace.id,
      sport,
      presetKey: setup.presetKey,
      presetVersion: setup.presetVersion,
      config: setup.config,
      title: title.trim() || null,
      sides,
    }).catch(() => null);
    setSaving(false);
    if (!created?.ok) {
      toast.error(created ? created.error.message : t('errors.generic'));
      return;
    }
    navigate(`/app/matches/${created.value}/score`, { replace: true });
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/matches">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{t('matches.new.title')}</h1>
      </div>

      {step === 'sport' && (
        <div className="space-y-4">
          <ChoiceGroup
            label={t('matches.new.sport')}
            value={sport}
            onChange={(key) => {
              setSport(key);
              const defaults = sportUi(key)?.defaultSetup();
              if (defaults) chooseSetup(defaults, key);
              setStep('format');
            }}
            choices={SPORTS.map((s) => ({
              value: s.key,
              label: s.name,
              hint: isScorable(s.key) ? undefined : t('common.comingSoon'),
              disabled: !isScorable(s.key),
            }))}
          />
        </div>
      )}

      {step === 'format' && ui && (
        <div className="space-y-5">
          <ui.Setup value={setup} onChange={(next) => chooseSetup(next)} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('sport')}>
              {t('common.back')}
            </Button>
            <Button className="flex-1" onClick={() => setStep('players')} disabled={!setup}>
              {t('common.continue')}
            </Button>
          </div>
        </div>
      )}

      {step === 'players' && (
        <div className="space-y-6">
          {slots.map((side, sideIndex) => (
            <fieldset key={sideIndex} className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">
                {t('matches.new.sideLabel', { side: sideIndex === 0 ? 'A' : 'B' })}
              </legend>
              {side.map((slot, slotIndex) => {
                const id = `slot-${sideIndex}-${slotIndex}`;
                const update = (patch: Partial<Slot>) =>
                  setSlots((current) => {
                    const next = current.map((s) => [...s]) as [Slot[], Slot[]];
                    next[sideIndex]![slotIndex] = { ...slot, ...patch };
                    return next;
                  });
                const label = t('matches.new.player', {
                  side: sideIndex === 0 ? 'A' : 'B',
                  n: slotIndex + 1,
                });
                return (
                  <div key={slotIndex} className="space-y-2">
                    <Label htmlFor={`${id}-pick`}>{label}</Label>
                    <select
                      id={`${id}-pick`}
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                      value={slot.pick}
                      onChange={(e) => update({ pick: e.target.value })}
                    >
                      <option value="">{t('matches.new.typeName')}</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                          {o.rosterMemberId ? '' : ` · ${t('matches.new.guest')}`}
                        </option>
                      ))}
                    </select>
                    {!slot.pick && (
                      <Input
                        aria-label={t('matches.new.nameFor', { player: label })}
                        placeholder={t('matches.new.namePlaceholder')}
                        maxLength={60}
                        value={slot.name}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </fieldset>
          ))}
          <div className="space-y-1">
            <Label htmlFor="match-title">{t('matches.new.titleLabel')}</Label>
            <Input
              id="match-title"
              maxLength={80}
              placeholder={t('matches.new.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {duplicate && <p className="text-sm text-destructive">{t('matches.new.duplicate')}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('format')}>
              {t('common.back')}
            </Button>
            <Button
              className="flex-1"
              size="lg"
              disabled={!complete || duplicate || saving || !workspace}
              onClick={() => void start()}
            >
              {t('matches.new.start')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
