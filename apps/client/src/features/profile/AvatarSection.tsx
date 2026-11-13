import type { Me } from '@scoresphere/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useErrorText } from '@/components/form/Field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { initials } from '@/features/workspaces/MembersCard';
import { ApiClientError, mediaUrl } from '@/lib/api';
import { profileKeys, removeAvatar, uploadAvatar } from './profile-api';

const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarSection({ me }: { me: Me }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const onDone = (updated: Me) => queryClient.setQueryData(profileKeys.me, updated);
  const onError = (error: unknown) =>
    toast.error(
      errorText(
        error instanceof ApiClientError ? (error.details[0]?.code ?? error.code) : 'generic',
      ),
    );

  const upload = useMutation({ mutationFn: uploadAvatar, onSuccess: onDone, onError });
  const remove = useMutation({ mutationFn: removeAvatar, onSuccess: onDone, onError });

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20 text-xl">
        <AvatarImage src={mediaUrl(me.avatarUrl)} alt="" />
        <AvatarFallback>{initials(me.displayName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-xl font-semibold">{me.displayName}</p>
        <p className="text-sm text-muted-foreground">{me.phoneMasked}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <Camera aria-hidden />{' '}
            {upload.isPending ? t('profile.uploading') : t('profile.changePhoto')}
          </Button>
          {me.avatarUrl && (
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('profile.removePhoto')}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label={t('profile.changePhoto')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > MAX_BYTES) {
              toast.error(t('errors.FILE_TOO_LARGE'));
              return;
            }
            upload.mutate(file);
          }}
        />
      </div>
    </div>
  );
}
