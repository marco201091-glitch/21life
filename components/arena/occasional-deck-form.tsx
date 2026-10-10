'use client';

import { useRef, useState } from 'react';
import { GuestCommanderPicker } from './guest-commander-picker';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { supabase } from '@/lib/supabase';
import { createOccasionalDeck } from '@/lib/occasional-decks';
import { buildPairedCommanderName, buildPairedCommanderColorFields } from '@/lib/commander-partners';
import type { CommanderSearchResult } from '@/lib/scryfall';
import type { MemberDeck } from '@/expo/lib/types/arena';

export function OccasionalDeckForm({ groupId, userId, onCreated, onBusyChange, disabled = false }: {
  groupId: string; userId: string; onCreated: (deck: MemberDeck) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const { copy } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [commander, setCommander] = useState<CommanderSearchResult | null>(null);
  const [partner, setPartner] = useState<CommanderSearchResult | null>(null);
  const [bracket, setBracket] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  const pending = useRef(false);
  const create = async () => {
    if (!commander || !name.trim() || pending.current || disabled) return;
    const fingerprint = JSON.stringify({ name, commander, partner, bracket });
    if (request.current?.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const deck = await createOccasionalDeck(supabase, {
        id: request.current.id, groupId, userId, name: name.trim(),
        commander: buildPairedCommanderName(commander, partner),
        commanderImage: commander.imageUrl,
        colorIdentity: buildPairedCommanderColorFields(commander, partner).color_identity ?? [],
        commanderOptions: buildPairedCommanderColorFields(commander, partner).commander_options ?? undefined,
        bracket: bracket || null,
      });
      onCreated(deck);
      setOpen(false);
      request.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy({ en: 'Could not create deck. Check your connection and retry.', it: 'Impossibile creare il mazzo. Controlla la connessione e riprova.' }));
    } finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  };
  return <div className="my-3 space-y-3">
    <Button type="button" variant="outline" onClick={() => { if (!busy && !disabled) setOpen(!open); }} disabled={busy || disabled} aria-expanded={open}>
      {copy({ en: 'Occasional deck', it: 'Mazzo occasionale' })}
    </Button>
    {open && <div className="space-y-3 rounded-xl border border-border p-3">
      <GuestCommanderPicker deckName={name} onDeckNameChange={setName} selectedCommander={commander}
        onSelectCommander={setCommander} selectedPartnerCommander={partner} onSelectPartnerCommander={setPartner} disabled={busy || disabled} />
      <label className="block text-sm">{copy({ en: 'Bracket (optional)', it: 'Bracket (opzionale)' })}
        <select value={bracket} disabled={busy || disabled} onChange={event => setBracket(event.target.value)} className="ml-2 rounded border border-border bg-card p-2">
          <option value="">—</option>{['1', '2', '3', '4', '5'].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <Button type="button" onClick={() => void create()} disabled={busy || disabled || !commander || !name.trim()}>
        {busy ? copy({ en: 'Creating...', it: 'Creazione...' }) : copy({ en: 'Use this deck', it: 'Usa questo mazzo' })}
      </Button>
    </div>}
  </div>;
}
