#!/usr/bin/env node
/**
 * Load test for event ingestion and live fan-out (plan M11). No dependencies: Node 24's
 * fetch is the client. Point it at an API whose rate limits are off, never at production.
 *
 *   node infra/load/load-test.mjs --base http://localhost:3300 \
 *     --matches 20 --events 100 --spectators 50
 *
 * Every match is scored like a real device: its CREATED event, the start and the first
 * game in one request, then one rally per request. One match also has spectators on the
 * public SSE stream; the script reports how long each update took to reach them.
 */
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3300' },
    matches: { type: 'string', default: '20' },
    events: { type: 'string', default: '100' },
    spectators: { type: 'string', default: '50' },
  },
});
const API = `${args.base}/api/v1`;
const MATCHES = Number(args.matches);
const EVENTS = Number(args.events);
const SPECTATORS = Number(args.spectators);

/** A UUIDv7: 48-bit millisecond time, version and variant bits, random rest. */
function uuidv7() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ts = BigInt(Date.now());
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(ts & 0xffn);
    ts >>= 8n;
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN;
function summary(label, samples) {
  const s = [...samples].sort((a, b) => a - b);
  const f = (n) => `${n.toFixed(1)} ms`;
  console.log(
    `${label}: n=${s.length} p50=${f(percentile(s, 50))} p95=${f(percentile(s, 95))} p99=${f(percentile(s, 99))} max=${f(s.at(-1) ?? NaN)}`,
  );
}

const singles21 = {
  discipline: 'singles',
  pointsToWin: 21,
  winBy: 2,
  cap: 30,
  gamesToWin: 2,
  intervalAt: 11,
  deciderChangeEndsAt: 11,
};

/** One device scoring one badminton match. */
class Device {
  constructor(workspaceId) {
    this.matchId = uuidv7();
    this.deviceId = uuidv7();
    this.players = [uuidv7(), uuidv7()];
    this.workspaceId = workspaceId;
    this.seq = 0;
  }
  event(kind, payload) {
    this.seq += 1;
    return {
      eventId: uuidv7(),
      seq: this.seq,
      leaseEpoch: 1,
      engineVersion: 1,
      occurredAt: Date.now(),
      kind,
      payload,
    };
  }
  opening() {
    return {
      deviceId: this.deviceId,
      match: {
        workspaceId: this.workspaceId,
        title: null,
        sides: [0, 1].map((side) => ({
          side,
          name: `Load ${side}`,
          teamId: null,
          participants: [
            {
              participantId: this.players[side],
              displayName: `Player ${side}`,
              rosterMemberId: null,
            },
          ],
        })),
      },
      events: [
        this.event('CREATED', {
          sport: 'badminton',
          presetKey: 'bwf-3x21',
          presetVersion: 1,
          config: singles21,
          roster: { sides: [0, 1].map((side) => ({ side, participantIds: [this.players[side]] })) },
        }),
        this.event('LIFECYCLE', { action: 'START' }),
        this.event('COMMAND', { type: 'start_game', servingSide: 0 }),
      ],
    };
  }
  rally(winner) {
    return { deviceId: this.deviceId, events: [this.event('COMMAND', { type: 'rally', winner })] };
  }
}

/** Reads a server-sent event stream, calling `onEvent(name, data)` for each event. */
async function followStream(token, onEvent, signal) {
  const res = await fetch(`${API}/public/live/stream`, {
    headers: { 'x-share-token': token },
    signal,
  });
  if (!res.ok) throw new Error(`stream: ${res.status}`);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const name = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (data) onEvent(name, JSON.parse(data));
    }
  }
}

async function main() {
  const phone = `9${String(Date.now()).slice(-9)}`;
  const session = await call('/auth/register', {
    method: 'POST',
    body: {
      phone,
      password: 'load test password 1',
      displayName: 'Load test',
      adultConfirmed: true,
      device: { deviceId: uuidv7(), platform: 'WEB', appVersion: '0.0.0-load' },
    },
  });
  const token = session.accessToken;
  const workspaces = await call('/workspaces', { token });
  const workspaceId = workspaces.find((w) => w.type === 'PERSONAL').id;
  const devices = Array.from({ length: MATCHES }, () => new Device(workspaceId));
  for (const d of devices)
    await call(`/matches/${d.matchId}/events`, { token, method: 'POST', body: d.opening() });

  // Spectators follow the first match.
  const watched = devices[0];
  const link = await call(`/matches/${watched.matchId}/share-links`, {
    token,
    method: 'POST',
    body: { expiresInHours: 1 },
  });
  const postedAt = new Map();
  const fanOut = [];
  const abort = new AbortController();
  let ready = 0;
  const streams = Array.from({ length: SPECTATORS }, () =>
    followStream(
      link.token,
      (name, data) => {
        if (name === 'snapshot') ready += 1;
        const version = data?.version;
        if (name === 'delta' && postedAt.has(version))
          fanOut.push(performance.now() - postedAt.get(version));
      },
      abort.signal,
    ).catch((e) => {
      if (e.name !== 'AbortError') console.error('stream failed:', e.message);
    }),
  );
  while (ready < SPECTATORS) await new Promise((r) => setTimeout(r, 50));

  const latencies = [];
  let errors = 0;
  const started = performance.now();
  await Promise.all(
    devices.map(async (d, i) => {
      for (let n = 0; n < EVENTS; n++) {
        const body = d.rally((n + i) % 3 === 0 ? 1 : 0);
        const t0 = performance.now();
        if (d === watched) postedAt.set(d.seq, t0);
        try {
          await call(`/matches/${d.matchId}/events`, { token, method: 'POST', body });
          latencies.push(performance.now() - t0);
        } catch (e) {
          errors += 1;
          if (errors <= 3) console.error(e.message);
          break;
        }
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  await new Promise((r) => setTimeout(r, 1000));
  abort.abort();
  await Promise.all(streams);

  console.log(`matches=${MATCHES} events/match=${EVENTS} spectators=${SPECTATORS}`);
  summary('ingest latency', latencies);
  console.log(`throughput: ${(latencies.length / seconds).toFixed(0)} events/s, errors: ${errors}`);
  summary('spectator delivery', fanOut);
  console.log(`spectator updates received: ${fanOut.length} of ${EVENTS * SPECTATORS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
