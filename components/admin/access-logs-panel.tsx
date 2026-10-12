'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/components/language-provider';
import { Badge } from '@/components/ui/badge';
import type { AccessLogSource } from '@/lib/access-log';
import type { AccessLogPeriod } from '@/lib/access-log-query';
import { Activity, Globe, RefreshCw, Smartphone } from 'lucide-react';

interface AccessLogRow {
  id: string;
  username: string;
  source: AccessLogSource;
  appVersion: string | null;
  accessedAt: string;
}

interface AccessLogsPanelProps {
  embedded?: boolean;
}

export function AccessLogsPanel({ embedded = false }: AccessLogsPanelProps) {
  const { copy: t, language } = useLanguage();
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<AccessLogPeriod>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | AccessLogSource>('all');
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
      if (!query) return true;
      return log.username.toLowerCase().includes(query)
        || log.appVersion?.toLowerCase().includes(query);
    });
  }, [logs, search, sourceFilter]);

  const renderSourceBadge = useCallback((source: AccessLogSource) => {
    if (source === 'app') {
      return (
        <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
          <Smartphone className="mr-1 h-3 w-3" />
          {t({ it: 'App', en: 'App' })}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="border-border/70 bg-muted/40 text-muted-foreground">
        <Globe className="mr-1 h-3 w-3" />
        {t({ it: 'Web', en: 'Web' })}
      </Badge>
    );
  }, [t]);

  const formatTimestamp = useCallback((value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(language === 'it' ? 'it-IT' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }, [language]);

  const fetchLogs = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      setLogs([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '200',
        period,
      });

      if (period === 'custom') {
        params.set('from', customFrom);
        params.set('to', customTo);
      }

      const response = await fetch(`/api/admin/access-logs?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to load access logs');
      }

      setLogs(Array.isArray(payload.logs) ? payload.logs : []);
    } catch (fetchError) {
      setLogs([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load access logs');
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, period]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  return (
    <Card className={embedded ? 'border-border/70 bg-card/60' : 'mb-6 border-border/70 bg-card/60 sm:mb-8'}>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {embedded ? (
            <CardDescription>
              {t({
                it: 'Accessi web e app (deduplicati ogni ora per origine, conservati 30 giorni).',
                en: 'Web and app visits (deduplicated hourly per source, kept for 30 days).',
              })}
            </CardDescription>
          ) : (
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Activity className="h-5 w-5 text-emerald-300" />
                {t({ it: 'Log accessi', en: 'Access Logs' })}
              </CardTitle>
              <CardDescription>
                {t({
                  it: 'Accessi web e app (deduplicati ogni ora per origine, conservati 30 giorni).',
                  en: 'Web and app visits (deduplicated hourly per source, kept for 30 days).',
                })}
              </CardDescription>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`border-border text-foreground ${embedded ? 'sm:ml-auto' : ''}`}
            onClick={() => void fetchLogs()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t({ it: 'Aggiorna', en: 'Refresh' })}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:min-w-64 sm:flex-1">
            <label htmlFor="access-log-search" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t({ it: 'Cerca', en: 'Search' })}
            </label>
            <Input id="access-log-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t({ it: 'Username o versione app', en: 'Username or app version' })} className="border-border bg-background/50 text-foreground" />
          </div>
          <div className="w-full sm:w-44">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t({ it: 'Origine', en: 'Source' })}</label>
            <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as 'all' | AccessLogSource)}>
              <SelectTrigger aria-label={t({ it: "Origine", en: "Source" })} className="border-border bg-background/50 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t({ it: 'Tutte', en: 'All' })}</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="app">App</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-56">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t({ it: 'Periodo', en: 'Period' })}
            </label>
            <Select value={period} onValueChange={(value) => setPeriod(value as AccessLogPeriod)}>
              <SelectTrigger aria-label={t({ it: "Periodo", en: "Period" })} className="border-border bg-background/50 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">{t({ it: 'Ultime 24 ore', en: 'Last 24 hours' })}</SelectItem>
                <SelectItem value="7d">{t({ it: 'Ultimi 7 giorni', en: 'Last 7 days' })}</SelectItem>
                <SelectItem value="30d">{t({ it: 'Ultimi 30 giorni', en: 'Last 30 days' })}</SelectItem>
                <SelectItem value="all">{t({ it: 'Tutti', en: 'All' })}</SelectItem>
                <SelectItem value="custom">{t({ it: 'Personalizzato', en: 'Custom' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === 'custom' && (
            <>
              <div className="w-full sm:w-44">
                <label htmlFor="access-log-from" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {t({ it: 'Da', en: 'From' })}
                </label>
                <Input
                  id="access-log-from"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="border-border bg-background/50 text-foreground"
                />
              </div>
              <div className="w-full sm:w-44">
                <label htmlFor="access-log-to" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {t({ it: 'A', en: 'To' })}
                </label>
                <Input
                  id="access-log-to"
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="border-border bg-background/50 text-foreground"
                />
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {period === 'custom' && (!customFrom || !customTo) ? (
          <p className="text-sm text-muted-foreground">
            {t({ it: 'Seleziona data inizio e fine.', en: 'Select a start and end date.' })}
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">
            {t({ it: 'Caricamento log...', en: 'Loading logs...' })}
          </p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t({ it: 'Nessun accesso nel periodo selezionato.', en: 'No access in the selected period.' })}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t({ it: 'Username', en: 'Username' })}</TableHead>
                <TableHead>{t({ it: 'Origine', en: 'Source' })}</TableHead>
                <TableHead>{t({ it: 'Versione app', en: 'App version' })}</TableHead>
                <TableHead>{t({ it: 'Timestamp', en: 'Timestamp' })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-foreground">{log.username}</TableCell>
                  <TableCell>{renderSourceBadge(log.source ?? 'web')}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {log.source === 'app' && log.appVersion ? `v${log.appVersion}` : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatTimestamp(log.accessedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
