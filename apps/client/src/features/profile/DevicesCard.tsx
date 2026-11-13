import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listDevices, profileKeys, revokeDevice } from './profile-api';

export function DevicesCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: devices, isPending } = useQuery({
    queryKey: profileKeys.devices,
    queryFn: listDevices,
  });
  const revoke = useMutation({
    mutationFn: revokeDevice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.devices }),
  });
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('profile.devices')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="divide-y">
            {devices?.map((device) => (
              <li key={device.id} className="flex items-center gap-3 py-3">
                {device.platform === 'ANDROID' ? (
                  <Smartphone aria-hidden className="size-5 text-muted-foreground" />
                ) : (
                  <Globe aria-hidden className="size-5 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`profile.platform.${device.platform}`)}</p>
                  {device.lastSeenAt && (
                    <p className="text-sm text-muted-foreground">
                      {t('profile.lastSeen', { date: format.format(new Date(device.lastSeenAt)) })}
                    </p>
                  )}
                </div>
                {device.current ? (
                  <Badge variant="secondary">{t('profile.thisDevice')}</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(device.id)}
                  >
                    {t('auth.signOut')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
