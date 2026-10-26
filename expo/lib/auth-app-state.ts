import type { AppStateStatus } from 'react-native';

type AuthRefreshController = {
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
};

type AppStateController = {
  currentState: string | null | undefined;
  addEventListener: (
    type: 'change',
    listener: (state: AppStateStatus) => void,
  ) => { remove: () => void };
};

export function syncAuthRefreshForAppState(
  auth: AuthRefreshController,
  state: string | null | undefined,
) {
  if (state === 'active') {
    auth.startAutoRefresh();
    return;
  }
  auth.stopAutoRefresh();
}

export function registerAuthAppStateRefresh(
  auth: AuthRefreshController,
  appState: AppStateController,
) {
  syncAuthRefreshForAppState(auth, appState.currentState);
  const subscription = appState.addEventListener('change', (state) => {
    syncAuthRefreshForAppState(auth, state);
  });

  return () => {
    subscription.remove();
    auth.stopAutoRefresh();
  };
}
