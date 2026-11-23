import { afterEach, describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme, setThemePreference } from './theme';

describe('theme', () => {
  afterEach(() => localStorage.clear());

  it('defaults to the light, outdoor theme', () => {
    expect(readThemePreference()).toBe('light');
  });

  it('remembers the choice and applies it to the page', () => {
    setThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('scoresphere.theme', 'neon');
    expect(readThemePreference()).toBe('light');
  });

  it('follows the phone only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
