import type { RosterLinkState } from '@scoresphere/contracts';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

/** Shows how a roster member relates to a real account; name-only members get no badge. */
export function LinkBadge({ link }: { link: RosterLinkState }) {
  const { t } = useTranslation();
  if (link === 'NONE') return null;
  return (
    <Badge variant={link === 'LINKED' ? 'secondary' : 'outline'} className="shrink-0">
      {t(`roster.link.${link}`)}
    </Badge>
  );
}
