import { newId } from '@scoresphere/contracts';
import { badmintonPresets } from '@scoresphere/sports';
import { createLocalMatch } from '@/features/matches/local-store';
import type { LocalDatabase } from '@/lib/db';

const preset = badmintonPresets[0]!;

/** A singles badminton match created on the device, as the wizard would. */
export function newBadmintonMatch(database: LocalDatabase, ownerUserId = newId()) {
  const [a, b] = [newId(), newId()];
  return createLocalMatch(
    {
      ownerUserId,
      workspaceId: newId(),
      sport: 'badminton',
      presetKey: preset.key,
      presetVersion: preset.version,
      config: { ...preset.config, discipline: 'singles' },
      title: null,
      sides: [
        {
          side: 0,
          name: 'Asha',
          teamId: null,
          participants: [{ participantId: a, displayName: 'Asha', rosterMemberId: null }],
        },
        {
          side: 1,
          name: 'Ravi',
          teamId: null,
          participants: [{ participantId: b, displayName: 'Ravi', rosterMemberId: null }],
        },
      ],
    },
    database,
  );
}
