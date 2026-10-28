import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from '../lib/auth.js';

export function requireSession(auth: Auth): RequestHandler {
  return async (request, response, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      response.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Please sign in to continue.',
        },
      });
      return;
    }
    response.locals.userId = session.user.id;
    next();
  };
}
