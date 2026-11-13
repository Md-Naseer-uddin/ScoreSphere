import { useSession } from '@/features/auth/session';

export const TEST_USER = { id: '01a1d66d-0000-7000-8000-000000000001', displayName: 'Asha' };

export function signIn(): void {
  useSession.setState({
    status: 'authenticated',
    accessToken: 'test-access-token',
    user: TEST_USER,
  });
}

export function signOut(): void {
  useSession.setState({ status: 'anonymous', accessToken: null, user: null });
}
