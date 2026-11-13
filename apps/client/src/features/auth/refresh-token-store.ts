import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isNative } from '@/lib/platform';

const KEY = 'refresh_token';

/**
 * Where the refresh token lives (ADR 0020). Android keeps it in Keystore-backed secure
 * storage; the web never sees it, because it travels in an httpOnly cookie.
 */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const nativeStore: RefreshTokenStore = {
  async get() {
    const value = await SecureStorage.get(KEY);
    return typeof value === 'string' ? value : null;
  },
  set: (token) => SecureStorage.set(KEY, token),
  async clear() {
    await SecureStorage.remove(KEY);
  },
};

const webStore: RefreshTokenStore = {
  get: async () => null,
  set: async () => undefined,
  clear: async () => undefined,
};

export const refreshTokenStore: RefreshTokenStore = isNative() ? nativeStore : webStore;
