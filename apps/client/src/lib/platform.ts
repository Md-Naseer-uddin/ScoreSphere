import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();

export const clientPlatform = (): 'WEB' | 'ANDROID' =>
  Capacitor.getPlatform() === 'android' ? 'ANDROID' : 'WEB';

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
