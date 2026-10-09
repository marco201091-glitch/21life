module.exports = ({ config: input } = {}) => {
  const defaults = require('./app.json').expo;
  const base = {
    ...defaults,
    ...input,
    android: { ...defaults.android, ...input?.android },
    ios: { ...defaults.ios, ...input?.ios },
  };
  const isDevVariant = process.env.APP_VARIANT === 'dev';
  const isFdroidVariant = process.env.APP_VARIANT === 'fdroid'
    || process.env.EXPO_PUBLIC_FDROID_BUILD === 'true';
  const devScheme = 'phyrexianarena-dev';
  const productionHost = 'app.phyrexianarena.dpdns.org';
  const devHost = 'dev.phyrexianarena.dpdns.org';
  const legacyAndroidIntentFilters = isDevVariant
    ? base.android.intentFilters.map((filter) => ({
        ...filter,
        data: filter.data.map((entry) => {
          if (entry.scheme === base.scheme) return { ...entry, scheme: devScheme };
          if (entry.host === productionHost) return { ...entry, host: devHost };
          return entry;
        }),
      }))
    : base.android.intentFilters;
  const newHost = isDevVariant ? 'dev.21life.win' : 'app.21life.win';
  const legacyHost = isDevVariant ? devHost : productionHost;
  const androidIntentFilters = legacyAndroidIntentFilters.map((filter) => ({
    ...filter,
    data: filter.data.flatMap((entry) => entry.host === legacyHost
      ? [entry, { ...entry, host: newHost }]
      : [entry]),
  }));
  const legacyIosAssociatedDomains = isDevVariant
    ? base.ios.associatedDomains.map((domain) => domain === `applinks:${productionHost}` ? `applinks:${devHost}` : domain)
    : base.ios.associatedDomains;
  const iosAssociatedDomains = [...legacyIosAssociatedDomains, `applinks:${newHost}`];
  const basePlugins = (base.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'expo-splash-screen' && name !== './plugins/with-release-signing';
  });

  return {
    ...base,
    name: '21Life',
    scheme: isDevVariant ? devScheme : base.scheme,
    plugins: [
      ...basePlugins,
      'expo-font',
      'expo-image',
      'expo-sharing',
      ['expo-splash-screen', {
        image: './assets/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#0a0a0f',
      }],
      'expo-status-bar',
      'expo-web-browser',
      ...(!isFdroidVariant ? [[
        '@sentry/react-native/expo', {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_MOBILE_PROJECT || process.env.SENTRY_PROJECT,
          url: process.env.SENTRY_URL,
        },
      ]] : []),
      './plugins/with-clean-intent-filter-markers',
      './plugins/with-fdroid-blocked-permissions',
      './plugins/with-fdroid-release-build',
      './plugins/with-release-signing',
    ],
    android: {
      ...base.android,
      package: isDevVariant ? 'com.phyrexianarena.app.dev' : base.android.package,
      intentFilters: androidIntentFilters,
    },
    ios: {
      ...base.ios,
      bundleIdentifier: isDevVariant ? 'com.phyrexianarena.app.dev' : base.ios.bundleIdentifier,
      associatedDomains: iosAssociatedDomains,
    },
  };
};
