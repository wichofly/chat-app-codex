import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';
import { HttpError } from './errors.js';

// This header is always overwritten here before Better Auth or the limiter sees it.
export const AUTH_CLIENT_IP_HEADER = 'x-thread-client-ip';
export const PROXY_SECRET_HEADER = 'x-thread-proxy-secret';

export function clientIp(config: Config): RequestHandler {
  const expected = config.TRUSTED_PROXY_SECRET
    ? createHash('sha256').update(config.TRUSTED_PROXY_SECRET).digest()
    : null;
  return (request, _response, next) => {
    const supplied = request.get(PROXY_SECRET_HEADER);
    const trusted =
      expected !== null && supplied !== undefined &&
      timingSafeEqual(expected, createHash('sha256').update(supplied).digest());
    if (expected && !trusted && !['/health', '/ready'].includes(request.path))
      throw new HttpError(403, 'UNTRUSTED_PROXY', 'Use the application URL to access this API.');
    const address = trusted
      // Vercel replaces caller-supplied X-Forwarded-For; Render appends its proxy hops.
      // Only a verified Vercel request may use that first visitor address.
      ? request.get('x-forwarded-for')?.split(',')[0]?.trim()
      : request.socket.remoteAddress;
    if (!address || !isIP(address)) {
      console.warn('Invalid client IP metadata', {
        source: trusted ? 'verified-proxy' : 'connection',
        present: !!address,
        valueCount: address ? address.split(',').length : 0,
        quoted: address?.startsWith('"') ?? false,
        bracketed: address?.startsWith('[') ?? false,
      });
      throw new HttpError(
        400,
        'INVALID_CLIENT_IP',
        'Unable to determine the request address.',
      );
    }
    request.headers[AUTH_CLIENT_IP_HEADER] = address;
    next();
  };
}
