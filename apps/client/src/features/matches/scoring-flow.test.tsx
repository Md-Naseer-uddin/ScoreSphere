import type { PostMatchEventsRequest } from '@scoresphere/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { mockApi, ok } from '@/test/fetch-mock';
import { renderApp } from '@/test/render';
import { signIn, TEST_USER } from '@/test/session';

const workspace = {
  id: '01a1d66d-0000-7000-8000-0000000000aa',
  type: 'PERSONAL',
  name: 'Personal',
  role: 'OWNER',
};

beforeEach(async () => {
  await Promise.all([db.matches.clear(), db.matchEvents.clear()]);
  signIn();
});
afterEach(() => vi.unstubAllGlobals());

function server() {
  const received: PostMatchEventsRequest[] = [];
  mockApi({
    'GET /workspaces': ok([workspace]),
    'GET /sync/reference': ok({
      cursor: new Date().toISOString(),
      workspaces: [workspace],
      teams: [],
      teamMembers: [],
      rosterMembers: [],
      rulesets: [],
    }),
    'POST /matches/*': (init) => {
      if (init.url.endsWith('/lease')) {
        // The server's version is the highest seq it has received.
        const version = Math.max(0, ...received.flatMap((b) => b.events.map((e) => e.seq)));
        return ok({ leaseEpoch: 1, leaseDeviceId: 'this-device', version });
      }
      const body = JSON.parse(init.body as string) as PostMatchEventsRequest;
      received.push(body);
      return ok({
        results: body.events.map((e) => ({
          eventId: e.eventId,
          seq: e.seq,
          outcome: 'ACCEPTED',
          code: null,
        })),
        version: body.events[body.events.length - 1]!.seq,
        leaseEpoch: 1,
        needsReview: false,
      });
    },
  });
  return received;
}

describe('scoring a badminton match', () => {
  it('sets up a quick match, scores rallies, undoes one and syncs every event once', async () => {
    const received = server();
    const user = userEvent.setup();
    renderApp('/app/matches/new?sport=badminton');

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for Side A player 1' }), 'Asha');
    await user.type(screen.getByRole('textbox', { name: 'Name for Side B player 1' }), 'Ravi');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start match' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Start match' }));

    const serves = await screen.findByRole('radiogroup', { name: 'Who serves first?' });
    await user.click(within(serves).getByRole('radio', { name: 'Asha' }));
    await user.click(screen.getByRole('button', { name: 'Start game 1' }));

    // The buttons are disabled while each point is saved, so tap once per saved point.
    const tap = async (name: string, side: 0 | 1, expected: string) => {
      await user.click(await screen.findByRole('button', { name }));
      await waitFor(() => expect(screen.getByTestId(`points-${side}`)).toHaveTextContent(expected));
    };
    await tap('Point Asha', 0, '1');
    await tap('Point Asha', 0, '2');
    await tap('Point Ravi', 1, '1');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByTestId('points-1')).toHaveTextContent('0'));
    const timeline = within(screen.getByRole('region', { name: 'Recent events' }));
    expect(timeline.getByText('Point Ravi')).toHaveClass('line-through');
    expect(timeline.getByText('Point Asha · 2–0')).not.toHaveClass('line-through');

    await waitFor(async () => {
      const [match] = await db.matches.where('ownerUserId').equals(TEST_USER.id).toArray();
      const events = await db.matchEvents.toArray();
      expect(match?.serverKnown).toBe(true);
      expect(events.every((e) => e.sync === 'synced')).toBe(true);
    });
    const seqs = received.flatMap((b) => b.events.map((e) => e.seq));
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(received[0]!.match?.sides.map((s) => s.name)).toEqual(['Asha', 'Ravi']);
  });
});
