import { describe, expect, it, vi } from 'vitest';
import { registerAuthAppStateRefresh, syncAuthRefreshForAppState } from '@/lib/auth-app-state';

function authController() {
  return {
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
  };
}

describe('Supabase auth app-state refresh', () => {
  it('refreshes only while the app is active', () => {
    const auth = authController();
    syncAuthRefreshForAppState(auth, 'active');
    syncAuthRefreshForAppState(auth, 'background');
    syncAuthRefreshForAppState(auth, 'inactive');

    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('keeps refresh paused when the native initial state is unavailable', () => {
    const auth = authController();
    syncAuthRefreshForAppState(auth, null);
    syncAuthRefreshForAppState(auth, undefined);

    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('syncs immediately, follows transitions, and cleans up on unmount', () => {
    const auth = authController();
    let listener: ((state: 'active' | 'background') => void) | undefined;
    const remove = vi.fn();
    const appState = {
      currentState: 'background' as const,
      addEventListener: vi.fn((_type: 'change', next: typeof listener) => {
        listener = next;
        return { remove };
      }),
    };

    const unregister = registerAuthAppStateRefresh(auth, appState);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    listener?.('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    unregister();
    expect(remove).toHaveBeenCalledOnce();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});
