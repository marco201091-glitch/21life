import { describe, expect, it } from 'vitest';
import {
  LIVE_GAME_TELEMETRY_PERSIST_INTERVAL_MS,
  sanitizeLiveGameTelemetryError,
  shouldPersistLiveGameTelemetry,
} from '@/lib/live-game-telemetry';

describe('native live-game telemetry', () => {
  it('redacts sensitive diagnostics', () => {
    expect(sanitizeLiveGameTelemetryError(
      'user@example.com 123e4567-e89b-42d3-a456-426614174000 https://example.com/private',
    )).toBe('[email] [id] [url]');
  });

  it('throttles healthy persistence and permits forced error persistence', () => {
    expect(shouldPersistLiveGameTelemetry({
      lastPersistedAt: 1_000,
      now: 1_000 + LIVE_GAME_TELEMETRY_PERSIST_INTERVAL_MS - 1,
    })).toBe(false);
    expect(shouldPersistLiveGameTelemetry({
      lastPersistedAt: 1_000,
      now: 1_001,
      force: true,
    })).toBe(true);
  });

  it('removes credentials and push tokens from telemetry', () => {
    const result = sanitizeLiveGameTelemetryError('password=hunter2 Bearer sensitive-value ExponentPushToken[private-token] {"secret":"private-json-value"}');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('sensitive-value');
    expect(result).not.toContain('private-token');
    expect(result).not.toContain('private-json-value');
  });
});
