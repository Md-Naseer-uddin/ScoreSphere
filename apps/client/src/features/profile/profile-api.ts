import {
  deviceSchema,
  meSchema,
  recoveryCodeResponseSchema,
  type UpdateMeRequest,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { apiFetch, json } from '@/lib/api';

export const profileKeys = { me: ['me'] as const, devices: ['me', 'devices'] as const };

export const getMe = () => apiFetch('/me', {}, meSchema);

export const updateMe = (patch: UpdateMeRequest) =>
  apiFetch('/me', { method: 'PATCH', ...json(patch) }, meSchema);

export const uploadAvatar = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch('/me/avatar', { method: 'PUT', body }, meSchema);
};

export const removeAvatar = () => apiFetch('/me/avatar', { method: 'DELETE' }, meSchema);

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<void>('/me/password', { method: 'POST', ...json({ currentPassword, newPassword }) });

export const changePhone = (currentPassword: string, newPhone: string) =>
  apiFetch('/me/phone', { method: 'POST', ...json({ currentPassword, newPhone }) }, meSchema);

export const regenerateRecoveryCode = (currentPassword: string) =>
  apiFetch(
    '/me/recovery-code',
    { method: 'POST', ...json({ currentPassword }) },
    recoveryCodeResponseSchema,
  );

export const listDevices = () => apiFetch('/me/devices', {}, z.array(deviceSchema));

export const revokeDevice = (id: string) =>
  apiFetch<void>(`/me/devices/${id}`, { method: 'DELETE' });
