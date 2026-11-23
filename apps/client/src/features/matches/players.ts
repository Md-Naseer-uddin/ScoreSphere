/** Saved players offered in match setup: roster members first, then this device's guests. */
export interface KnownPlayer {
  /** `roster:<id>` or `guest:<id>`. */
  value: string;
  label: string;
  rosterMemberId: string | null;
}

/** A player slot in match setup: a saved player (`pick`) or a typed name. */
export interface Slot {
  pick: string;
  name: string;
}

/** Names compare without case or extra spaces, so "Rayyan " and "rayyan" are one player. */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** The saved player a typed name refers to, preferring roster members over guests. */
export function findKnown(known: KnownPlayer[], name: string): KnownPlayer | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  const matches = known.filter((k) => normalizeName(k.label) === target);
  return matches.find((k) => k.rosterMemberId) ?? matches[0];
}

/** Who a slot is: its saved player, or the new name typed into it. */
export function resolveSlot(
  known: KnownPlayer[],
  slot: Slot,
): { key: string; player: KnownPlayer | null; name: string } | null {
  if (slot.pick) {
    const player = known.find((k) => k.value === slot.pick);
    if (player) return { key: player.value, player, name: player.label };
  }
  const name = slot.name.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const player = findKnown(known, name) ?? null;
  return {
    key: player?.value ?? `new:${normalizeName(name)}`,
    player,
    name: player?.label ?? name,
  };
}

/** Saved players matching what has been typed: name starts first, then word starts, then any. */
export function suggest(
  known: KnownPlayer[],
  query: string,
  exclude: ReadonlySet<string>,
  limit = 5,
): KnownPlayer[] {
  const q = normalizeName(query);
  if (!q) return [];
  const rank = (label: string) => {
    const name = normalizeName(label);
    if (name === q) return -1;
    if (name.startsWith(q)) return 0;
    if (name.split(' ').some((word) => word.startsWith(q))) return 1;
    return name.includes(q) ? 2 : 3;
  };
  return known
    .filter((k) => !exclude.has(k.value))
    .map((k) => ({ k, r: rank(k.label) }))
    .filter(({ r }) => r < 3)
    .sort((a, b) => a.r - b.r || a.k.label.localeCompare(b.k.label))
    .slice(0, limit)
    .map(({ k }) => k);
}
