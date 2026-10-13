import { afterEach, describe, expect, it, vi } from 'vitest';
import { withLiveGameTimeout, withLiveGameRequestTimeout } from '@/lib/live-game-async';

describe('live game foreground timeout', () => {
  afterEach(() => vi.useRealTimers());

  it('returns completed operations normally', async () => {
    await expect(withLiveGameTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('releases the UI when a network operation never settles', async () => {
    vi.useFakeTimers();
    const result = withLiveGameTimeout(new Promise<never>(() => undefined), 1_000);
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('aborts a stalled sync request and permits a fresh retry', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const request = { abortSignal: (value: AbortSignal) => { signal = value; return new Promise<never>(() => undefined); } };
    const result = withLiveGameRequestTimeout(request, 1_000);
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    await expect(withLiveGameRequestTimeout({ abortSignal: () => Promise.resolve('retried') })).resolves.toBe('retried');
    expect(vi.getTimerCount()).toBe(0);
  });
});
