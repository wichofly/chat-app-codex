import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../lib/prisma.js';
import { createReadinessProbe } from '../lib/readiness.js';

const database = createPrisma('postgresql://test:unused@127.0.0.1:1/test');
afterAll(() => database.$disconnect());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('database readiness deadline', () => {
  it('times out stalled probes, shares the in-flight query and recovers when it completes', async () => {
    vi.useFakeTimers();
    let resume: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { resume = resolve; });
    const query = vi.spyOn(database, '$queryRaw').mockResolvedValue(pending);
    const check = createReadinessProbe(database);
    const outcomes = Promise.allSettled([check(), check()]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await outcomes).toMatchObject([
      { status: 'rejected', reason: { message: 'Readiness timeout' } },
      { status: 'rejected', reason: { message: 'Readiness timeout' } },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    const recovering = check();
    resume?.();
    await recovering;
    await check();
    expect(query).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
