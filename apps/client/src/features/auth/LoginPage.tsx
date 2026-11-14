import { zodResolver } from '@hookform/resolvers/zod';
import { phoneSchema } from '@scoresphere/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { PasswordInput } from '@/components/form/PasswordInput';
import { PhoneInput } from '@/components/form/PhoneInput';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { login, safeNext } from './auth-api';
import { useSession } from './session';

const schema = z.object({ phone: phoneSchema, password: z.string().min(1, 'REQUIRED') });

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useSession((s) => s.status);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      void navigate(next, { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ['phone', 'password']) || null);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('auth.loginTitle')}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError ?? errors.root?.message ?? null} />
          <Field id="phone" label={t('auth.phone')} error={errors.phone?.message}>
            <PhoneInput
              {...describedBy('phone', errors.phone?.message)}
              {...form.register('phone')}
            />
          </Field>
          <Field id="password" label={t('auth.password')} error={errors.password?.message}>
            <PasswordInput
              autoComplete="current-password"
              {...describedBy('password', errors.password?.message)}
              {...form.register('password')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('auth.signIn')}
          </Button>
          <div className="flex justify-between text-sm">
            <Link to="/auth/forgot-password" className="text-primary underline underline-offset-4">
              {t('auth.forgotPassword')}
            </Link>
            <Link
              to={`/auth/register?next=${encodeURIComponent(next)}`}
              className="text-primary underline underline-offset-4"
            >
              {t('auth.createAccount')}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
