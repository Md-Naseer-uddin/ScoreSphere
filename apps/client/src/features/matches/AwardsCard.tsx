import { type AwardRecord, hasRole, type SportKey } from '@scoresphere/contracts';
import { matchAwardDefinitions, getEngine } from '@scoresphere/sports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaces } from '@/features/workspaces/current-workspace';
import type { SideView } from './hooks';
import type { AnyProjection } from './local-store';
import { listAwards, matchKeys, revertAward, selectAward } from './matches-api';

interface Props {
  matchId: string;
  sport: SportKey;
  engineVersion: number;
  workspaceId: string | null;
  projection: AnyProjection;
  sides: SideView[];
  /** Read awards from the server (synced match, online, signed in). */
  fromServer: boolean;
}

/** Awards computed on this device, before the match has synced (or for spectators). */
function provisional(
  sport: SportKey,
  engineVersion: number,
  projection: AnyProjection,
  sides: SideView[],
): AwardRecord[] {
  const engine = getEngine(sport, engineVersion);
  if (!engine || projection.status !== 'completed') return [];
  const stats = engine.stats(projection.state);
  const names = new Map(
    sides.flatMap((s) => s.participants.map((p) => [p.participantId, p.displayName])),
  );
  return matchAwardDefinitions(sport, engineVersion).flatMap((definition) => {
    const result = definition.compute(projection.state, stats);
    if (!result) return [];
    return [
      {
        id: definition.key,
        awardKey: definition.key,
        name: definition.name,
        criteria: definition.criteria,
        criteriaVersion: definition.criteriaVersion,
        status: 'PUBLISHED' as const,
        provenance: 'AUTO' as const,
        recipients: result.recipients.map((r) => ({
          participantId: r.participantId,
          side: r.side as 0 | 1,
          displayName: names.get(r.participantId) ?? '?',
        })),
        metrics: result.metrics,
        reason: null,
        publishedAt: new Date().toISOString(),
      },
    ];
  });
}

/** Match awards (ADR 0023): who won them, why, and organizer overrides with a reason. */
export function AwardsCard({
  matchId,
  sport,
  engineVersion,
  workspaceId,
  projection,
  sides,
  fromServer,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: workspaces } = useWorkspaces();
  const role = workspaces?.find((w) => w.id === workspaceId)?.role;
  const canManage = fromServer && role !== undefined && hasRole(role, 'ADMIN');
  const server = useQuery({
    queryKey: matchKeys.awards(matchId),
    queryFn: () => listAwards(matchId),
    enabled: fromServer && projection.status === 'completed',
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const onDone = (records: AwardRecord[]) => {
    queryClient.setQueryData(matchKeys.awards(matchId), records);
    setEditing(null);
  };
  const choose = useMutation({
    mutationFn: (key: string) => selectAward(matchId, key, chosen, reason.trim() || null),
    onSuccess: (records) => {
      onDone(records);
      toast.success(t('awards.saved'));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });
  const revert = useMutation({
    mutationFn: (key: string) => revertAward(matchId, key),
    onSuccess: onDone,
  });

  if (projection.status !== 'completed') return null;
  const definitions = matchAwardDefinitions(sport, engineVersion);
  if (definitions.length === 0) return null;
  const records = fromServer
    ? (server.data ?? [])
    : provisional(sport, engineVersion, projection, sides);
  const players = sides.flatMap((s) => s.participants);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award aria-hidden className="size-4" /> {t('awards.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!fromServer && <p className="text-xs text-muted-foreground">{t('awards.provisional')}</p>}
        {definitions.map((definition) => {
          const record = records.find((r) => r.awardKey === definition.key);
          return (
            <div
              key={definition.key}
              className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0"
              data-testid={`award-${definition.key}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{definition.name}</p>
                {record && record.provenance !== 'AUTO' && (
                  <Badge variant="secondary">{t('awards.byOrganizer')}</Badge>
                )}
                {record?.status === 'STALE' && (
                  <Badge variant="destructive">{t('awards.stale')}</Badge>
                )}
              </div>
              <p className="text-sm">
                {record
                  ? record.recipients.map((r) => r.displayName).join(' & ')
                  : t('awards.none')}
              </p>
              {record && Object.keys(record.metrics).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {Object.entries(record.metrics)
                    .map(([k, v]) => `${t(`awards.metric.${k}`, { defaultValue: k })}: ${v}`)
                    .join(' · ')}
                </p>
              )}
              {record?.reason && (
                <p className="text-xs text-muted-foreground">
                  {t('awards.reason', { reason: record.reason })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{definition.criteria}</p>
              {canManage && editing !== definition.key && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(definition.key);
                      setChosen(record?.recipients.map((r) => r.participantId) ?? []);
                      setReason('');
                    }}
                  >
                    {t('awards.choose')}
                  </Button>
                  {record && record.provenance !== 'AUTO' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revert.isPending}
                      onClick={() => revert.mutate(definition.key)}
                    >
                      {t('awards.useAutomatic')}
                    </Button>
                  )}
                </div>
              )}
              {canManage && editing === definition.key && (
                <div className="space-y-3 rounded-lg border p-3">
                  <fieldset className="space-y-1">
                    <legend className="text-sm font-medium">{t('awards.recipients')}</legend>
                    {players.map((p) => (
                      <label key={p.participantId} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={chosen.includes(p.participantId)}
                          onChange={(e) =>
                            setChosen((c) =>
                              e.target.checked
                                ? [...c, p.participantId]
                                : c.filter((x) => x !== p.participantId),
                            )
                          }
                        />
                        {p.displayName}
                      </label>
                    ))}
                  </fieldset>
                  <div className="space-y-1">
                    <Label htmlFor={`reason-${definition.key}`}>{t('awards.reasonLabel')}</Label>
                    <Input
                      id={`reason-${definition.key}`}
                      maxLength={200}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={chosen.length === 0 || choose.isPending}
                      onClick={() => choose.mutate(definition.key)}
                    >
                      {t('common.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
