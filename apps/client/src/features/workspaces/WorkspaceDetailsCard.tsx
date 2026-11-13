import { zodResolver } from '@hookform/resolvers/zod';
import { updateWorkspaceRequestSchema, type WorkspaceDetail } from '@scoresphere/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { updateWorkspace, workspaceKeys } from './workspaces-api';

const schema = z.object({
  name: z.string().trim().min(2, 'TOO_SHORT').max(120, 'TOO_LONG'),
  description: z.string().trim().max(500, 'TOO_LONG'),
  contactEmail: z.union([z.literal(''), z.email('INVALID_EMAIL')]),
});

export function WorkspaceDetailsCard({
  workspace,
  editable,
}: {
  workspace: WorkspaceDetail;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: workspace.name,
      description: workspace.organization?.description ?? '',
      contactEmail: workspace.organization?.contactEmail ?? '',
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const patch = updateWorkspaceRequestSchema.parse({
        name: values.name,
        description: values.description || null,
        contactEmail: values.contactEmail || null,
      });
      const updated = await updateWorkspace(workspace.id, patch);
      queryClient.setQueryData(workspaceKeys.detail(workspace.id), updated);
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
      form.reset(values);
      toast.success(t('common.saved'));
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ['name', 'description', 'contactEmail']) || null,
      );
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('workspaces.details')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <fieldset disabled={!editable} className="space-y-4">
            <Field id="ws-name" label={t('workspaces.name')} error={errors.name?.message}>
              <Input {...describedBy('ws-name', errors.name?.message)} {...form.register('name')} />
            </Field>
            <Field
              id="ws-description"
              label={t('workspaces.description')}
              error={errors.description?.message}
            >
              <Input
                {...describedBy('ws-description', errors.description?.message)}
                {...form.register('description')}
              />
            </Field>
            <Field
              id="ws-email"
              label={t('workspaces.contactEmail')}
              error={errors.contactEmail?.message}
            >
              <Input
                type="email"
                {...describedBy('ws-email', errors.contactEmail?.message)}
                {...form.register('contactEmail')}
              />
            </Field>
          </fieldset>
          {editable && (
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {t('common.save')}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
