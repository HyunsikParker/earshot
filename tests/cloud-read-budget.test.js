import { afterEach, expect, it, vi } from 'vitest';
import { CLOUD_READS_PER_DAY, reserveHostedCloudRead } from '../src/ai/cloud-read-budget.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('limits reservations across calls and renews them at midnight UTC', async () => {
  const request = vi.fn(async (name, useLock) => useLock());
  vi.stubGlobal('navigator', { locks: { request } });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T23:59:59Z'));

  const attempts = await Promise.all(Array.from({ length: CLOUD_READS_PER_DAY + 2 }, reserveHostedCloudRead));
  expect(attempts.filter(Boolean)).toHaveLength(CLOUD_READS_PER_DAY);
  expect(request).toHaveBeenCalledTimes(CLOUD_READS_PER_DAY + 2);
  expect(new Set(request.mock.calls.map(([name]) => name)).size).toBe(1);

  vi.setSystemTime(new Date('2026-11-25T00:00:00Z'));
  await expect(reserveHostedCloudRead()).resolves.toBe(true);
});

it('does not reserve a request when the browser cannot write the budget', async () => {
  vi.stubGlobal('navigator', { locks: { request: async (name, useLock) => useLock() } });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  await expect(reserveHostedCloudRead()).resolves.toBe(false);
});
