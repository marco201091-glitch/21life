'use client';

import { BarChart3, Crosshair, Shield, Skull, Swords } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { formatGameDuration } from '@/lib/live-game-duration';
import type { DeckPerformanceStats } from '@/lib/deck-performance-analytics';

export function DeckPerformancePanel({ performance }: { performance: DeckPerformanceStats | undefined }) {
  const { copy: t } = useLanguage();
  const gamesPlayed = performance?.gamesPlayed ?? 0;
  const wins = performance?.wins ?? 0;
  const draws = performance?.draws ?? 0;
  const losses = performance?.losses ?? 0;
  const winRate = performance?.winRate ?? 0;
  return <>
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-emerald-300" />{t({ it: 'Impronta del mazzo', en: 'Deck fingerprint' })}</h3>
                    <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-background/35 to-cyan-500/5 p-4 sm:grid-cols-[9rem_1fr]">
                      <div className="flex flex-col items-center justify-center">
                        <div className="grid h-28 w-28 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 ${winRate}%, #475569 ${winRate}% ${Math.max(winRate, winRate + (draws / Math.max(gamesPlayed, 1)) * 100)}%, #1e293b 0)` }}>
                          <div className="grid h-20 w-20 place-items-center rounded-full bg-card text-center shadow-inner">
                            <strong className="text-2xl text-emerald-300">{winRate}%</strong>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">win rate</span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{gamesPlayed} {t({ it: 'partite', en: 'games' })}</p>
                      </div>
                      <div className="space-y-3 self-center">
                        {[
                          [t({ it: 'Vittorie', en: 'Wins' }), wins, 'bg-emerald-400'],
                          [t({ it: 'Patte', en: 'Draws' }), draws, 'bg-cyan-400'],
                          [t({ it: 'Sconfitte', en: 'Losses' }), losses, 'bg-slate-500'],
                        ].map(([label, value, color]) => (
                          <div key={String(label)}>
                            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{value}</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / Math.max(gamesPlayed, 1)) * 100}%` }} /></div>
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                          <div className="rounded-lg bg-background/45 p-2"><p className="text-[10px] uppercase text-muted-foreground">{t({ it: 'Podî', en: 'Podiums' })}</p><p className="font-bold text-foreground">{wins + (performance?.secondPlaces ?? 0)}</p></div>
                          <div className="rounded-lg bg-background/45 p-2"><p className="text-[10px] uppercase text-muted-foreground">{t({ it: 'Vittoria tipica', en: 'Typical win' })}</p><p className="font-bold text-foreground">{performance?.medianWinningDurationSeconds != null ? formatGameDuration(performance.medianWinningDurationSeconds) : '—'}</p></div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><Crosshair className="h-4 w-4 text-rose-300" />{t({ it: 'Performance realtime', en: 'Realtime performance' })}</h3>
                    {performance?.trackedGames ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          [t({ it: 'Danni inflitti', en: 'Damage dealt' }), performance.totalDamageDealt, Swords],
                          ['KO', performance.eliminations, Crosshair],
                          [t({ it: 'Danno commander', en: 'Commander damage' }), performance.commanderDamageDealt, Shield],
                          [t({ it: 'Infect inflitto', en: 'Infect dealt' }), performance.infectDealt, Skull],
                        ].map(([label, value, MetricIcon]) => {
                          const Icon = MetricIcon as typeof Swords;
                          return (
                            <div key={String(label)} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/25 p-3">
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div><p className="text-xs text-muted-foreground">{label as string}</p><p className="font-bold text-foreground">{value as number}</p></div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-border/70 bg-background/25 p-4 text-sm text-muted-foreground">
                        {t({ it: 'Nessuna partita realtime tracciata con questo mazzo.', en: 'No realtime-tracked games with this deck yet.' })}
                      </p>
                    )}
                  </section>

                  {performance?.gamesPlayed ? (
                    <div className="rounded-xl border border-border/60 bg-background/20 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t({ it: 'Copertura tracking', en: 'Tracking coverage' })}</span>
                        <span>{performance.trackedGames}/{performance.gamesPlayed} · {performance.trackingCoverage}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${performance.trackingCoverage}%` }} />
                      </div>
                    </div>
                  ) : null}
  </>;
}
