import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export const isNative = (): boolean => Capacitor.isNativePlatform();

export const clientPlatform = (): 'WEB' | 'ANDROID' =>
  Capacitor.getPlatform() === 'android' ? 'ANDROID' : 'WEB';

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Opens the system share sheet where there is one, else copies the link. */
export async function shareText(text: string, url: string): Promise<'shared' | 'copied'> {
  if (isNative()) {
    await Share.share({ text, url });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ text, url }).catch(() => undefined);
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
