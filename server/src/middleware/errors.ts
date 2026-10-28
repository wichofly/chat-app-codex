import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof HttpError) {
    response
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (
    error instanceof ZodError ||
    (error instanceof SyntaxError && 'status' in error && error.status === 400)
  ) {
    response
      .status(400)
      .json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Please check the submitted information.',
        },
      });
    return;
  }
  console.error(
    'Request failed',
    error instanceof Error ? error.name : 'UnknownError',
  );
  response
    .status(500)
    .json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    });
};
