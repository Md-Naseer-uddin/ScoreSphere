import { zodResolver } from '@hookform/resolvers/zod';
import { type SportKey } from '@scoresphere/contracts';
import { SPORTS } from '@scoresphere/sports';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { describedBy, Field } from '@/components/form/Field';
import { FormError } from '@/components/form/FormError';
import { applyServerErrors } from '@/components/form/server-errors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createTeam } from './teams-api';

const schema = z.object({
  name: z.string().trim().min(1, 'REQUIRED').max(80, 'TOO_LONG'),
  shortName: z.string().trim().max(12, 'TOO_LONG'),
});

export function CreateTeamDialog({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sports, setSports] = useState<SportKey[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', shortName: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const toggle = (key: SportKey) =>
    setSports((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const team = await createTeam(workspaceId, {
        name: values.name,
        shortName: values.shortName,
        sportKeys: sports,
      });
      setOpen(false);
      form.reset();
      setSports([]);
      void navigate(`/app/teams/${team.id}`);
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ['name', 'shortName']) || null);
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> {t('teams.newTeam')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teams.newTeam')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError code={formError} />
          <Field id="team-name" label={t('teams.name')} error={errors.name?.message}>
            <Input {...describedBy('team-name', errors.name?.message)} {...form.register('name')} />
          </Field>
          <Field
            id="team-short"
            label={t('teams.shortName')}
            error={errors.shortName?.message}
            hint={t('teams.shortNameHint')}
          >
            <Input
              maxLength={12}
              {...describedBy('team-short', errors.shortName?.message, t('teams.shortNameHint'))}
              {...form.register('shortName')}
            />
          </Field>
          <fieldset className="space-y-2">
            <Label asChild>
              <legend>{t('teams.sports')}</legend>
            </Label>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((sport) => {
                const selected = sports.includes(sport.key);
                return (
                  <button
                    key={sport.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(sport.key)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background',
                    )}
                  >
                    {sport.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {t('teams.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
