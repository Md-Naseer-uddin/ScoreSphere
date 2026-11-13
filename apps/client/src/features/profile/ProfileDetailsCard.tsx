import { zodResolver } from '@hookform/resolvers/zod';
import type { Me } from '@scoresphere/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { profileKeys, updateMe } from './profile-api';

const schema = z.object({
  displayName: z.string().trim().min(1, 'REQUIRED').max(100, 'TOO_LONG'),
  fullName: z.string().trim().max(150, 'TOO_LONG'),
  city: z.string().trim().max(100, 'TOO_LONG'),
  bio: z.string().trim().max(500, 'TOO_LONG'),
});

export function ProfileDetailsCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: me.displayName,
      fullName: me.fullName ?? '',
      city: me.city ?? '',
      bio: me.bio ?? '',
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKeys.me, updated);
      toast.success(t('common.saved'));
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync(values);
    form.reset(values);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('profile.details')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field id="displayName" label={t('auth.displayName')} error={errors.displayName?.message}>
            <Input
              {...describedBy('displayName', errors.displayName?.message)}
              {...form.register('displayName')}
            />
          </Field>
          <Field id="fullName" label={t('profile.fullName')} error={errors.fullName?.message}>
            <Input
              autoComplete="name"
              {...describedBy('fullName', errors.fullName?.message)}
              {...form.register('fullName')}
            />
          </Field>
          <Field id="city" label={t('profile.city')} error={errors.city?.message}>
            <Input
              autoComplete="address-level2"
              {...describedBy('city', errors.city?.message)}
              {...form.register('city')}
            />
          </Field>
          <Field id="bio" label={t('profile.bio')} error={errors.bio?.message}>
            <textarea
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              {...describedBy('bio', errors.bio?.message)}
              {...form.register('bio')}
            />
          </Field>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {t('common.save')}
          </Button>
        </form>

        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="discoverable">{t('profile.discoverable')}</Label>
            <p className="text-sm text-muted-foreground">{t('profile.discoverableBody')}</p>
          </div>
          <Switch
            id="discoverable"
            checked={me.discoverableByPhone}
            disabled={save.isPending}
            onCheckedChange={(value) => save.mutate({ discoverableByPhone: value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
