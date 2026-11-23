import { describe, expect, it } from 'vitest';
import { findKnown, type KnownPlayer, normalizeName, resolveSlot, suggest } from './players';

const known: KnownPlayer[] = [
  { value: 'roster:1', label: 'Rayyan', rosterMemberId: '1' },
  { value: 'roster:2', label: 'Mustafa Hussain', rosterMemberId: '2' },
  { value: 'roster:3', label: 'Faizan', rosterMemberId: '3' },
  { value: 'guest:9', label: 'rayyan', rosterMemberId: null },
  { value: 'guest:8', label: 'Adil', rosterMemberId: null },
];

describe('saved players in match setup', () => {
  it('compares names without case or extra spaces', () => {
    expect(normalizeName('  Mustafa   Hussain ')).toBe('mustafa hussain');
  });

  it('matches a typed name to a saved player, preferring the roster over a guest', () => {
    expect(findKnown(known, ' RAYYAN ')?.value).toBe('roster:1');
    expect(findKnown(known, 'adil')?.value).toBe('guest:8');
    expect(findKnown(known, 'Zubair')).toBeUndefined();
    expect(findKnown(known, '   ')).toBeUndefined();
  });

  it('resolves a slot to its saved player or a new name', () => {
    expect(resolveSlot(known, { pick: 'roster:3', name: 'Faizan' })).toMatchObject({
      key: 'roster:3',
      name: 'Faizan',
    });
    expect(resolveSlot(known, { pick: '', name: 'mustafa  hussain' })).toMatchObject({
      key: 'roster:2',
      name: 'Mustafa Hussain',
    });
    expect(resolveSlot(known, { pick: '', name: ' Zubair ' })).toEqual({
      key: 'new:zubair',
      player: null,
      name: 'Zubair',
    });
    expect(resolveSlot(known, { pick: '', name: '' })).toBeNull();
  });

  it('suggests name starts first, then word starts, and skips players already chosen', () => {
    expect(suggest(known, 'hu', new Set()).map((k) => k.label)).toEqual(['Mustafa Hussain']);
    const anyA = suggest(known, 'a', new Set());
    expect(anyA).toHaveLength(5);
    expect(anyA[0]?.label).toBe('Adil');
    expect(suggest(known, 'ray', new Set(['roster:1'])).map((k) => k.value)).toEqual(['guest:9']);
    expect(suggest(known, '', new Set())).toEqual([]);
  });
});
