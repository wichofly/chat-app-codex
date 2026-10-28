import { createAuthClient } from 'better-auth/react';

export function createThreadAuthClient() {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
    /\/$/,
    '',
  );
  return createAuthClient({
    baseURL: new URL(`${apiBase}/auth`, window.location.origin).href,
    fetchOptions: { credentials: 'include', retry: 0 },
  });
}
