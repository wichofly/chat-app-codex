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
    const address = trusted
      ? request.get('x-real-ip')?.trim()
      : request.ip || request.socket.remoteAddress;
    if (!address || !isIP(address))
      throw new HttpError(
        400,
        'INVALID_CLIENT_IP',
        'Unable to determine the request address.',
      );
    request.headers[AUTH_CLIENT_IP_HEADER] = address;
    next();
  };
}
