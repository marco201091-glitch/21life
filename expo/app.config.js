module.exports = ({ config: base }) => {
  const isDevVariant = process.env.APP_VARIANT === 'dev';
  const devScheme = 'phyrexianarena-dev';
  const productionHost = 'app.phyrexianarena.dpdns.org';
  const devHost = 'dev.phyrexianarena.dpdns.org';
  const androidIntentFilters = isDevVariant
    ? base.android.intentFilters.map((filter) => ({
        ...filter,
        data: filter.data.map((entry) => {
          if (entry.scheme === base.scheme) return { ...entry, scheme: devScheme };
          if (entry.host === productionHost) return { ...entry, host: devHost };
          return entry;
        }),
      }))
    : base.android.intentFilters;
  const iosAssociatedDomains = isDevVariant
    ? base.ios.associatedDomains.map((domain) => domain === `applinks:${productionHost}` ? `applinks:${devHost}` : domain)
    : base.ios.associatedDomains;
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
