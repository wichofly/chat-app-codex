import type { Database } from './prisma.js';

export function createReadinessProbe(database: Database) {
  let inFlight: Promise<void> | undefined;
  return async () => {
    // Reuse a stalled query so repeated health checks cannot exhaust the pool.
    const query = (inFlight ??= Promise.resolve()
      .then(() => database.$queryRaw`SELECT 1`)
      .then(() => {})
      .finally(() => {
        inFlight = undefined;
      }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        query,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Readiness timeout')),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
