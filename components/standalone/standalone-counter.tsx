'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Crown, Dices, Download, Minus, Plus, RotateCcw, Shield,
  Settings, Sparkles, Swords,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoldActionButton } from '@/components/ui/hold-action-button';
import { DeckImage } from '@/components/deck-image';
import { ModalCard, ModalOverlay } from '@/components/ui/modal-shell';
import {
  applyLiveGameMutation,
  createLiveGamePlayer,
  createLiveGameSummary,
  getSuggestedWinner,
  parseLiveGameState,
  type LiveGameMutation,
  type LiveGamePlayer,
  type LiveGameState,
  type PlayerCounter,
  type PlayerEmblem,
} from '@/lib/live-game';
import {
  getCenterToolbarBand, getLandscapeSeatRotation, getSeatRotation,
  getSquareTableLayouts, getViewportTableOrientation, mapPlayersToSeats,
  type SquareSeatLayout,
} from '@/lib/live-game-table-layout';
import { rollTableRandom, type TableRandomKind } from '@/lib/table-randomizer';
import type { ParticipantKey } from '@/lib/participant-keys';
import { useLanguage } from '@/components/language-provider';
import { LifeReadout } from '@/components/ui/recent-life-delta';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';

const STORAGE_KEY = 'phyrexian:standalone-counter:v1';
const PREFERENCES_KEY = 'phyrexian:counter-preferences:v1';
const COLORS = ['#18181b', '#1a3d1a', '#1e3a8a', '#14532d', '#713f12', '#286b31'];

type Format = 'commander' | 'classic';
type SetupPlayer = { name: string; commander: string; image: string | null; color: string };
type StoredCounter = { format: Format; state: LiveGameState; startedAt: string };
type CommanderResult = { id: string; name: string; imageUrl: string | null };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type CounterPreferences = { reducedMotion: boolean; highContrast: boolean; largeText: boolean };
type StoredCounterPreferences = Partial<CounterPreferences> & { schemaVersion?: number };

const DEFAULT_COUNTER_PREFERENCES: CounterPreferences = {
  reducedMotion: false,
  highContrast: false,
  largeText: false,
};

function defaultSetup(index: number): SetupPlayer {
  return { name: `Player ${index + 1}`, commander: '', image: null, color: COLORS[index % COLORS.length] };
}

function oneSeat(width: number, height: number): SquareSeatLayout[] {
  return [{ left: 4, top: 4, width: width - 8, height: height - 72, role: 'bottom' }];
}

function exportRecap(state: LiveGameState, startedAt: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#09090f');
  gradient.addColorStop(1, '#0a1a0d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 630);
  context.fillStyle = '#a7e3ac';
  context.font = '700 28px system-ui';
  context.fillText('21LIFE', 64, 70);
  context.fillStyle = '#ffffff';
  context.font = '900 54px system-ui';
  context.fillText('Riepilogo partita', 64, 136);
  context.fillStyle = '#a1a1aa';
  context.font = '24px system-ui';
  const durationMinutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const winner = getSuggestedWinner(state);
  context.fillText(`${new Date(startedAt).toLocaleString()} · ${durationMinutes} min${winner ? ` · Vincitore: ${winner.displayName}` : ''}`, 64, 178);
  state.players.forEach((player, index) => {
    const x = 64 + (index % 2) * 550;
    const y = 245 + Math.floor(index / 2) * 115;
    context.fillStyle = ['#72d17b', '#22d3ee', '#fb7185', '#fbbf24', '#4ade80', '#f472b6'][index];
    context.fillRect(x, y - 35, 8, 72);
    context.fillStyle = '#ffffff';
    context.font = '800 28px system-ui';
    context.fillText(player.displayName, x + 28, y - 4);
    context.fillStyle = '#d4d4d8';
    context.font = '20px system-ui';
    const commanderDamage = Object.values(player.commanderDamageFrom).reduce((sum, amount) => sum + amount, 0);
    context.fillText(`${player.commander || 'Magic classico'} · Poison ${player.infect} · Cmd ${commanderDamage}`, x + 28, y + 28);
    context.fillStyle = '#ffffff';
    context.font = '900 48px system-ui';
    context.textAlign = 'right';
    context.fillText(String(player.life), x + 510, y + 18);
    context.textAlign = 'left';
  });
  const link = document.createElement('a');
  link.download = `mtg-commander-recap-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function StandaloneCounter() {
  const { copy } = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<Format>('commander');
  const [playerCount, setPlayerCount] = useState(4);
  const [setup, setSetup] = useState(() => Array.from({ length: 6 }, (_, index) => defaultSetup(index)));
  const [state, setState] = useState<LiveGameState | null>(null);
  const [startedAt, setStartedAt] = useState('');
  const [history, setHistory] = useState<LiveGameState[]>([]);
  const [redo, setRedo] = useState<LiveGameState[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [shieldKey, setShieldKey] = useState<ParticipantKey | null>(null);
  const [randomOpen, setRandomOpen] = useState(false);
  const [randomResult, setRandomResult] = useState<string | number | null>(null);
  const [searchIndex, setSearchIndex] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<CommanderResult[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<CounterPreferences>(DEFAULT_COUNTER_PREFERENCES);
  useScreenWakeLock(Boolean(state));

  useEffect(() => {
    navigator.serviceWorker?.register('/counter-sw.js').then((registration) => {
      if (registration.waiting) setUpdateReady(registration.waiting);
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', () => {
          if (registration.waiting) setUpdateReady(registration.waiting);
        });
      });
    }).catch(() => undefined);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredCounter;
        if (stored?.state?.players?.length) {
          setFormat(stored.format);
          setState(parseLiveGameState(stored.state));
          setStartedAt(stored.startedAt);
        }
      } catch { /* Ignore damaged local session. */ }
    }
    try {
      const savedPreferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null') as StoredCounterPreferences | null;
      if (savedPreferences?.schemaVersion === 2) {
        setPreferences({
          reducedMotion: savedPreferences.reducedMotion === true,
          highContrast: savedPreferences.highContrast === true,
          largeText: savedPreferences.largeText === true,
        });
      } else if (savedPreferences) {
        setPreferences({
          reducedMotion: false,
          highContrast: savedPreferences.highContrast === true,
          largeText: savedPreferences.largeText === true,
        });
      }
    } catch { /* Keep safe defaults. */ }
    return () => window.removeEventListener('beforeinstallprompt', captureInstall);
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 2, ...preferences }));
  }, [preferences]);

  useEffect(() => {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ format, state, startedAt } satisfies StoredCounter));
  }, [format, startedAt, state]);

  useEffect(() => {
    if (!state || !hostRef.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }));
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [state]);

  const mutate = (mutation: LiveGameMutation) => {
    if (!state) return;
    setHistory((current) => [...current.slice(-29), state]);
    setRedo([]);
    const next = applyLiveGameMutation(state, {
      ...mutation,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    setState(next);
  };

  const start = async () => {
    const startingLife = format === 'commander' ? 40 : 20;
    const keys = Array.from(
      { length: playerCount },
      (_, index) => `guest:local-${index + 1}` as ParticipantKey,
    );
    const players = keys.map((key, index) => createLiveGamePlayer({
      slot: index,
      participantKey: key,
      deckId: `local-${index + 1}`,
      displayName: setup[index].name.trim() || `Player ${index + 1}`,
      commander: format === 'commander' ? setup[index].commander.trim() || 'Commander' : 'Magic',
      commanderImage: format === 'commander' ? setup[index].image : null,
      backgroundColor: setup[index].color,
      startingLife,
      allParticipantKeys: keys,
    }));
    const nextState = { version: 0, players, events: [], summary: createLiveGameSummary(), layoutVariant: 'classic' } satisfies LiveGameState;
    const nextStartedAt = new Date().toISOString();
    setState(nextState);
    setStartedAt(nextStartedAt);
    setHistory([]);
    setRedo([]);
  };

  const searchCommander = async (index: number, query: string) => {
    setSetup((current) => current.map((player, playerIndex) => playerIndex === index
      ? { ...player, commander: query, image: null } : player));
    setSearchIndex(index);
    if (query.trim().length < 2 || !navigator.onLine) return setSearchResults([]);
    const response = await fetch(`/api/public-commanders?q=${encodeURIComponent(query.trim())}`);
    const payload = await response.json().catch(() => ({ data: [] }));
    setSearchResults(response.ok ? payload.data ?? [] : []);
  };

  if (!state) {
    return <main className={`min-h-dvh bg-[radial-gradient(circle_at_top,#0a1a0d_0,#09090b_48%)] px-4 py-8 text-white ${preferences.reducedMotion ? '[&_*]:!animate-none [&_*]:!transition-none' : ''} ${preferences.highContrast ? 'contrast-125' : ''} ${preferences.largeText ? 'text-lg' : ''}`}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/auth/login" className="inline-flex items-center gap-2 text-sm text-zinc-300"><ArrowLeft className="h-4 w-4" /> Login</Link>
          <div className="flex gap-2"><button aria-label={copy({ it: 'Impostazioni accessibilità', en: 'Accessibility settings' })} className="grid h-8 w-8 place-items-center rounded-full border border-white/10" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /></button>{installPrompt ? <button className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-bold" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>{copy({ it: 'Installa', en: 'Install' })}</button> : null}<span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">{copy({ it: 'Pronto offline', en: 'Offline ready' })}</span></div>
        </div>
        {updateReady ? <button className="w-full rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm font-bold text-amber-100" onClick={() => { updateReady.postMessage('SKIP_WAITING'); location.reload(); }}>Aggiornamento pronto · applica ora</button> : null}
        <header><h1 className="text-4xl font-black">{copy({ it: 'Partita veloce', en: 'Quick game' })}</h1><p className="mt-2 text-zinc-400">{copy({ it: 'Configura giocatori, formato e punti vita iniziali.', en: 'Set up players, format, and starting life.' })}</p></header>
        <section className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            {(['commander', 'classic'] as Format[]).map((value) => <button key={value} onClick={() => setFormat(value)} className={`rounded-2xl border p-4 font-black ${format === value ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/10 bg-white/5'}`}>{value === 'commander' ? 'Commander · 40' : `${copy({ it: 'Magic classico', en: 'Classic Magic' })} · 20`}</button>)}
          </div>
          <div className="mt-5 flex items-center justify-between"><b>{copy({ it: 'Giocatori', en: 'Players' })}</b><div className="flex items-center gap-3"><Button size="icon" variant="outline" onClick={() => setPlayerCount(Math.max(1, playerCount - 1))}><Minus /></Button><strong className="w-8 text-center text-2xl">{playerCount}</strong><Button size="icon" variant="outline" onClick={() => setPlayerCount(Math.min(6, playerCount + 1))}><Plus /></Button></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {setup.slice(0, playerCount).map((player, index) => <div key={index} className="relative rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-400">Player {index + 1}</label>
              <input value={player.name} onChange={(event) => setSetup((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 font-bold outline-none focus:border-emerald-400" />
              {format === 'commander' ? <div className="relative mt-2">
                <input placeholder={copy({ it: 'Cerca comandante…', en: 'Search commander…' })} value={player.commander} onChange={(event) => void searchCommander(index, event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 outline-none focus:border-emerald-400" />
                {searchIndex === index && searchResults.length ? <div className="absolute inset-x-0 top-12 z-30 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">{searchResults.map((result) => <button key={result.id} onClick={() => { setSetup((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, commander: result.name, image: result.imageUrl } : item)); setSearchResults([]); }} className="flex w-full items-center gap-3 border-b border-white/5 p-2 text-left hover:bg-white/5"><DeckImage src={result.imageUrl} alt={result.name} className="h-12 w-9 rounded object-cover" /><span className="text-sm font-bold">{result.name}</span></button>)}</div> : null}
              </div> : null}
              <div className="mt-3 flex gap-2">{COLORS.map((color) => <button key={color} aria-label={color} onClick={() => setSetup((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color, image: null } : item))} className={`h-7 flex-1 rounded-full border ${player.color === color && !player.image ? 'border-white ring-2 ring-emerald-400' : 'border-white/10'}`} style={{ backgroundColor: color }} />)}</div>
            </div>)}
          </div>
          <Button onClick={() => void start()} className="mt-6 h-14 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-lg font-black">{copy({ it: 'Avvia partita', en: 'Start game' })}</Button>
        </section>
        {settingsOpen ? <ModalOverlay><ModalCard><div className="space-y-4 p-5"><h2 className="text-xl font-black">{copy({ it: 'Accessibilità', en: 'Accessibility' })}</h2>{([['reducedMotion', copy({ it: 'Riduci animazioni', en: 'Reduce motion' })], ['highContrast', copy({ it: 'Contrasto alto', en: 'High contrast' })], ['largeText', copy({ it: 'Testo grande', en: 'Large text' })]] as const).map(([key, label]) => <div key={key} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3"><div className="flex-1"><b className="block">{label}</b><small className="text-zinc-400">{copy({ it: 'Disattivato di default', en: 'Off by default' })}</small></div><button onClick={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))} className={`h-8 w-14 rounded-full p-1 ${preferences[key] ? 'bg-emerald-600' : 'bg-zinc-700'}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${preferences[key] ? 'translate-x-6' : ''}`} /></button></div>)}<Button className="w-full" onClick={() => setSettingsOpen(false)}>{copy({ it: 'Chiudi', en: 'Close' })}</Button></div></ModalCard></ModalOverlay> : null}
      </div>
    </main>;
  }

  const orientation = getViewportTableOrientation(size.width, size.height);
  const layouts = state.players.length === 1 ? oneSeat(size.width, size.height) : getSquareTableLayouts(state.players.length, size.width, size.height, 'classic', orientation);
  const assignments = mapPlayersToSeats(state.players, layouts, null);
  const toolbar = state.players.length === 1 ? null : getCenterToolbarBand(state.players.length, size.width, size.height, 'classic', orientation);
  const shieldPlayer = state.players.find((player) => player.participantKey === shieldKey) ?? null;
  const counterRows: Array<[PlayerCounter, string]> = [['energy', 'Energia'], ['experience', 'Esperienza'], ['commanderTax', 'Commander Tax']];

  return <main ref={hostRef} data-reduced-motion={preferences.reducedMotion || undefined} className="fixed inset-0 select-none overflow-hidden bg-black text-white">
    {size.width > 0 && assignments.map(({ player, layout }) => {
      const rotation = orientation === 'landscape' ? getLandscapeSeatRotation(layout, size.width) : getSeatRotation(layout.role, state.players.length);
      const sideways = Math.abs(rotation) === 90;
      const contentWidth = sideways ? layout.height : layout.width;
      const contentHeight = sideways ? layout.width : layout.height;
      const shortest = Math.min(contentWidth, contentHeight);
      return <section key={player.participantKey} className="absolute overflow-hidden rounded-2xl border-2 border-black bg-zinc-950" style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height, backgroundColor: player.backgroundColor ?? '#18181b' }}>
        {player.commanderImage ? <DeckImage src={player.commanderImage} alt={player.commander} className="absolute inset-0 h-full w-full rounded-none object-cover opacity-70" /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/55" />
        <div className="absolute left-1/2 top-1/2" style={{ width: contentWidth, height: contentHeight, transform: `translate(-50%,-50%) rotate(${rotation}deg)` }}>
          <HoldActionButton variant="ghost" onShort={() => mutate({ type: 'adjust', targetKey: player.participantKey, amount: 1, mode: 'life' })} onLong={() => mutate({ type: 'adjust', targetKey: player.participantKey, amount: 10, mode: 'life' })} className="absolute left-[5%] top-1/2 z-10 grid h-14 w-16 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-3xl"><Minus /></HoldActionButton>
          <HoldActionButton variant="ghost" onShort={() => mutate({ type: 'adjust', targetKey: player.participantKey, amount: -1, mode: 'life' })} onLong={() => mutate({ type: 'adjust', targetKey: player.participantKey, amount: -10, mode: 'life' })} className="absolute right-[5%] top-1/2 z-10 grid h-14 w-16 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-3xl"><Plus /></HoldActionButton>
          <div className="pointer-events-none absolute left-1/2 top-[8%] max-w-[70%] -translate-x-1/2 truncate rounded-full border border-white/15 bg-black/65 px-4 py-1 font-black">{player.displayName}</div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <LifeReadout life={player.life} className="font-black leading-none drop-shadow-xl" style={{ fontSize: Math.max(52, Math.min(110, shortest * .3)) }} />
          </div>
          <button onClick={() => setShieldKey(player.participantKey)} className="absolute left-1/2 top-[74%] grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full border border-emerald-200/30 bg-black/65"><Shield /></button>
        </div>
      </section>;
    })}
    <div className="absolute z-40 flex items-center justify-center gap-1 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl" style={toolbar ? { left: toolbar.left, top: toolbar.top, width: toolbar.width, height: toolbar.height, flexDirection: toolbar.axis === 'vertical' ? 'column' : 'row' } : { left: 8, right: 8, bottom: 8, height: 56 }}>
      <Button size="icon" variant="ghost" onClick={() => setConfirmExit(true)}><ArrowLeft /></Button>
      <Button size="icon" variant="ghost" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (!previous) return; setRedo((current) => [...current, state]); setState(previous); setHistory((current) => current.slice(0, -1)); }}><RotateCcw /></Button>
      <Button size="icon" variant="ghost" disabled={!redo.length} onClick={() => { const next = redo.at(-1); if (!next) return; setHistory((current) => [...current, state]); setState(next); setRedo((current) => current.slice(0, -1)); }}><RotateCcw className="-scale-x-100" /></Button>
      <Button size="icon" variant="ghost" onClick={() => setRandomOpen(true)}><Dices /></Button>
      <Button size="icon" variant="ghost" onClick={() => exportRecap(state, startedAt)}><Download /></Button>
    </div>

    {randomOpen ? <ModalOverlay><ModalCard><div className="space-y-5 p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{copy({ it: 'Dado o moneta', en: 'Die or coin' })}</h2><button onClick={() => setRandomOpen(false)}>×</button></div><div className="grid grid-cols-4 gap-2">{([['coin', copy({ it: 'Moneta', en: 'Coin' })], ['d4', 'd4'], ['d6', 'd6'], ['d20', 'd20']] as Array<[TableRandomKind, string]>).map(([kind, label]) => <button key={kind} onClick={() => setRandomResult(rollTableRandom(kind))} className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 font-black">{label}</button>)}</div>{randomResult !== null ? <div className="rounded-3xl bg-black/35 p-8 text-center text-7xl font-black text-emerald-200">{randomResult === 'heads' ? copy({ it: 'Testa', en: 'Heads' }) : randomResult === 'tails' ? copy({ it: 'Croce', en: 'Tails' }) : randomResult}</div> : null}</div></ModalCard></ModalOverlay> : null}
    {confirmExit ? <ModalOverlay><ModalCard><div className="space-y-4 p-5"><h2 className="text-xl font-black">Terminare la partita veloce?</h2><p className="text-sm text-zinc-400">Potrai esportare il riepilogo prima di uscire.</p><div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setConfirmExit(false)}>Continua</Button><Button variant="destructive" className="flex-1" onClick={() => { localStorage.removeItem(STORAGE_KEY); setState(null); setConfirmExit(false); }}>Termina</Button></div></div></ModalCard></ModalOverlay> : null}

    {shieldPlayer ? <ModalOverlay><ModalCard size="lg"><div className="space-y-4 overflow-y-auto p-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">{shieldPlayer.displayName}</h2><p className="text-xs text-zinc-400">Segnalini e stato</p></div><button onClick={() => setShieldKey(null)}>×</button></div>
      <div className="grid grid-cols-2 gap-3">{([['monarch', 'Monarca', Crown], ['initiative', 'Iniziativa', Swords]] as Array<[PlayerEmblem, string, typeof Crown]>).map(([emblem, label, Icon]) => <button key={emblem} onClick={() => mutate({ type: 'set_emblem', targetKey: shieldPlayer.participantKey, emblem, active: !shieldPlayer.counters[emblem] })} className={`rounded-2xl border p-4 text-left ${shieldPlayer.counters[emblem] ? 'border-amber-300 bg-amber-500/20' : 'border-white/10 bg-white/5'}`}><Icon className="mb-3" /><b>{label}</b></button>)}</div>
      <div className="space-y-2">{counterRows.filter(([counter]) => format === 'commander' || counter !== 'commanderTax').map(([counter, label]) => <div key={counter} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"><Sparkles className="text-emerald-300" /><b className="flex-1">{label}</b><HoldActionButton size="icon" variant="outline" onShort={() => mutate({ type: 'adjust_counter', targetKey: shieldPlayer.participantKey, counter, amount: -1 })} onLong={() => mutate({ type: 'adjust_counter', targetKey: shieldPlayer.participantKey, counter, amount: -10 })}><Minus /></HoldActionButton><strong className="w-8 text-center text-xl">{shieldPlayer.counters[counter]}</strong><HoldActionButton size="icon" variant="outline" onShort={() => mutate({ type: 'adjust_counter', targetKey: shieldPlayer.participantKey, counter, amount: 1 })} onLong={() => mutate({ type: 'adjust_counter', targetKey: shieldPlayer.participantKey, counter, amount: 10 })}><Plus /></HoldActionButton></div>)}</div>
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3"><Shield className="text-emerald-300" /><b className="flex-1">{format === 'commander' ? 'Infect' : 'Poison'}</b><HoldActionButton size="icon" variant="outline" onShort={() => mutate({ type: 'adjust', targetKey: shieldPlayer.participantKey, amount: -1, mode: 'infect' })} onLong={() => mutate({ type: 'adjust', targetKey: shieldPlayer.participantKey, amount: -10, mode: 'infect' })}><Minus /></HoldActionButton><strong className="w-8 text-center text-xl">{shieldPlayer.infect}</strong><HoldActionButton size="icon" variant="outline" onShort={() => mutate({ type: 'adjust', targetKey: shieldPlayer.participantKey, amount: 1, mode: 'infect' })} onLong={() => mutate({ type: 'adjust', targetKey: shieldPlayer.participantKey, amount: 10, mode: 'infect' })}><Plus /></HoldActionButton></div>
    </div></ModalCard></ModalOverlay> : null}
  </main>;
}
