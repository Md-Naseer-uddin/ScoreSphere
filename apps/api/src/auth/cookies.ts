import type { CookieOptions, Response } from 'express';

/** Web refresh token: httpOnly, same-site strict, scoped to the auth routes (ADR 0020). */
export const REFRESH_COOKIE = 'ss_rt';

function options(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...options(secure), expires });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, options(secure));
}
