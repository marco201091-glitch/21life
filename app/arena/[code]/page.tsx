'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLoader } from '@/components/ui/app-loader';
import { ManaLogo } from '@/components/ui/mana-logo';
import { DeckImage } from '@/components/deck-image';
import { ManaColorReport, ManaColorPairs } from '@/components/arena/mana-color-charts';
import { useLanguage } from '@/components/language-provider';
import { ManaColorBadge } from '@/components/ui/mana-color-pills';
import { ArrowLeft, CalendarDays, Copy, Link2, Palette, Swords, Trophy, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatArenaSeasonDate, formatArenaSeasonLabel } from '@/lib/arena-seasons';
import type { ArenaColorAnalytics } from '@/lib/arena-color-analytics';
import { formatMatchRecord, type MatchRecord } from '@/lib/win-rate';

import { format } from 'date-fns';

interface PublicArenaResponse {
  arena: {
    name: string;
    description: string | null;
    inviteCode: string;
    createdAt: string;
    seasonsEnabled: boolean;
    seasonStart: string | null;
    seasonEnd: string | null;
  };
  summary: {
    totalMatches: number;
    totalPlayers: number;
  };
  topPlayers: Array<MatchRecord & { displayName: string }>;
  topDecks: Array<MatchRecord & {
    name: string;
    commander: string;
    commanderImage: string | null;
    bracket: string | null;
    ownerDisplayName: string;
  }>;
  topColors: Array<{
    color: string;
    label: { it: string; en: string };
    gamesPlayed: number;
    percentage: number;
    winRate: number;
  }>;
  // Reuse the shared shape so this response type cannot drift from the payload
  // the API actually returns.
  colorMeta: ArenaColorAnalytics;
  recentMatches: Array<{
    id: string;
    playedAt: string;
    notes: string | null;
    winnerName: string;
    participants: Array<{
      displayName: string;
      commander: string | null;
      deckName: string | null;
      isWinner: boolean;
      bracket: string | null;
    }>;
  }>;
}

export default function PublicArenaPage() {
  const params = useParams();
  const code = String(params.code || '').toUpperCase();
  const { copy: t, language } = useLanguage();
  const { toast } = useToast();
  const [data, setData] = useState<PublicArenaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const copyArenaLink = async () => {
    if (!data) return;

    const url = `${window.location.origin}/arena/${data.arena.inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: t({ it: 'Link copiato', en: 'Link copied' }),
        description: t({ it: 'Puoi condividere questo playgroup con chi vuoi.', en: 'You can share this playgroup with anyone.' }),
      });
    } catch {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Impossibile copiare il link', en: 'Failed to copy link' }),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!code) return;

    setLoading(true);
    fetch(`/api/public-arena/${code}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Playgroup not found');
        }
        return response.json() as Promise<PublicArenaResponse>;
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        setData(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Playgroup not found');
      })
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return <AppLoader />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="mb-2 text-2xl font-bold text-foreground">
            {t({ it: 'Playgroup non disponibile', en: 'Playgroup unavailable' })}
          </h1>
          <p className="mb-6 text-muted-foreground">
            {t({
              it: 'Questo playgroup non è pubblico o il codice non è valido.',
              en: 'This playgroup is not public or the code is invalid.',
            })}
          </p>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t({ it: 'Torna alla home', en: 'Back to home' })}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="web-header border-b border-border/70 bg-card/40 backdrop-blur">
        <div className="web-container mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <ManaLogo />
          <Button asChild variant="outline" className="border-border">
            <Link href="/auth/login">
              {t({ it: 'Accedi', en: 'Sign in' })}
            </Link>
          </Button>
        </div>
      </header>

      <main className="web-page web-container mx-auto max-w-6xl px-4 py-8">
        <section className="web-player-card relative mb-8 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/70 via-background to-background p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                {t({ it: 'Playgroup pubblico', en: 'Public playgroup' })}
              </p>
              <h1 className="mt-2 break-words text-3xl font-bold text-foreground sm:text-4xl">{data.arena.name}</h1>
              {data.arena.description && (
                <p className="mt-3 max-w-3xl text-muted-foreground">{data.arena.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1">
                  <Link2 className="h-3.5 w-3.5" />
                  {data.arena.inviteCode}
                </span>
                <span>
                  {t({ it: 'Creata il', en: 'Created' })} {format(new Date(data.arena.createdAt), 'PPP')}
                </span>
                {data.arena.seasonsEnabled && data.arena.seasonStart && data.arena.seasonEnd ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatArenaSeasonLabel(data.arena.seasonStart, data.arena.seasonEnd, language === 'it' ? 'it-IT' : 'en-US')}
                  {' · '}{formatArenaSeasonDate(data.arena.seasonStart, language === 'it' ? 'it-IT' : 'en-US')}
                </span> : null}
              </div>
            </div>
            <Button variant="outline" className="border-emerald-500/30 bg-background/40" onClick={copyArenaLink}>
              <Copy className="mr-2 h-4 w-4" />
              {t({ it: 'Copia link', en: 'Copy link' })}
            </Button>
          </div>
        </section>

        {(data.topPlayers[0] || data.topDecks[0] || data.topColors[0]) && (
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            {data.topPlayers[0] && (
              <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-card/60">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-amber-200/80">
                    <Trophy className="h-4 w-4" />
                    {t({ it: 'Leader attuale', en: 'Current leader' })}
                  </div>
                  <p className="truncate text-xl font-bold text-foreground">{data.topPlayers[0].displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.topPlayers[0].winRate}% · {formatMatchRecord(data.topPlayers[0])}
                  </p>
                </CardContent>
              </Card>
            )}
            {data.topDecks[0] && (
              <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-card/60">
                <CardContent className="flex gap-3 p-4">
                  <DeckImage
                    src={data.topDecks[0].commanderImage}
                    alt={data.topDecks[0].commander}
                    className="h-16 w-16 shrink-0 rounded object-cover object-top"
                  />
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-200/80">
                      <Swords className="h-4 w-4" />
                      {t({ it: 'Mazzo top', en: 'Top deck' })}
                    </div>
                    <p className="truncate font-semibold text-foreground">{data.topDecks[0].name}</p>
                    <p className="truncate text-xs text-muted-foreground">{data.topDecks[0].ownerDisplayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.topDecks[0].winRate}% · {formatMatchRecord(data.topDecks[0])}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {data.topColors[0] && (
              <Card className="border-teal-500/25 bg-gradient-to-br from-teal-500/10 to-card/60">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-teal-200/80">
                    <Palette className="h-4 w-4" />
                    {t({ it: 'Colore dominante', en: 'Dominant color' })}
                  </div>
                  <div className="flex items-center gap-2">
                    <ManaColorBadge color={data.topColors[0].color} size="sm" />
                    <p className="font-semibold text-foreground">{t(data.topColors[0].label)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data.topColors[0].percentage}% {t({ it: 'del meta', en: 'of meta' })} · {data.topColors[0].winRate}% WR
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {t({ it: 'Partite', en: 'Matches' })}
              </div>
              <p className="text-2xl font-bold text-foreground">{data.summary.totalMatches}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/60">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Users className="h-4 w-4" />
                {t({ it: 'Giocatori', en: 'Players' })}
              </div>
              <p className="text-2xl font-bold text-foreground">{data.summary.totalPlayers}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/60">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-4 w-4" />
                {t({ it: 'Leader', en: 'Leader' })}
              </div>
              <p className="truncate text-xl font-bold text-foreground">
                {data.topPlayers[0]?.displayName || '—'}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.topPlayers[0] ? `${data.topPlayers[0].winRate}%` : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/70 bg-card/60">
            <CardHeader>
              <CardTitle>{t({ it: 'Top giocatori', en: 'Top players' })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topPlayers.map((player, index) => (
                <div key={`${player.displayName}-${index}`} className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-200">
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground">{player.displayName}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {player.winRate}% · {formatMatchRecord(player)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="h-5 w-5" />
                {t({ it: 'Top mazzi', en: 'Top decks' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topDecks.map((deck, index) => (
                <div key={`${deck.commander}-${index}`} className="flex items-center gap-3 rounded-md border border-border/60 bg-background/30 p-3">
                  <DeckImage
                    src={deck.commanderImage}
                    alt={deck.commander}
                    className="h-14 w-14 shrink-0 rounded object-cover object-top"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{deck.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{deck.ownerDisplayName}</p>
                        {deck.bracket && (
                          <span className="mt-1 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">
                            B{deck.bracket}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-sm text-emerald-300">{deck.winRate}%</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMatchRecord(deck)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {data.colorMeta.played.length > 0 && (
          <div className="mt-6 space-y-6">
            <Card className="border-border/70 bg-card/60">
              <CardHeader>
                <CardTitle>{t({ it: 'Meta colori', en: 'Color meta' })}</CardTitle>
                <CardDescription>{t({ it: 'Statistiche aggregate all-time', en: 'All-time aggregate stats' })}</CardDescription>
              </CardHeader>
              <CardContent>
                <ManaColorReport
                  played={data.colorMeta.played}
                  won={data.colorMeta.won}
                  winRates={data.colorMeta.winRates}
                  missingColorGames={data.colorMeta.missingColorGames}
                  emptyLabel={t({ it: 'Nessun dato colore', en: 'No color data' })}
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/60">
              <CardHeader>
                <CardTitle>{t({ it: 'Identità multicolore', en: 'Multicolor identities' })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ManaColorPairs
                  pairs={data.colorMeta.pairs}
                  emptyLabel={t({ it: 'Nessuna identità multicolore', en: 'No multicolor identities' })}
                />
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="mt-6 border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle>{t({ it: 'Ultime partite', en: 'Recent matches' })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentMatches.map((match) => (
              <div key={match.id} className="rounded-lg border border-border/60 bg-background/30 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {format(new Date(match.playedAt), 'PPP p')}
                </div>
                <p className="mb-3 text-sm">
                  <span className="text-muted-foreground">{t({ it: 'Vincitore', en: 'Winner' })}: </span>
                  <span className="font-medium text-emerald-300">{match.winnerName}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {match.participants.map((participant, index) => (
                    <span
                      key={`${match.id}-${participant.displayName}-${index}`}
                      className={`rounded px-2 py-1 text-xs ${
                        participant.isWinner
                          ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                          : 'bg-secondary/70 text-secondary-foreground'
                      }`}
                    >
                      {participant.displayName}
                      {participant.commander ? ` (${participant.commander})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {data.topColors.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {data.topColors.map((color) => (
              <span
                key={color.color}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/35 px-2.5 py-1 text-xs text-foreground"
              >
                <ManaColorBadge color={color.color} size="xs" />
                {t(color.label)} · {color.percentage}%
              </span>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
