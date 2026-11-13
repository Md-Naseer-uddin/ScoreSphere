import { House, ListOrdered, Trophy, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { WorkspaceSwitcher } from '@/features/workspaces/WorkspaceSwitcher';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/app', key: 'home', icon: House, end: true },
  { to: '/app/sports', key: 'sports', icon: Trophy, end: false },
  { to: '/app/matches', key: 'matches', icon: ListOrdered, end: false },
  { to: '/app/teams', key: 'teams', icon: Users, end: false },
  { to: '/app/profile', key: 'profile', icon: User, end: false },
] as const;

/** Mobile-first frame: top bar, scrollable content, thumb-reachable bottom navigation. */
export function AppShell() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="py-2">
          <WorkspaceSwitcher />
        </div>
        {!online && (
          <span
            role="status"
            className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
          >
            {t('app.offline')}
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="sticky bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <li key={key}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs',
                    isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon aria-hidden className="size-5" />
                {t(`nav.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
