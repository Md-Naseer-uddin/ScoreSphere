import { Search, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { type KnownPlayer, normalizeName, type Slot, suggest } from './players';

/**
 * One box per player: type a name, or tap a saved player suggested as you type. A typed
 * name that matches a saved player is the same player, so there is no separate picker.
 */
export function PlayerNameField({
  number,
  label,
  slot,
  known,
  exclude,
  onChange,
}: {
  number: number;
  /** Accessible name, e.g. "Name for Side A player 1". */
  label: string;
  slot: Slot;
  known: KnownPlayer[];
  /** Saved players already in this match. */
  exclude: ReadonlySet<string>;
  onChange: (slot: Slot) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const picked = known.find((k) => k.value === slot.pick);
  const text = picked ? picked.label : slot.name;
  const suggestions = focused && !picked ? suggest(known, text, exclude) : [];
  // An exact match is already that player; only offer it if the case differs.
  const offered = suggestions.filter((s) => s.label !== text.trim());

  return (
    <div className="flex items-start gap-3">
      <label
        htmlFor={id}
        className="mt-3 w-6 shrink-0 text-right text-sm font-semibold text-muted-foreground tabular-nums"
      >
        {number}
      </label>
      <div className="min-w-0 flex-1">
        <Input
          id={id}
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={offered.length ? `${id}-suggestions` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          placeholder={t('matches.new.namePlaceholder')}
          maxLength={60}
          className="h-11"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange({ pick: '', name: e.target.value })}
        />
        {offered.length > 0 && (
          <div
            id={`${id}-suggestions`}
            role="group"
            aria-label={t('matches.new.savedPlayers')}
            className="mt-1 flex flex-wrap gap-2"
          >
            {offered.map((player) => (
              <Button
                key={player.value}
                type="button"
                size="sm"
                variant="secondary"
                // Keep the box focused so the tap lands on the suggestion.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onChange({ pick: player.value, name: player.label })}
              >
                {player.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Fills a side from the saved players in one go, instead of typing each name. */
export function SavedPlayersSheet({
  side,
  known,
  exclude,
  capacity,
  onAdd,
}: {
  side: string;
  known: KnownPlayer[];
  exclude: ReadonlySet<string>;
  /** How many more players this side can take. */
  capacity: number;
  onAdd: (players: KnownPlayer[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const available = useMemo(() => {
    const q = normalizeName(query);
    return known.filter((k) => !exclude.has(k.value) && (!q || normalizeName(k.label).includes(q)));
  }, [known, exclude, query]);
  if (known.length === 0) return null;

  const toggle = (value: string) =>
    setChosen((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  const add = () => {
    onAdd(chosen.map((v) => known.find((k) => k.value === v)!).filter(Boolean));
    setChosen([]);
    setQuery('');
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="w-full" disabled={capacity === 0}>
          <Users aria-hidden /> {t('matches.new.chooseSaved', { side })}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh]"
        // Don't open the phone keyboard over the list; the search box is there if needed.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{t('matches.new.chooseSaved', { side })}</SheetTitle>
          <SheetDescription>{t('matches.new.placesLeft', { count: capacity })}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 overflow-y-auto px-4">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={t('matches.new.searchPlayers')}
              placeholder={t('matches.new.searchPlayers')}
              className="h-11 pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {available.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('matches.new.noSavedMatch')}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {available.map((player) => {
                const checked = chosen.includes(player.value);
                return (
                  <li key={player.value}>
                    <label className="flex min-h-12 items-center gap-3 px-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={checked}
                        disabled={!checked && chosen.length >= capacity}
                        onChange={() => toggle(player.value)}
                      />
                      <span className="flex-1">{player.label}</span>
                      {!player.rosterMemberId && (
                        <span className="text-xs text-muted-foreground">
                          {t('matches.new.onThisPhone')}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <SheetFooter>
          <Button size="lg" disabled={chosen.length === 0} onClick={add}>
            {t('matches.new.addChosen', { count: chosen.length })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
