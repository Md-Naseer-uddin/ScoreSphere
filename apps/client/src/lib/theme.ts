import { useSyncExternalStore } from 'react';

/**
 * Colour theme. Light is the default: it is the high-contrast theme built for scoring in
 * direct sunlight. Dark, or following the phone, is the user's choice. The choice is a
 * per-device convenience, so it lives in localStorage and survives without it.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const KEY = 'scoresphere.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const listeners = new Set<() => void>();

const systemQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    if (PREFERENCES.includes(stored as ThemePreference)) return stored as ThemePreference;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); use the default.
  }
  return 'light';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function currentTheme(): Theme {
  return resolveTheme(readThemePreference(), systemQuery()?.matches ?? false);
}

function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = currentTheme();
  for (const listener of listeners) listener();
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // Not saved, but still applied for this visit.
  }
  apply();
}

/** Applies the saved theme before the first render, and follows the phone when asked to. */
export function initTheme() {
  apply();
  systemQuery()?.addEventListener('change', () => {
    if (readThemePreference() === 'system') apply();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, () => 'light');
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}
