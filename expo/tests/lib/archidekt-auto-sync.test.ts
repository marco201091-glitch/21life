import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  fetchCommanderArtOptions: vi.fn(),
  repairImportedCommanderOptions: vi.fn(),
  resolveImportedDeckCommanderImage: vi.fn(),
  pendingRequests: [] as Array<{ id: string }>,
  deleteIn: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiPost: mocks.apiPost }));
vi.mock('@/lib/commander-arts', () => ({
  fetchCommanderArtOptions: mocks.fetchCommanderArtOptions,
}));
vi.mock('@/lib/deck-importers', () => ({
  deckDataToColorFields: () => ({
    color_identity: ['U'],
    commander_options: [{ name: 'Talrand', imageUrl: 'image' }],
    commander_cmc: null,
  }),
  getDefaultImportedCommanderOption: () => ({ name: 'Talrand', imageUrl: 'image' }),
  repairImportedCommanderOptions: mocks.repairImportedCommanderOptions,
  resolveImportedDeckCommanderImage: mocks.resolveImportedDeckCommanderImage,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => table === 'profiles'
      ? { select: () => ({ eq: () => ({ single: mocks.single }) }) }
      : {
        select: () => ({ eq: async () => ({ data: mocks.pendingRequests, error: null }) }),
        delete: () => ({ eq: () => ({ in: mocks.deleteIn }) }),
      },
    rpc: mocks.rpc,
  },
}));

import {
  processArchidektSyncRequests,
  runArchidektAutoSync,
  syncArchidektUserDecks,
} from '@/lib/archidekt-auto-sync';

describe('Archidekt automatic sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repairImportedCommanderOptions.mockResolvedValue([
      { name: 'Talrand', imageUrl: 'image' },
    ]);
    mocks.resolveImportedDeckCommanderImage.mockReturnValue('image');
    mocks.pendingRequests = [];
    mocks.deleteIn.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({
      data: { inserted: 1, updated: 0 },
      error: null,
    });
  });

  it('imports public Commander decks through the atomic RPC', async () => {
    mocks.apiPost.mockResolvedValue({
      status: 200,
      data: {
        decks: [{
          name: 'Talrand Control',
          commander: 'Talrand, Sky Summoner',
          commanderImageUrl: 'image',
          commanderOptions: [{ name: 'Talrand', imageUrl: 'image' }],
          colorIdentity: ['U'],
          bracket: '3',
          sourceUrl: 'https://archidekt.com/decks/123',
          sourceType: 'archidekt',
        }],
      },
    });

    await expect(syncArchidektUserDecks('marco')).resolves.toEqual({
      inserted: 1,
      updated: 0,
      skipped: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('sync_archidekt_decks', {
      p_decks: [expect.objectContaining({
        name: 'Talrand Control',
        commander: 'Talrand',
        source_type: 'archidekt',
      })],
    });
  });

  it('keeps checking globally but skips a recent completed sync', async () => {
    mocks.single.mockResolvedValue({
      data: {
        archidekt_username: 'marco',
        archidekt_auto_import: true,
        archidekt_last_sync_at: new Date().toISOString(),
      },
      error: null,
    });

    await expect(runArchidektAutoSync('user-id')).resolves.toEqual({
      inserted: 0,
      updated: 0,
      skipped: 0,
    });
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('forces the first import immediately after settings are saved', async () => {
    mocks.single.mockResolvedValue({
      data: {
        archidekt_username: 'marco',
        archidekt_auto_import: true,
        archidekt_last_sync_at: new Date().toISOString(),
      },
      error: null,
    });
    mocks.apiPost.mockResolvedValue({ status: 200, data: { decks: [] } });
    mocks.rpc.mockResolvedValue({
      data: { inserted: 0, updated: 0 },
      error: null,
    });

    await runArchidektAutoSync('user-id', { force: true });
    expect(mocks.apiPost).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('sync_archidekt_decks', { p_decks: [] });
  });

  it('processes live-game requests with a forced sync and clears them', async () => {
    mocks.pendingRequests = [{ id: 'request-1' }, { id: 'request-2' }];
    mocks.single.mockResolvedValue({
      data: {
        archidekt_username: 'marco',
        archidekt_auto_import: true,
        archidekt_last_sync_at: new Date().toISOString(),
      },
      error: null,
    });
    mocks.apiPost.mockResolvedValue({ status: 200, data: { decks: [] } });

    await expect(processArchidektSyncRequests('user-id')).resolves.toBeUndefined();

    expect(mocks.apiPost).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('sync_archidekt_decks', { p_decks: [] });
    expect(mocks.deleteIn).toHaveBeenCalledWith('id', ['request-1', 'request-2']);
  });
});
