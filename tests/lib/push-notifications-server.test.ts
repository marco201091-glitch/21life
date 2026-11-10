import { describe, expect, it } from 'vitest';
import { classifyExpoPushResult } from '@/lib/push-notifications-server';

describe('push delivery classification', () => {
  it('distinguishes success, expired tokens, and retryable provider errors', () => {
    expect(classifyExpoPushResult({ status: 'ok' })).toEqual({ status: 'sent', providerCode: null });
    expect(classifyExpoPushResult({ status: 'error', details: { error: 'DeviceNotRegistered' } }))
      .toEqual({ status: 'permanent_error', providerCode: 'DeviceNotRegistered' });
    expect(classifyExpoPushResult({ status: 'error', details: { error: 'MessageTooBig' } }))
      .toEqual({ status: 'permanent_error', providerCode: 'MessageTooBig' });
  });
});
