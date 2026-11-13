import { zodResolver } from '@hookform/resolvers/zod';
import { type Me, passwordSchema, phoneSchema } from '@scoresphere/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LifeBuoy, Smartphone } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { PasswordInput } from '@/components/form/PasswordInput';
import { PhoneInput } from '@/components/form/PhoneInput';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { changePassword, changePhone, profileKeys, regenerateRecoveryCode } from './profile-api';

const current = z.string().min(1, 'REQUIRED');

export function SecurityCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('profile.security')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <PasswordDialog
          trigger={
            <SecurityButton icon={<KeyRound aria-hidden />} label={t('profile.changePassword')} />
          }
        />
        <PhoneDialog
          me={me}
          trigger={
            <SecurityButton icon={<Smartphone aria-hidden />} label={t('profile.changePhone')} />
          }
        />
        <RecoveryDialog
          trigger={
            <SecurityButton icon={<LifeBuoy aria-hidden />} label={t('profile.newRecoveryCode')} />
          }
        />
      </CardContent>
    </Card>
  );
}

function SecurityButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Button variant="outline" className="justify-start">
      {icon} {label}
    </Button>
  );
}

function PasswordDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = z.object({ currentPassword: current, newPassword: passwordSchema });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success(t('profile.passwordChanged'));
      form.reset();
      setOpen(false);
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ['currentPassword', 'newPassword']) || null,
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('profile.changePassword')}</DialogTitle>
          <DialogDescription>{t('profile.changePasswordBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field
            id="pw-current"
            label={t('profile.currentPassword')}
            error={errors.currentPassword?.message}
          >
            <PasswordInput
              autoComplete="current-password"
              {...describedBy('pw-current', errors.currentPassword?.message)}
              {...form.register('currentPassword')}
            />
          </Field>
          <Field id="pw-new" label={t('auth.newPassword')} error={errors.newPassword?.message}>
            <PasswordInput
              autoComplete="new-password"
              {...describedBy('pw-new', errors.newPassword?.message)}
              {...form.register('newPassword')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhoneDialog({ me, trigger }: { me: Me; trigger: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = z.object({ currentPassword: current, newPhone: phoneSchema });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPhone: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPhone }) => {
    setFormError(null);
    try {
      queryClient.setQueryData(profileKeys.me, await changePhone(currentPassword, newPhone));
      toast.success(t('profile.phoneChanged'));
      form.reset();
      setOpen(false);
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ['currentPassword', 'newPhone']) || null,
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('profile.changePhone')}</DialogTitle>
          <DialogDescription>
            {t('profile.changePhoneBody', { phone: me.phoneMasked })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field id="phone-new" label={t('profile.newPhone')} error={errors.newPhone?.message}>
            <PhoneInput
              {...describedBy('phone-new', errors.newPhone?.message)}
              {...form.register('newPhone')}
            />
          </Field>
          <Field
            id="phone-pw"
            label={t('profile.currentPassword')}
            error={errors.currentPassword?.message}
          >
            <PasswordInput
              autoComplete="current-password"
              {...describedBy('phone-pw', errors.currentPassword?.message)}
              {...form.register('currentPassword')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = z.object({ currentPassword: current });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword }) => {
    setFormError(null);
    try {
      const { recoveryCode } = await regenerateRecoveryCode(currentPassword);
      setOpen(false);
      void navigate('/auth/recovery-code', {
        state: { recoveryCode, next: '/app/profile', context: 'regenerate' },
      });
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ['currentPassword']) || null);
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('profile.newRecoveryCode')}</DialogTitle>
          <DialogDescription>{t('profile.newRecoveryCodeBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field
            id="rc-pw"
            label={t('profile.currentPassword')}
            error={errors.currentPassword?.message}
          >
            <PasswordInput
              autoComplete="current-password"
              {...describedBy('rc-pw', errors.currentPassword?.message)}
              {...form.register('currentPassword')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('profile.generate')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
