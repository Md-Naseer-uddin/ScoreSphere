import { Building2, Check, ChevronDown, Plus, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentWorkspace, useWorkspaces, useWorkspaceSelection } from './current-workspace';
import { useWorkspaceName } from './labels';

/** Shows which workspace new records belong to, and switches between them (spec frontend §5). */
export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = useWorkspaceName();
  const { data: workspaces = [] } = useWorkspaces();
  const current = useCurrentWorkspace();
  const select = useWorkspaceSelection((s) => s.select);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="-ml-2 max-w-[70vw] gap-1 px-2 text-base font-semibold">
          <span className="truncate">{current ? name(current) : t('app.name')}</span>
          <ChevronDown aria-hidden className="text-muted-foreground" />
          <span className="sr-only">{t('workspaces.switch')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('workspaces.title')}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => select(w.id)}>
            {w.type === 'PERSONAL' ? <User aria-hidden /> : <Building2 aria-hidden />}
            <span className="flex-1 truncate">{name(w)}</span>
            {w.id === current?.id && <Check aria-label={t('workspaces.current')} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {current?.type === 'ORGANIZATION' && (
          <DropdownMenuItem onSelect={() => void navigate(`/app/workspaces/${current.id}`)}>
            <Settings aria-hidden /> {t('workspaces.settings')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void navigate('/app/workspaces/new')}>
          <Plus aria-hidden /> {t('workspaces.newOrganization')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
