import { Outlet } from 'react-router';
import { useMatchSync } from '@/features/matches/sync-worker';
import { useReferenceSync } from '@/features/sync/reference-sync';

/** Background work for every signed-in screen: reference data down, scoring events up. */
export function SignedInRoot() {
  useReferenceSync();
  useMatchSync();
  return <Outlet />;
}
