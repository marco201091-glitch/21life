'use client';

import { Swords, Target, Trophy, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/components/language-provider';
import type { DeckPerformanceStats } from '@/lib/deck-performance-analytics';

export function ArenaDeckSummary({ visibleDeckStats, totalDecks }: { visibleDeckStats: DeckPerformanceStats[]; totalDecks: number }) {
  const { copy: t } = useLanguage();
  return (
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <Trophy className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Miglior mazzo', en: 'Best Deck' })}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground truncate">{visibleDeckStats[0]?.name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{visibleDeckStats[0]?.ownerDisplayName || '-'}</p>
                      {visibleDeckStats[0]?.bracket && (
                        <p className="text-xs text-emerald-300">
                          {t({ it: 'Bracket', en: 'Bracket' })} {visibleDeckStats[0].bracket}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">{visibleDeckStats[0]?.winRate ?? 0}% {t({ it: 'win rate', en: 'win rate' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Swords className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Mazzi unici', en: 'Unique Decks' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{totalDecks}</p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'mazzi tracciati', en: 'tracked decks' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Target className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Piu giocato', en: 'Most Played' })}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground truncate">
                        {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.name || '-'}
                      </p>
                      {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.bracket && (
                        <p className="text-xs text-emerald-300">
                          {t({ it: 'Bracket', en: 'Bracket' })} {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0].bracket}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.gamesPlayed || 0} {t({ it: 'partite', en: 'games' })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <TrendingUp className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Win rate medio', en: 'Avg Win Rate' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {visibleDeckStats.length > 0 ? Math.round(visibleDeckStats.reduce((a, b) => a + b.winRate, 0) / visibleDeckStats.length) : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'su tutti i mazzi', en: 'across all decks' })}</p>
                    </CardContent>
                  </Card>
                </div>
  );
}
