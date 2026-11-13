import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, ok } from '@/test/fetch-mock';
import { renderApp } from '@/test/render';
import { signIn, signOut } from '@/test/session';

const personal = {
  id: '01a1d66d-0000-7000-8000-0000000000aa',
  type: 'PERSONAL',
  name: 'Personal',
  role: 'OWNER',
};

afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

describe('routes', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', async () => {
    signOut();
    const router = renderApp('/app/sports');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/auth/login');
    expect(router.state.location.search).toBe('?next=%2Fapp%2Fsports');
  });

  it('redirects / to the app home', async () => {
    signIn();
    mockApi({ 'GET /workspaces': ok([personal]) });
    const router = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Ready to score' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('shows the current workspace and the five bottom-navigation destinations', async () => {
    signIn();
    mockApi({ 'GET /workspaces': ok([personal]) });
    renderApp('/app');
    expect(await screen.findByRole('button', { name: /Personal/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Sports', 'Matches', 'Teams', 'Profile']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('lists all 12 sports', async () => {
    signIn();
    mockApi({ 'GET /workspaces': ok([personal]) });
    renderApp('/app/sports');
    await screen.findByRole('heading', { name: 'Sports' });
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('main'))).toHaveLength(12);
    expect(screen.getByText('Kho-Kho')).toBeInTheDocument();
  });

  it('renders a not-found page for unknown paths', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
