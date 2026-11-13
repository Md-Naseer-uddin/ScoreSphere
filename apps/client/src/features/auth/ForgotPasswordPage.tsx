import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordRequestSchema } from '@scoresphere/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { PasswordInput } from '@/components/form/PasswordInput';
import { PhoneInput } from '@/components/form/PhoneInput';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resetPassword } from './auth-api';

const schema = resetPasswordRequestSchema;

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', recoveryCode: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const recoveryCode = await resetPassword(values);
      void navigate('/auth/recovery-code', {
        replace: true,
        state: { recoveryCode, next: '/auth/login', context: 'reset' },
      });
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ['phone', 'recoveryCode', 'newPassword']) || null,
      );
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('auth.resetTitle')}</h1>
        </CardTitle>
        <CardDescription>{t('auth.resetBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field id="phone" label={t('auth.phone')} error={errors.phone?.message}>
            <PhoneInput
              {...describedBy('phone', errors.phone?.message)}
              {...form.register('phone')}
            />
          </Field>
          <Field
            id="recoveryCode"
            label={t('auth.recoveryCode')}
            error={errors.recoveryCode?.message}
          >
            <Input
              autoComplete="one-time-code"
              autoCapitalize="characters"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="font-mono"
              {...describedBy('recoveryCode', errors.recoveryCode?.message)}
              {...form.register('recoveryCode')}
            />
          </Field>
          <Field id="newPassword" label={t('auth.newPassword')} error={errors.newPassword?.message}>
            <PasswordInput
              autoComplete="new-password"
              {...describedBy('newPassword', errors.newPassword?.message)}
              {...form.register('newPassword')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('auth.resetPassword')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">{t('auth.noRecoveryCode')}</p>
          <p className="text-center text-sm">
            <Link to="/auth/login" className="text-primary underline-offset-4 hover:underline">
              {t('auth.backToSignIn')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
