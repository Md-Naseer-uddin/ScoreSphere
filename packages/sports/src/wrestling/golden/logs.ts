import type { Rule } from '@scoresphere/contracts';
import { wrestlingPresets, type WrestlingSettings } from '../settings.js';

/**
 * Wrestling golden logs: a script of bout actions and the result it must produce (plan §4).
 * Expectations were worked out by hand from the Rules, independently of the engine.
 *
 * Script lines (A and B are the two wrestlers):
 * - `start`, `end`, `stop`, `go`
 * - `2 A takedown`, `4 B throw`, `1 B` (kind not recorded), `caution A 1` (B gets 1 point)
 * - `fall A` (A pins B), `whistle`, `concede A injury|forfeit|disqualification`
 */
export interface WrestlingGoldenLog {
  name: string;
  source: string;
  config: WrestlingSettings;
  rules?: Rule[];
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    classification?: [number, number];
  };
}

const config = (key: string): WrestlingSettings =>
  wrestlingPresets.find((p) => p.key === key)!.config;

export const wrestlingGoldenLogs: WrestlingGoldenLog[] = [
  {
    name: 'Freestyle, won on points with a caution',
    source: 'constructed',
    config: config('uww-freestyle'),
    script: [
      'start',
      '2 A takedown',
      '1 B step_out',
      'end',
      'start',
      '2 A exposure',
      'caution B 1',
      'end',
    ],
    expected: { summary: '5–1', winner: 'A', classification: [3, 1] },
  },
  {
    name: 'Greco-Roman, technical superiority at an 8-point lead',
    source: 'constructed',
    config: config('uww-greco'),
    script: ['start', '4 A throw', '2 A takedown', '2 A exposure'],
    expected: { summary: '8–0 (technical superiority)', winner: 'A', classification: [4, 0] },
  },
  {
    name: 'A level bout decided on criteria: the highest-value action',
    source: 'constructed',
    config: config('uww-freestyle'),
    script: ['start', '2 A takedown', '1 B', '1 B', 'end', 'start', 'end'],
    expected: { summary: '2–2 (on criteria)', winner: 'A', classification: [3, 1] },
  },
  {
    name: 'A fall from behind',
    source: 'constructed',
    config: config('uww-womens'),
    script: ['start', '2 B takedown', 'fall A'],
    expected: { summary: '0–2 (fall)', winner: 'A', classification: [5, 0] },
  },
  {
    name: 'Disqualified for three cautions',
    source: 'constructed',
    config: config('uww-freestyle'),
    script: ['start', 'caution A 1', 'caution A 1', 'caution A 2'],
    expected: { summary: '0–4 (three cautions)', winner: 'B', classification: [0, 5] },
  },
];
