import { createAuthClient } from 'better-auth/react';
import { baseUrl } from './api';

export function createThreadAuthClient() {
  return createAuthClient({
    baseURL: new URL(`${baseUrl}/auth`, window.location.origin).href,
    fetchOptions: { credentials: 'include', retry: 0 },
  });
}
