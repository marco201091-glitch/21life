import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { CommanderPicker } from '@/components/commander/commander-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/language-context';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { createOccasionalDeck } from '@/lib/occasional-decks';
import { buildPairedCommanderColorFields, buildPairedCommanderName } from '@/lib/commander-partners';
import type { CommanderSearchResult } from '@/lib/commander-types';
import type { MemberDeck } from '@/lib/types/arena';

export function OccasionalDeckForm({ groupId, userId, onCreated, selectedDeckId, onSavingChange, disabled = false }: {
  groupId: string; userId: string; onCreated: (deck: MemberDeck) => void; selectedDeckId?: string; onSavingChange?: (saving: boolean) => void; disabled?: boolean;
}) {
  const { copy, language } = useLanguage();
  const it = language === 'it';
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [commander, setCommander] = useState<CommanderSearchResult | null>(null);
  const [partner, setPartner] = useState<CommanderSearchResult | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [bracket, setBracket] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  const pending = useRef(false);
  const openedDeck = useRef(selectedDeckId);
  useEffect(() => {
    if (openedDeck.current !== selectedDeckId && !saving) setOpen(false);
  }, [selectedDeckId, saving]);
  const save = async () => {
    if (!commander || pending.current || disabled) return;
    pending.current = true;
    setSaving(true); onSavingChange?.(true); setError('');
    const fields = buildPairedCommanderColorFields(commander, partner);
    const commanderName = buildPairedCommanderName(commander, partner);
    const input = { groupId, userId, name: name.trim() || commanderName, commander: commanderName,
      commanderImage: art ?? commander.imageUrl, colorIdentity: fields.color_identity || [],
      commanderOptions: fields.commander_options || [], bracket: bracket || null };
    const fingerprint = JSON.stringify(input);
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { id: randomUUID(), fingerprint };
    try {
      const deck = await createOccasionalDeck(supabase, { ...input, id: request.current.id });
      onCreated(deck); setOpen(false); setName(''); setCommander(null); setPartner(null); setArt(null); setBracket(''); request.current = null;
    } catch {
      setError(it ? 'Creazione non riuscita. Controlla la connessione e riprova.' : 'Unable to create deck. Check your connection and retry.');
    } finally { pending.current = false; setSaving(false); onSavingChange?.(false); }
  };
  return <View style={styles.form}>
    <Button variant="ghost" label={it ? 'Mazzo occasionale' : 'Occasional deck'} disabled={saving || disabled} onPress={() => { openedDeck.current = selectedDeckId; setOpen(!open); }} />
    {open ? <>
      <Text style={styles.hint}>{it ? 'Solo per questa arena. Richiede una connessione.' : 'Only for this arena. Creation requires a connection.'}</Text>
      <CommanderPicker deckName={name} onDeckNameChange={setName} selectedCommander={commander} onSelectCommander={setCommander}
        selectedPartnerCommander={partner} onSelectPartnerCommander={setPartner} selectedArtUrl={art} onSelectArtUrl={setArt} disabled={saving || disabled}
        labels={{ deckName: copy('deckName'), deckNamePlaceholder: copy('deckName'), searchCommander: copy('searchCommander'), searchPlaceholder: copy('searchCommander'), searching: copy('searching'), noResults: it ? 'Nessun risultato' : 'No results', selectedCommander: copy('selectedCommander'), partnerHint: copy('partnerHint'), chooseCommanderArt: copy('chooseCommanderArt'), loadingArts: copy('loadingArts'), noArtsFound: copy('noArtsFound'), printing: copy('printing') }} />
      <Input label="Bracket (1-5)" value={bracket} onChangeText={value => setBracket(value.replace(/[^1-5]/g, '').slice(0, 1))} editable={!saving && !disabled} keyboardType="number-pad" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label={saving ? (it ? 'Creazione...' : 'Creating...') : (it ? 'Crea e seleziona' : 'Create and select')} onPress={save} disabled={saving || disabled || !commander} />
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ form: { gap: spacing.sm }, hint: { color: colors.muted, fontSize: 12 }, error: { color: colors.foreground } });
