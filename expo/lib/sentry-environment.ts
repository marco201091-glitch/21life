// Build mode alone cannot distinguish deployed Dev from production.
export function getSentryEnvironment(siteUrl: string | undefined, nodeEnv: string | undefined) {
  try {
    const hostname = new URL(siteUrl || '').hostname;
    if (['dev.21life.win', 'dev.phyrexianarena.dpdns.org', 'localhost', '127.0.0.1', '[::1]'].includes(hostname)) return 'development';
    if (['test.21life.win', 'test.phyrexianarena.dpdns.org'].includes(hostname)) return 'test';
  } catch {
    // Missing site configuration retains the SDK's build environment fallback.
  }
  return nodeEnv || 'development';
}
