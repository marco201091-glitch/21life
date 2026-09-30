'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArchiveRestore, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeckImage } from '@/components/deck-image';
import { ManaColorPills } from '@/components/ui/mana-color-pills';
import { useLanguage } from '@/components/language-provider';
import { useToast } from '@/hooks/use-toast';
import { getDeckDisplayColors } from '@/lib/deck-metadata';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';

type ArchivedDeck = {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  commander: string;
  commander_image: string | null;
  source_type: string | null;
  bracket: string | null;
  color_identity: string[] | null;
  is_archived: boolean;
};

export default function ArchivedDecksPage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const router = useRouter();
  const [decks, setDecks] = useState<ArchivedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const text = (it: string, en: string) => language === 'it' ? it : en;

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, router, user]);
  const fetchArchived = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('decks')
      .select('id, user_id, group_id, name, commander, commander_image, source_type, bracket, color_identity, is_archived')
      .eq('user_id', user.id).is('group_id', null).eq('is_archived', true)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: language === 'it' ? 'Errore' : 'Error', description: getSupabaseErrorMessage(error, language === 'it' ? 'Caricamento non riuscito' : 'Could not load archived decks'), variant: 'destructive' });
    } else {
      setDecks((data || []) as ArchivedDeck[]);
    }
    setLoading(false);
  }, [language, toast, user]);

  useEffect(() => { void fetchArchived(); }, [fetchArchived]);

  const restore = async (deck: ArchivedDeck) => {
    if (!user || deck.user_id !== user.id || restoringId) return;
    setRestoringId(deck.id);
    try {
      const { error } = await supabase.from('decks').update({ is_archived: false })
        .eq('id', deck.id).eq('user_id', user.id).is('group_id', null);
      if (error) throw error;
      setDecks((current) => current.filter((entry) => entry.id !== deck.id));
      toast({ title: text('Mazzo ripristinato', 'Deck restored') });
    } catch (error) {
      toast({ title: text('Errore', 'Error'), description: getSupabaseErrorMessage(error, text('Ripristino non riuscito', 'Could not restore deck')), variant: 'destructive' });
    } finally {
      setRestoringId(null);
    }
  };

  if (authLoading) return <main className="min-h-screen bg-background px-4 py-24 text-foreground"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></main>;
  if (!user) return null;
  if (loading) return <main className="min-h-screen bg-background px-4 py-24 text-foreground"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></main>;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-4xl space-y-6">
        <Button asChild variant="ghost"><Link href="/profile"><ArrowLeft className="mr-2 h-4 w-4" />{text('Profilo', 'Profile')}</Link></Button>
        <header><h1 className="text-3xl font-bold">{text('Mazzi archiviati', 'Archived decks')}</h1><p className="mt-2 text-muted-foreground">{text('Questi mazzi sono nascosti dal profilo; lo storico partite resta intatto.', 'These decks are hidden from your profile; match history remains intact.')}</p></header>
        {decks.length === 0 ? <Card className="phyrexian-panel"><CardContent className="py-12 text-center text-muted-foreground">{text('Nessun mazzo archiviato.', 'No archived decks.')}</CardContent></Card> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {decks.map((deck) => <Card key={deck.id} className="phyrexian-panel overflow-hidden">
              <div className="relative h-44"><DeckImage src={deck.commander_image} alt={deck.commander} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" /><div className="absolute inset-x-4 bottom-3"><p className="font-bold">{deck.name}</p><p className="text-sm text-white/75">{deck.commander}</p></div></div>
              <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>{deck.source_type || text('Manuale', 'Manual')}</span><ManaColorPills colors={getDeckDisplayColors(deck)} /></CardTitle></CardHeader>
              <CardContent className="flex justify-end pt-0"><Button variant="outline" disabled={restoringId === deck.id} onClick={() => void restore(deck)}><ArchiveRestore className="mr-2 h-4 w-4" />{restoringId === deck.id ? text('Ripristino...', 'Restoring...') : text('Ripristina', 'Restore')}</Button></CardContent>
            </Card>)}
          </div>
        )}
      </div>
    </main>
  );
}
