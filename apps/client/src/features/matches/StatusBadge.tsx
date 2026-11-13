import type { MatchStatus } from '@scoresphere/contracts';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: MatchStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={status === 'live' ? 'default' : status === 'abandoned' ? 'destructive' : 'secondary'}
    >
      {t(`matches.status.${status}`)}
    </Badge>
  );
}
