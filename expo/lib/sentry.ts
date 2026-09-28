export const sentryEnabled = false;

export const Sentry = {
  wrap<T>(component: T) {
    return component;
  },
};
