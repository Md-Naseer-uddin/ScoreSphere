import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { logout } from '@/features/auth/auth-api';
import { AvatarSection } from './AvatarSection';
import { DevicesCard } from './DevicesCard';
import { getMe, profileKeys } from './profile-api';
import { ProfileDetailsCard } from './ProfileDetailsCard';
import { SecurityCard } from './SecurityCard';

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me, isPending, isError } = useQuery({ queryKey: profileKeys.me, queryFn: getMe });

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError || !me)
    return <p className="py-10 text-center text-muted-foreground">{t('errors.generic')}</p>;

  return (
    <section className="space-y-4">
      <h1 className="sr-only">{t('profile.title')}</h1>
      <AvatarSection me={me} />
      <ProfileDetailsCard me={me} />
      <SecurityCard me={me} />
      <DevicesCard />
      <Button
        variant="outline"
        className="w-full"
        onClick={() => void logout().then(() => navigate('/auth/login', { replace: true }))}
      >
        <LogOut aria-hidden /> {t('auth.signOut')}
      </Button>
    </section>
  );
}
