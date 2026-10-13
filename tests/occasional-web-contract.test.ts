import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
it('offers registered players occasional decks in manual and historical editing', () => {
  const page = read('app/table/[id]/page.tsx');
  expect(page.match(/<OccasionalDeckForm/g)?.length).toBe(2);
  expect(page).toContain('p.decks?.source_type');
  expect(page).toContain("deck.source_type !== 'occasional'");
});
it('offers inline live creation while excluding occasional decks from automatic selection', () => {
  const live = read('components/live-game/web-live-game.tsx');
  expect(live).toContain('<OccasionalDeckForm');
  expect(live).toContain('!deck.isOccasional');
  expect(read('app/table/[id]/play/page.tsx')).toContain(".is('group_id', null)");
});
