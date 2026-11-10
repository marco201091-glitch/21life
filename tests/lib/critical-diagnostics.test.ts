import { describe, expect, it, vi } from 'vitest';
import { logCriticalEvent } from '@/lib/critical-diagnostics';

describe('critical diagnostics', () => {
  it('emits only the explicitly allowed fields', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logCriticalEvent('archidekt_sync', 'import', 'failed', { durationMs: 12, skipped: 1, token: 'secret', user: 'private' } as never);
    const record = JSON.parse(String(spy.mock.calls[0][0]));
    expect(record).toEqual({ event: 'archidekt_sync', stage: 'import', result: 'failed', durationMs: 12, skipped: 1 });
    spy.mockRestore();
  });
});
