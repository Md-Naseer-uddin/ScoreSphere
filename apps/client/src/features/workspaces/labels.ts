import type { WorkspaceRole } from '@scoresphere/contracts';
import { useTranslation } from 'react-i18next';

/** The personal workspace is stored as "Personal" and shown in the user's language. */
export function useWorkspaceName() {
  const { t } = useTranslation();
  return (w: { type: 'PERSONAL' | 'ORGANIZATION'; name: string }) =>
    w.type === 'PERSONAL' ? t('workspaces.personal') : w.name;
}

export function useRoleLabel() {
  const { t } = useTranslation();
  return (role: WorkspaceRole) => t(`roles.${role}`);
}
