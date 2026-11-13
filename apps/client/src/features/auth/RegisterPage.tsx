import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema } from '@scoresphere/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { describedBy, Field, useErrorText } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { PasswordInput } from '@/components/form/PasswordInput';
import { PhoneInput } from '@/components/form/PhoneInput';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { register, safeNext } from './auth-api';

const schema = registerRequestSchema.omit({ device: true });

export function RegisterPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      phone: '',
      password: '',
      adultConfirmed: false as unknown as true,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const recoveryCode = await register(values);
      // The code is shown once; it's passed in memory, never in the URL.
      void navigate('/auth/recovery-code', {
        replace: true,
        state: { recoveryCode, next, context: 'register' },
      });
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ['displayName', 'phone', 'password']) || null,
      );
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('auth.registerTitle')}</h1>
        </CardTitle>
        <CardDescription>{t('auth.registerBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field id="displayName" label={t('auth.displayName')} error={errors.displayName?.message}>
            <Input
              autoComplete="nickname"
              {...describedBy('displayName', errors.displayName?.message)}
              {...form.register('displayName')}
            />
          </Field>
          <Field id="phone" label={t('auth.phone')} error={errors.phone?.message}>
            <PhoneInput
              {...describedBy('phone', errors.phone?.message)}
              {...form.register('phone')}
            />
          </Field>
          <Field
            id="password"
            label={t('auth.password')}
            error={errors.password?.message}
            hint={t('auth.passwordHint')}
          >
            <PasswordInput
              autoComplete="new-password"
              {...describedBy('password', errors.password?.message, t('auth.passwordHint'))}
              {...form.register('password')}
            />
          </Field>
          <div className="space-y-1.5">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-primary"
                aria-invalid={errors.adultConfirmed ? true : undefined}
                {...form.register('adultConfirmed')}
              />
              <span>{t('auth.adultConfirm')}</span>
            </label>
            {errors.adultConfirmed && (
              <p role="alert" className="text-sm text-destructive">
                {errorText(errors.adultConfirmed.message)}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('auth.createAccount')}
          </Button>
          <p className="text-center text-sm">
            {t('auth.haveAccount')}{' '}
            <Link
              to={`/auth/login?next=${encodeURIComponent(next)}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t('auth.signIn')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
