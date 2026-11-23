import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { setThemePreference, type ThemePreference, useThemePreference } from '@/lib/theme';

/** Light (best outdoors), dark, or follow the phone. Saved on this device only. */
export function AppearanceCard() {
  const { t } = useTranslation();
  const preference = useThemePreference();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.appearance.title')}</CardTitle>
        <CardDescription>{t('profile.appearance.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChoiceGroup<ThemePreference>
          label={t('profile.appearance.title')}
          value={preference}
          onChange={setThemePreference}
          columns={1}
          choices={[
            {
              value: 'light',
              label: t('profile.appearance.light'),
              hint: t('profile.appearance.lightHint'),
            },
            { value: 'dark', label: t('profile.appearance.dark') },
            { value: 'system', label: t('profile.appearance.system') },
          ]}
        />
      </CardContent>
    </Card>
  );
}
