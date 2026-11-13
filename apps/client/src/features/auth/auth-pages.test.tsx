import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, mockApi, ok } from '@/test/fetch-mock';
import { renderApp } from '@/test/render';
import { signOut } from '@/test/session';
import { safeNext } from './auth-api';

const session = {
  accessToken: 'a',
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  user: { id: '01a1d66d-0000-7000-8000-000000000001', displayName: 'Asha' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

describe('safeNext', () => {
  it.each([
    ['/app/teams', '/app/teams'],
    ['//evil.example', '/app'],
    ['https://evil.example', '/app'],
    [null, '/app'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('sign in', () => {
  it('validates the phone number before calling the API', async () => {
    signOut();
    const { calls } = mockApi({});
    renderApp('/auth/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mobile number'), '12345');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a 10-digit Indian mobile number.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/auth/'))).toEqual([]);
  });

  it('shows a wrong-password error from the server', async () => {
    signOut();
    mockApi({
      'POST /auth/login': fail(401, 'UNAUTHENTICATED', [
        { field: 'credentials', code: 'INVALID_CREDENTIALS' },
      ]),
    });
    renderApp('/auth/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Mobile number or password is incorrect.')).toBeInTheDocument();
  });

  it('signs in and continues to the requested page', async () => {
    signOut();
    const { calls } = mockApi({
      'POST /auth/login': ok(session),
      'GET /workspaces': ok([]),
      'GET /sync/reference': ok({
        cursor: new Date().toISOString(),
        workspaces: [],
        teams: [],
        teamMembers: [],
        rosterMembers: [],
      }),
    });
    const router = renderApp('/auth/login?next=%2Fapp%2Fsports');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mobile number'), '98765 43210');
    await user.type(screen.getByLabelText('Password'), 'correct password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/sports'));
    const body = JSON.parse(String(calls.find((c) => c.path === '/auth/login')!.init.body));
    expect(body).toMatchObject({ phone: '+919876543210', device: { platform: 'WEB' } });
  });
});

describe('register', () => {
  it('requires the 18+ confirmation', async () => {
    signOut();
    const { calls } = mockApi({});
    renderApp('/auth/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('You must be 18 or older to create an account.'),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/auth/'))).toEqual([]);
  });

  it('creates the account and shows the recovery code once', async () => {
    signOut();
    mockApi({ 'POST /auth/register': ok({ ...session, recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }) });
    const router = renderApp('/auth/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.click(screen.getByLabelText('I confirm I am 18 or older.'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('ABCD-EFGH-JKMN-PQRS')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/auth/recovery-code');
    expect(router.state.location.search).not.toContain('ABCD');
    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(proceed).toBeDisabled();
    await user.click(screen.getByLabelText("I've saved my recovery code somewhere safe."));
    expect(proceed).toBeEnabled();
  });

  it('points to sign-in when the number is already registered', async () => {
    signOut();
    mockApi({
      'POST /auth/register': fail(409, 'CONFLICT', [{ field: 'phone', code: 'PHONE_TAKEN' }]),
    });
    renderApp('/auth/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.click(screen.getByLabelText('I confirm I am 18 or older.'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('This number is already registered. Sign in instead.'),
    ).toBeInTheDocument();
  });
});
