import {
  type MatchSideSnapshot,
  newId,
  type SideIndex,
  type SportKey,
} from '@scoresphere/contracts';
import { SPORTS } from '@scoresphere/sports';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/session';
import { useQuickGuests, useRoster, useTeams } from '@/features/teams/local-data';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { db } from '@/lib/db';
import { sportUi } from '@/sports/registry';
import type { SportSetup, SportUi } from '@/sports/types';
import { createLocalMatch } from './local-store';

/** A player slot: picked from the roster or the device's quick guests, or typed in. */
interface Slot {
  pick: string;
  name: string;
}

interface SideDraft {
  name: string;
  teamId: string | null;
  slots: Slot[];
}

const emptySlot = (): Slot => ({ pick: '', name: '' });
const LETTERS = ['A', 'B'] as const;
type Step = 'sport' | 'format' | 'players';

function draftSides(
  ui: SportUi | undefined,
  setup: SportSetup | null,
  defaultName: (letter: string) => string,
): SideDraft[] {
  const size = ui && setup ? ui.sideSize(setup.config).initial : 1;
  return LETTERS.map((letter) => ({
    name: ui?.namedSides ? defaultName(letter) : '',
    teamId: null,
    slots: Array.from({ length: size }, emptySlot),
  }));
}

/**
 * Match setup (spec frontend §7): sport → format → sides → start. Works offline: teams,
 * rosters and guests come from the device, and the match is created locally (ADR 0008).
 */
export function NewMatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workspace = useCurrentWorkspace();
  const userId = useSession((s) => s.user?.id);
  const roster = useRoster(workspace?.id);
  const guests = useQuickGuests();
  const teams = useTeams(workspace?.id);
  const defaultName = (letter: string) => t('matches.new.defaultSideName', { side: letter });

  const initialSport = params.get('sport') as SportKey | null;
  const [sport, setSport] = useState<SportKey | null>(
    initialSport && sportUi(initialSport) ? initialSport : null,
  );
  const ui = sport ? sportUi(sport) : undefined;
  const [step, setStep] = useState<Step>(sport ? 'format' : 'sport');
  const [setup, setSetup] = useState<SportSetup | null>(() => ui?.defaultSetup() ?? null);
  const [sides, setSides] = useState<SideDraft[]>(() => draftSides(ui, setup, defaultName));
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const size = ui && setup ? ui.sideSize(setup.config) : { min: 1, max: 1, initial: 1 };
  const options = useMemo(
    () => [
      ...(roster ?? []).map((m) => ({
        value: `roster:${m.id}`,
        label: m.displayName,
        rosterMemberId: m.id as string | null,
      })),
      ...(guests ?? []).map((g) => ({
        value: `guest:${g.id}`,
        label: g.displayName,
        rosterMemberId: null,
      })),
    ],
    [roster, guests],
  );
  const sportTeams = (teams ?? []).filter(
    (team) => team.sportKeys.length === 0 || (sport !== null && team.sportKeys.includes(sport)),
  );

  const chooseSport = (key: SportKey) => {
    const next = sportUi(key);
    const defaults = next?.defaultSetup() ?? null;
    setSport(key);
    setSetup(defaults);
    setSides(draftSides(next, defaults, defaultName));
    setStep('format');
  };

  const chooseSetup = (next: SportSetup) => {
    setSetup(next);
    const { min, max } = ui!.sideSize(next.config);
    setSides((current) =>
      current.map((side) => {
        const slots = side.slots.slice(0, max);
        while (slots.length < min) slots.push(emptySlot());
        return { ...side, slots };
      }),
    );
  };

  const updateSide = (index: number, patch: Partial<SideDraft>) =>
    setSides((current) => current.map((side, i) => (i === index ? { ...side, ...patch } : side)));

  const pickTeam = async (index: number, teamId: string) => {
    if (!teamId) return updateSide(index, { teamId: null });
    const team = sportTeams.find((x) => x.id === teamId);
    const members = await db.teamMembers.where('teamId').equals(teamId).toArray();
    const slots: Slot[] = members
      .slice(0, size.max)
      .map((m) => ({ pick: `roster:${m.rosterMemberId}`, name: '' }));
    while (slots.length < size.min) slots.push(emptySlot());
    updateSide(index, { teamId, name: team?.name ?? '', slots });
  };

  const slotName = (slot: Slot) =>
    slot.pick ? (options.find((o) => o.value === slot.pick)?.label ?? '') : slot.name.trim();
  const picks = sides.flatMap((s) => s.slots.map((x) => x.pick)).filter(Boolean);
  const duplicate = new Set(picks).size !== picks.length;
  const complete =
    sides.every(
      (side) => side.slots.length >= size.min && side.slots.every((s) => slotName(s).length > 0),
    ) &&
    (!ui?.namedSides || sides.every((side) => side.name.trim().length > 0));

  const start = async () => {
    if (!sport || !setup || !workspace || !userId || !complete || duplicate) return;
    setSaving(true);
    const snapshot: MatchSideSnapshot[] = sides.map((side, index) => {
      const participants = side.slots.map((slot) => ({
        participantId: newId(),
        displayName: slotName(slot),
        rosterMemberId: options.find((o) => o.value === slot.pick)?.rosterMemberId ?? null,
      }));
      const name = ui?.namedSides
        ? side.name.trim()
        : participants.map((p) => p.displayName).join(' / ');
      return {
        side: index as SideIndex,
        name: name.slice(0, 60),
        teamId: side.teamId,
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
      sides: snapshot,
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
        <ChoiceGroup
          label={t('matches.new.sport')}
          value={sport}
          onChange={chooseSport}
          choices={SPORTS.map((s) => ({
            value: s.key,
            label: s.name,
            hint: sportUi(s.key) ? undefined : t('common.comingSoon'),
            disabled: !sportUi(s.key),
          }))}
        />
      )}

      {step === 'format' && ui && (
        <div className="space-y-5">
          <ui.Setup value={setup} onChange={chooseSetup} />
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

      {step === 'players' && ui && (
        <div className="space-y-6">
          {sides.map((side, sideIndex) => {
            const letter = LETTERS[sideIndex]!;
            return (
              <fieldset key={sideIndex} className="space-y-3 rounded-xl border p-4">
                <legend className="px-1 text-sm font-medium">
                  {t('matches.new.sideLabel', { side: letter })}
                </legend>
                {ui.namedSides && sportTeams.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor={`team-${sideIndex}`}>
                      {t('matches.new.team', { side: letter })}
                    </Label>
                    <select
                      id={`team-${sideIndex}`}
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                      value={side.teamId ?? ''}
                      onChange={(e) => void pickTeam(sideIndex, e.target.value)}
                    >
                      <option value="">{t('matches.new.noTeam')}</option>
                      {sportTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {ui.namedSides && (
                  <div className="space-y-1">
                    <Label htmlFor={`side-name-${sideIndex}`}>
                      {t('matches.new.sideName', { side: letter })}
                    </Label>
                    <Input
                      id={`side-name-${sideIndex}`}
                      maxLength={60}
                      value={side.name}
                      onChange={(e) => updateSide(sideIndex, { name: e.target.value })}
                    />
                  </div>
                )}
                {side.slots.map((slot, slotIndex) => {
                  const id = `slot-${sideIndex}-${slotIndex}`;
                  const update = (patch: Partial<Slot>) =>
                    updateSide(sideIndex, {
                      slots: side.slots.map((s, i) =>
                        i === slotIndex ? { ...slot, ...patch } : s,
                      ),
                    });
                  const label = t('matches.new.player', { side: letter, n: slotIndex + 1 });
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
                {size.max > size.min && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={side.slots.length >= size.max}
                      onClick={() => updateSide(sideIndex, { slots: [...side.slots, emptySlot()] })}
                    >
                      <Plus aria-hidden /> {t('matches.new.addPlayer', { side: letter })}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={side.slots.length <= size.min}
                      onClick={() => updateSide(sideIndex, { slots: side.slots.slice(0, -1) })}
                    >
                      <Minus aria-hidden /> {t('matches.new.removePlayer')}
                    </Button>
                  </div>
                )}
              </fieldset>
            );
          })}
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
