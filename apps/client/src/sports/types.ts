import type { SideIndex, SportKey } from '@scoresphere/contracts';
import type { TimelineEntry } from '@scoresphere/engine-kit';
import type { ComponentType } from 'react';
import type { AnyProjection } from '@/features/matches/local-store';
import type { SideView } from '@/features/matches/hooks';

export interface SportSetup {
  presetKey: string;
  presetVersion: number;
  config: Record<string, unknown>;
}

export interface SetupProps {
  value: SportSetup | null;
  onChange: (setup: SportSetup) => void;
}

export interface MatchViewProps {
  projection: AnyProjection;
  sides: SideView[];
  /** Add to `Date.now()` to get the scoring device's time; 0 on the scoring device. */
  clockOffsetMs?: number;
}

export interface ControlsProps extends MatchViewProps {
  /** Records an engine command through the ledger; resolves once it is saved on the device. */
  onCommand: (payload: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}

/**
 * The sport-specific screens. The match flow around them is shared, but every sport draws
 * its own scoreboard and controls from its engine (spec frontend §8: no generic "+1" screen).
 */
export interface SportUi {
  sport: SportKey;
  Setup: ComponentType<SetupProps>;
  defaultSetup: () => SportSetup;
  /** How many players each side can have, and how many slots the wizard starts with. */
  sideSize: (config: Record<string, unknown>) => { min: number; max: number; initial: number };
  /** Team sports name their sides (often after a team); others are named after the players. */
  namedSides: boolean;
  Scoreboard: ComponentType<MatchViewProps>;
  Controls: ComponentType<ControlsProps>;
  Scorecard: ComponentType<MatchViewProps>;
  /** One line for the event timeline. */
  describe: (
    entry: TimelineEntry<{ type: string } & Record<string, unknown>>,
    sides: SideView[],
  ) => string;
  /** The corrected command offered for a timeline entry, if the sport supports one. */
  announce?: (facts: TimelineEntry<{ type: string }>['facts'], sides: SideView[]) => string[];
  correction?: (entry: TimelineEntry<{ type: string } & Record<string, unknown>>) => {
    label: string;
    payload: Record<string, unknown>;
  } | null;
  /** Ends the match early (e.g. a retirement), when the sport has such a command. */
  concede?: (side: SideIndex, reason: string) => Record<string, unknown>;
  concedeReasons?: string[];
}
