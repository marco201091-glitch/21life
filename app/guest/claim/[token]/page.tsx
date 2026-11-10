'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Clock3, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeckImage } from '@/components/deck-image';
import { AppLoader } from '@/components/ui/app-loader';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/components/language-provider';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

type ClaimPreview = {
  guest: {
    displayName: string;
    decks: Array<{ name: string; commander: string; commander_image: string | null }>;
  };
  arenaName: string;
  expiresAt: string;
};

type ClaimResult = {
  groupId: string;
  groupName: string;
  displayName: string;
  transferredDecks: number;
  transferredMatches: number;
};

export default function GuestClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { copy } = useLanguage();
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClaimResult | null>(null);
  const returnPath = `/guest/claim/${token}`;

  useEffect(() => {
    let active = true;
    fetch(`/api/guest-claims?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Invalid link');
        if (active) setPreview(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Invalid link');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  const claim = async () => {
    setClaiming(true);
    setError('');
    const response = await authenticatedFetch('/api/guest-claims', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json().catch(() => ({}));
    setClaiming(false);
    if (!response.ok) {
      setError(payload.error || copy({ it: 'Conversione non riuscita', en: 'Claim failed' }));
      return;
    }
    setResult(payload);
  };

  if (loading || authLoading) return <AppLoader label={copy({ it: 'Verifica invito…', en: 'Checking invite…' })} />;

  if (result) {
    return (
      <main className="web-page web-guest-claim grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,#0a150c,#050509_62%)] p-4">
        <Card className="w-full max-w-lg border-emerald-400/25 bg-card/95 text-center shadow-2xl">
          <CardContent className="space-y-5 p-8">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" />
            <div><h1 className="text-2xl font-black">{copy({ it: 'Guest evoluto', en: 'Guest upgraded' })}</h1><p className="mt-2 text-muted-foreground">{result.displayName} {copy({ it: 'ora è collegato al tuo account.', en: 'is now linked to your account.' })}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-secondary/60 p-4"><b className="block text-2xl">{result.transferredMatches}</b><span className="text-xs text-muted-foreground">{copy({ it: 'partite trasferite', en: 'matches transferred' })}</span></div>
              <div className="rounded-2xl bg-secondary/60 p-4"><b className="block text-2xl">{result.transferredDecks}</b><span className="text-xs text-muted-foreground">{copy({ it: 'mazzi trasferiti', en: 'decks transferred' })}</span></div>
            </div>
            <Button className="w-full" onClick={() => router.replace(`/table/${result.groupId}`)}>{copy({ it: 'Entra nell’Arena', en: 'Open Arena' })}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!preview) {
    return <main className="web-page web-guest-claim grid min-h-dvh place-items-center bg-background p-4"><Card className="max-w-md"><CardContent className="p-8 text-center"><h1 className="text-xl font-black">{copy({ it: 'Link non valido', en: 'Invalid link' })}</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></CardContent></Card></main>;
  }

  return (
    <main className="web-page web-guest-claim min-h-dvh bg-[radial-gradient(circle_at_top,#0a150c,#050509_62%)] px-4 py-10">
      <Card className="mx-auto w-full max-w-xl overflow-hidden border-emerald-400/25 bg-card/95 shadow-2xl">
        <CardHeader className="border-b border-border bg-emerald-500/10">
          <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">21Life</p>
          <CardTitle className="break-words text-2xl">{preview.guest.displayName}, {copy({ it: 'evolvi il tuo profilo', en: 'upgrade your profile' })}</CardTitle>
          <p className="text-sm text-muted-foreground">{copy({ it: 'Il manager ti ha invitato a trasformare il guest in un account reale.', en: 'The manager invited you to turn this guest into a real account.' })}</p>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4"><ShieldCheck className="h-6 w-6 text-emerald-300" /><div><b>{preview.arenaName}</b><p className="text-xs text-muted-foreground">{copy({ it: 'Storico, vittorie e mazzi verranno mantenuti.', en: 'History, wins, and decks will be preserved.' })}</p></div></div>
          {preview.guest.decks.length ? <div className="flex gap-3 overflow-x-auto pb-2">{preview.guest.decks.map((deck, index) => <div key={`${deck.name}-${index}`} className="w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/40"><DeckImage src={deck.commander_image} alt={deck.commander} className="h-28 w-full rounded-none object-cover object-top" /><div className="p-2"><b className="line-clamp-2 text-xs">{deck.name}</b><small className="mt-1 block truncate text-muted-foreground">{deck.commander}</small></div></div>)}</div> : null}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />{copy({ it: 'Link monouso, valido fino al', en: 'One-time link, valid until' })} {new Date(preview.expiresAt).toLocaleDateString()}</p>
          {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {user ? (
            <Button className="h-12 w-full bg-gradient-to-r from-emerald-600 to-teal-600 font-black" onClick={() => void claim()} disabled={claiming}>{claiming ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}{copy({ it: 'Trasferisci al mio account', en: 'Transfer to my account' })}</Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild><Link href={`/auth/register?redirect=${encodeURIComponent(returnPath)}`}>{copy({ it: 'Crea account', en: 'Create account' })}</Link></Button>
              <Button asChild variant="outline"><Link href={`/auth/login?redirect=${encodeURIComponent(returnPath)}`}>{copy({ it: 'Ho già un account', en: 'I have an account' })}</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
