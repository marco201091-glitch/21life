'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import packageJson from '@/package.json';
import { useLanguage } from '@/components/language-provider';
import { useToast } from '@/hooks/use-toast';

type RuntimeConfig = {
  recommendedVersion?: string;
  latestReleasedVersion?: string | null;
  releaseUpdateAvailable?: boolean;
  supportState?: 'supported' | 'update_available' | 'unsupported';
  featureFlags?: Record<string, boolean>;
  releaseNotes?: Array<{ version?: string; it?: string; en?: string }>;
};

const RuntimeConfigContext = createContext<RuntimeConfig>({
  featureFlags: { lastStanding: true, deckWizardSearch: true },
});

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const { toast } = useToast();
  const [config, setConfig] = useState<RuntimeConfig>({
    featureFlags: { lastStanding: true, deckWizardSearch: true },
  });

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      void fetch(`/api/app-config?version=${encodeURIComponent(packageJson.version)}`)
      .then((response) => response.ok ? response.json() as Promise<RuntimeConfig> : null)
      .then((next) => {
        if (!active || !next) return;
        setConfig(next);
        if (!['/dashboard', '/profile', '/counter'].includes(pathname) && !pathname.startsWith('/table/')) return;
        if (next.releaseUpdateAvailable && next.latestReleasedVersion) {
          const key = `release-update:${next.latestReleasedVersion}`;
          if (!localStorage.getItem(key)) {
            toast({
              title: language === 'it' ? 'Aggiornamento disponibile' : 'Update available',
              description: language === 'it'
                ? `È disponibile 21Life ${next.latestReleasedVersion}. Ricarica la pagina per aggiornare.`
                : `21Life ${next.latestReleasedVersion} is available. Reload the page to update.`,
            });
            localStorage.setItem(key, 'shown');
            return;
          }
        }
        const note = next.releaseNotes?.find((entry) => entry.version === packageJson.version);
        const description = language === 'it' ? note?.it : note?.en;
        if (!description) return;
        const key = `runtime-notice:${packageJson.version}:${language}`;
        if (localStorage.getItem(key)) return;
        toast({ title: language === 'it' ? `Novità ${packageJson.version}` : `What's new in ${packageJson.version}`, description });
        localStorage.setItem(key, 'shown');
      })
        .catch(() => undefined)
        .finally(() => { pending = false; });
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(refresh, 60 * 60 * 1000);
    return () => { active = false; document.removeEventListener('visibilitychange', onVisibilityChange); window.clearInterval(timer); };
  }, [language, pathname, toast]);

  const value = useMemo(() => ({
    ...config,
    featureFlags: {
      lastStanding: config.featureFlags?.lastStanding !== false,
      deckWizardSearch: config.featureFlags?.deckWizardSearch !== false,
      ...config.featureFlags,
    },
  }), [config]);
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
