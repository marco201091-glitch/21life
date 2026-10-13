'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { AppLoader } from '@/components/ui/app-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { usePlatformAdmin } from '@/hooks/use-platform-admin';
import { useLanguage } from '@/components/language-provider';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

type Operations = {
  backend: { version: string; commit: string };
  database: { ok: boolean; latencyMs: number };
  expectedLatestMigration: string;
  migrationRegistry: {
    registryAvailable: boolean;
    migrations: Array<{ version: string; name: string; status: string; appliedAt?: string }>;
  };
  runtimeConfiguration: { minimum_supported_version?: string; recommended_version?: string; feature_flags?: Record<string, boolean> } | null;
  clientAdoption30d: { appVersions: Record<string, number>; webVisits: number; queryLimited: boolean; available: boolean };
  notificationDeliveries24h: { counts: Record<string, number>; available: boolean };
  liveGameSync14d: { available: boolean; sessions: number; successfulSyncs: number; failedSyncs: number; failureRate: number; recoveredSessions: number; sessionsWithQueue: number; maxQueueDepth: number; versionConflicts: number; slowestSyncMs: number; queryLimited: boolean };
  backupLastSuccessAt: string | null;
};

const DELIVERY_LABELS: Record<string, { it: string; en: string }> = {
  sent: { it: 'Inviate', en: 'Sent' },
  delivered: { it: 'Consegnate', en: 'Delivered' },
  failed: { it: 'Fallite', en: 'Failed' },
  error: { it: 'In errore', en: 'Errored' },
  skipped: { it: 'Saltate', en: 'Skipped' },
  pending: { it: 'In attesa', en: 'Pending' },
  queued: { it: 'In coda', en: 'Queued' },
};

export default function AdminOperationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { adminMode, loading: adminLoading } = usePlatformAdmin();
  const { copy: t, language } = useLanguage();
  const router = useRouter();
  const [data, setData] = useState<Operations | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = authLoading || adminLoading;
  const locale = language === 'it' ? 'it-IT' : 'en-US';

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const response = await fetch('/api/admin/operations');
    if (response.ok) setData(await response.json());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/auth/login?redirect=/admin/operations');
    if (!adminMode) return router.replace('/dashboard');
    void refresh();
  }, [adminMode, loading, refresh, router, user]);

  const issues = useMemo(() => {
    if (!data) return [];
    const found: string[] = [];
    if (!data.database.ok) found.push(t({ it: 'Il database non risponde.', en: 'The database is not responding.' }));
    if (data.liveGameSync14d.available && data.liveGameSync14d.failureRate > 5) {
      found.push(t({
        it: `Sincronizzazione live sopra il 5% di errori (${formatNumber(data.liveGameSync14d.failureRate, locale)}%).`,
        en: `Live sync above 5% failures (${formatNumber(data.liveGameSync14d.failureRate, locale)}%).`,
      }));
    }
    if (!data.notificationDeliveries24h.available) {
      found.push(t({ it: 'Le notifiche non sono leggibili.', en: 'Notifications cannot be read.' }));
    }
    return found;
  }, [data, locale, t]);

  if (loading || !user || !adminMode) return <AppLoader label={t({ it: 'Caricamento...', en: 'Loading...' })} />;

  const versionRows = data
    ? Object.entries(data.clientAdoption30d.appVersions).sort((a, b) => b[1] - a[1])
    : [];
  const busiestVersion = versionRows[0]?.[1] ?? 0;

  return <AdminShell title={t({ it: 'Operazioni', en: 'Operations' })} description={t({ it: 'Stato dell’applicazione, del database e di come viene usata.', en: 'Application, database, and usage status.' })}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {data ? (
        issues.length === 0 ? (
          <Badge className="border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-emerald-200">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            {t({ it: 'Tutto regolare', en: 'All good' })}
          </Badge>
        ) : (
          <Badge className="border-amber-400/30 bg-amber-500/15 px-3 py-1 text-amber-200">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            {t({ it: 'Da controllare', en: 'Needs attention' })}
          </Badge>
        )
      ) : <span />}
      <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        {t({ it: 'Aggiorna', en: 'Refresh' })}
      </Button>
    </div>

    {issues.length > 0 && (
      <Card className="mb-4 border-amber-400/30 bg-amber-500/10">
        <CardContent className="pt-6">
          <ul className="space-y-1 text-sm text-amber-100">
            {issues.map((issue) => <li key={issue}>• {issue}</li>)}
          </ul>
        </CardContent>
      </Card>
    )}

    {!data ? <AppLoader label={t({ it: 'Caricamento...', en: 'Loading...' })} /> : (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t({ it: 'Versione applicazione', en: 'Application version' })}
            value={`v${data.backend.version}`}
            hint={data.backend.commit === 'unknown'
              ? t({ it: 'commit non disponibile', en: 'commit unavailable' })
              : t({ it: `commit ${data.backend.commit.slice(0, 8)}`, en: `commit ${data.backend.commit.slice(0, 8)}` })}
          />
          <StatCard
            label={t({ it: 'Database', en: 'Database' })}
            value={data.database.ok ? t({ it: 'Risponde', en: 'Responding' }) : t({ it: 'Non risponde', en: 'Not responding' })}
            hint={data.database.ok
              ? t({ it: `${data.database.latencyMs} ms di risposta`, en: `${data.database.latencyMs} ms response` })
              : t({ it: 'controlla i container Supabase', en: 'check the Supabase containers' })}
            tone={data.database.ok ? 'good' : 'bad'}
          />
          <StatCard
            label={t({ it: 'Ultimo backup', en: 'Latest backup' })}
            value={data.backupLastSuccessAt
              ? formatDate(data.backupLastSuccessAt, locale)
              : t({ it: 'Non configurato', en: 'Not configured' })}
            hint={data.backupLastSuccessAt
              ? undefined
              : t({ it: 'il container non riceve lo stato del backup', en: 'the container does not receive backup status' })}
            tone={data.backupLastSuccessAt ? 'good' : 'neutral'}
          />
          <StatCard
            label={t({ it: 'App supportate', en: 'Supported apps' })}
            value={data.runtimeConfiguration?.minimum_supported_version
              ? t({ it: `dalla ${data.runtimeConfiguration.minimum_supported_version}`, en: `from ${data.runtimeConfiguration.minimum_supported_version}` })
              : t({ it: 'Non configurate', en: 'Not configured' })}
            hint={data.runtimeConfiguration?.recommended_version
              ? t({ it: `consigliata ${data.runtimeConfiguration.recommended_version}`, en: `recommended ${data.runtimeConfiguration.recommended_version}` })
              : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t({ it: 'Chi usa l’app · ultimi 30 giorni', en: 'Who uses the app · last 30 days' })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!data.clientAdoption30d.available ? (
                <p className="text-sm text-muted-foreground">{t({ it: 'Non disponibili.', en: 'Not available.' })}</p>
              ) : <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t({ it: 'Accessi da app, per versione', en: 'App visits, by version' })}
                </p>
                {versionRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t({ it: 'Nessun accesso da app nel periodo.', en: 'No app visits in the period.' })}</p>
                ) : (
                  <ul className="space-y-2">
                    {versionRows.map(([version, count], index) => (
                      <li key={version} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-mono text-foreground">v{version}</span>
                          <span className="text-muted-foreground">
                            {t({ it: `${count} accessi`, en: `${count} visits` })}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                          <div
                            className={index === 0 ? 'h-full rounded-full bg-emerald-400/70' : 'h-full rounded-full bg-muted-foreground/40'}
                            style={{ width: `${busiestVersion > 0 ? Math.max(4, Math.round((count / busiestVersion) * 100)) : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-border/60 pt-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{formatNumber(data.clientAdoption30d.webVisits, locale)}</span>{' '}
                  <span className="text-muted-foreground">{t({ it: 'visite dal sito web', en: 'visits from the website' })}</span>
                </p>
              </div>
              {data.clientAdoption30d.queryLimited && (
                <p className="text-xs text-amber-200">
                  {t({ it: 'Dati parziali: raggiunto il limite di lettura.', en: 'Partial data: read limit reached.' })}
                </p>
              )}
              </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t({ it: 'Notifiche · ultime 24 ore', en: 'Notifications · last 24 hours' })}</CardTitle>
            </CardHeader>
            <CardContent>
              {!data.notificationDeliveries24h.available ? (
                <p className="text-sm text-muted-foreground">{t({ it: 'Non disponibili.', en: 'Not available.' })}</p>
              ) : Object.keys(data.notificationDeliveries24h.counts).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t({ it: 'Nessuna notifica inviata nelle ultime 24 ore.', en: 'No notifications sent in the last 24 hours.' })}</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(data.notificationDeliveries24h.counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <li key={status} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-foreground">
                          {DELIVERY_LABELS[status] ? t(DELIVERY_LABELS[status]) : status}
                        </span>
                        <span className="font-semibold text-foreground">{formatNumber(count, locale)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t({ it: 'Qualità della sincronizzazione live · ultimi 14 giorni', en: 'Live sync quality · last 14 days' })}</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.liveGameSync14d.available ? (
              <p className="text-sm text-muted-foreground">{t({ it: 'Non disponibile.', en: 'Not available.' })}</p>
            ) : data.liveGameSync14d.sessions === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t({ it: 'Nessuna partita live registrata nel periodo.', en: 'No live games recorded in the period.' })}
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <StatRow
                    label={t({ it: 'Errori di sincronizzazione', en: 'Sync failures' })}
                    value={data.liveGameSync14d.failureRate === 0
                      ? t({ it: 'Nessuno', en: 'None' })
                      : `${formatNumber(data.liveGameSync14d.failureRate, locale)}%`}
                    hint={t({
                      it: `${data.liveGameSync14d.failedSyncs} su ${data.liveGameSync14d.successfulSyncs + data.liveGameSync14d.failedSyncs} tentativi`,
                      en: `${data.liveGameSync14d.failedSyncs} of ${data.liveGameSync14d.successfulSyncs + data.liveGameSync14d.failedSyncs} attempts`,
                    })}
                  />
                  <StatRow
                    label={t({ it: 'Sincronizzazione più lenta', en: 'Slowest sync' })}
                    value={formatDuration(data.liveGameSync14d.slowestSyncMs, locale)}
                  />
                  <StatRow
                    label={t({ it: 'Modifiche in attesa (picco)', en: 'Pending changes (peak)' })}
                    value={formatNumber(data.liveGameSync14d.maxQueueDepth, locale)}
                    hint={t({
                      it: `in ${data.liveGameSync14d.sessionsWithQueue} partite`,
                      en: `across ${data.liveGameSync14d.sessionsWithQueue} games`,
                    })}
                  />
                  <StatRow
                    label={t({ it: 'Partite osservate', en: 'Observed games' })}
                    value={formatNumber(data.liveGameSync14d.sessions, locale)}
                  />
                  <StatRow
                    label={t({ it: 'Conflitti di versione', en: 'Version conflicts' })}
                    value={formatNumber(data.liveGameSync14d.versionConflicts, locale)}
                  />
                  <StatRow
                    label={t({ it: 'Partite recuperate', en: 'Recovered games' })}
                    value={formatNumber(data.liveGameSync14d.recoveredSessions, locale)}
                    hint={t({ it: 'riprese dopo un errore', en: 'resumed after a failure' })}
                  />
                </div>
                {data.liveGameSync14d.queryLimited && (
                  <p className="mt-3 text-xs text-amber-200">
                    {t({ it: 'Dati parziali: raggiunto il limite di lettura.', en: 'Partial data: read limit reached.' })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t({ it: 'Registro migrazioni', en: 'Migration registry' })}</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.migrationRegistry.registryAvailable ? (
              <p className="text-sm text-muted-foreground">{t({ it: 'Registro non disponibile.', en: 'Registry unavailable.' })}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t({
                    it: `${data.migrationRegistry.migrations.filter((migration) => migration.status === 'verified').length} verificate; ${data.migrationRegistry.migrations.filter((migration) => migration.status === 'checksum_mismatch').length} con checksum diverso; ${data.migrationRegistry.migrations.filter((migration) => migration.status === 'applied_not_in_checkout').length} non presenti nel checkout.`,
                    en: `${data.migrationRegistry.migrations.filter((migration) => migration.status === 'verified').length} verified; ${data.migrationRegistry.migrations.filter((migration) => migration.status === 'checksum_mismatch').length} with checksum mismatch; ${data.migrationRegistry.migrations.filter((migration) => migration.status === 'applied_not_in_checkout').length} absent from checkout.`,
                  })}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t({
                    it: `${data.migrationRegistry.migrations.filter((migration) => migration.status === 'unverified_legacy').length} senza record verificabile: le migrazioni storiche possono essere già applicate.`,
                    en: `${data.migrationRegistry.migrations.filter((migration) => migration.status === 'unverified_legacy').length} without a verifiable record: historical migrations may already be applied.`,
                  })}
                </p>
                <ul className="mt-4 max-h-64 space-y-2 overflow-auto text-xs">
                  {data.migrationRegistry.migrations.slice(-8).reverse().map((migration) => (
                    <li key={migration.version} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/60 pt-2">
                      <span className="font-mono">{migration.name}</span>
                      <span className={migration.status === 'checksum_mismatch' ? 'text-destructive' : 'text-muted-foreground'}>
                        {migration.status === 'verified' ? t({ it: 'checksum verificato', en: 'checksum verified' })
                          : migration.status === 'checksum_mismatch' ? t({ it: 'checksum diverso', en: 'checksum mismatch' })
                            : migration.status === 'applied_not_in_checkout' ? t({ it: 'applicata fuori checkout', en: 'applied outside checkout' })
                              : t({ it: 'non verificata (storico)', en: 'unverified (legacy)' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )}
  </AdminShell>;
}

function StatCard({ label, value, hint, tone = 'neutral' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={tone === 'bad' ? 'text-lg font-semibold text-destructive' : 'text-lg font-semibold text-foreground'}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatDuration(milliseconds: number, locale: string) {
  if (milliseconds <= 0) return '—';
  if (milliseconds < 1000) return `${formatNumber(milliseconds, locale)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${formatNumber(seconds, locale)} s`;
  return `${formatNumber(seconds / 60, locale)} min`;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
