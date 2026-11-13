import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationRequestSchema } from '@scoresphere/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useWorkspaceSelection } from './current-workspace';
import { createOrganization, workspaceKeys } from './workspaces-api';

const schema = createOrganizationRequestSchema.pick({ name: true, description: true });

export function CreateOrganizationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const select = useWorkspaceSelection((s) => s.select);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const workspace = await createOrganization({
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      select(workspace.id);
      void navigate(`/app/workspaces/${workspace.id}`, { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ['name', 'description']) || null);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('workspaces.newOrganization')}</h1>
        </CardTitle>
        <CardDescription>{t('workspaces.newOrganizationBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field id="name" label={t('workspaces.name')} error={errors.name?.message}>
            <Input {...describedBy('name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <Field
            id="description"
            label={t('workspaces.description')}
            error={errors.description?.message}
          >
            <Input
              {...describedBy('description', errors.description?.message)}
              {...form.register('description')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('workspaces.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
